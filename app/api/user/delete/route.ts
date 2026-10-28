import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserAdminStatus, hasAdminAccessByEmail, hasSuperAdminAccessByEmail } from "@/lib/admin";
import { db } from "@/prisma/client";
import { compare } from "bcrypt";
import { Prisma } from "@prisma/client";

async function deleteUserAndRelations(userId: string) {
    await db.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!user) throw new Error("USER_NOT_FOUND");
        const ownedGyms = await tx.gymAccess.findMany({
            where: { userId },
            select: { gymId: true },
        });

        // Keep the user record and LandingEvent relationship for accurate
        // historical analytics, while removing access and personal app data.
        await tx.session.deleteMany({ where: { userId } });
        await tx.account.deleteMany({ where: { userId } });
        await tx.gymFavorite.deleteMany({ where: { userId } });
        await tx.gymClaim.deleteMany({ where: { claimantId: userId } });
        await tx.gymClaim.updateMany({ where: { reviewedById: userId }, data: { reviewedById: null } });
        await tx.gymInvite.deleteMany({ where: { createdById: userId } });
        await tx.gymAccess.deleteMany({ where: { userId } });
        await tx.nutritionEntry.deleteMany({ where: { userId } });
        await tx.nutritionCustomFood.deleteMany({ where: { userId } });
        await tx.bodyweightEntry.deleteMany({ where: { userId } });
        await tx.nutritionSettings.deleteMany({ where: { userId } });
        if (user.email) {
            await tx.verificationToken.deleteMany({ where: { identifier: user.email } });
            await tx.pendingSignup.deleteMany({ where: { email: user.email } });
        }
        await tx.user.update({
            where: { id: userId },
            // Retain the password hash so a superadmin can recover the same
            // account without requiring an email or password-reset flow.
            data: { role: "TRAINEE", isAdmin: false, deletedAt: new Date() },
        });

        // A verified listing remains claimed only while at least one gym user
        // has access. When its final owner is deleted, return the listing to a
        // clean, reusable unverified state and invalidate all old claim links.
        for (const { gymId } of ownedGyms) {
            const remainingOwners = await tx.gymAccess.count({ where: { gymId } });
            if (remainingOwners > 0) continue;
            await tx.gym.update({ where: { id: gymId }, data: { isVerified: false, verifiedAt: null, verifiedByEmail: null, verificationRequired: false, verificationSections: [], verificationBaseline: Prisma.JsonNull } });
            await tx.gymClaim.deleteMany({ where: { gymId } });
            await tx.gymInvite.deleteMany({ where: { gymId } });
        }
    });
}

export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const password = body?.password;
    const targetUserId = body?.targetUserId?.trim();
    const targetEmail =
        typeof body?.targetEmail === "string" ? body.targetEmail.trim().toLowerCase() : undefined;

    const requester = await db.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, password: true, email: true, isAdmin: true },
    });

    if (!requester) {
        return NextResponse.json({ message: "User not found." }, { status: 404 });
    }

    const hasAdminPrivileges = await hasAdminAccessByEmail(requester.email);
    const hasSuperAdminPrivileges = await hasSuperAdminAccessByEmail(requester.email);

    let targetId = requester.id;
    if (targetUserId || targetEmail) {
        if (!password) {
            return NextResponse.json({ message: "Password is required." }, { status: 400 });
        }
        if (!requester.password) {
            return NextResponse.json(
                { message: "This account does not have a password set. Please contact support." },
                { status: 400 },
            );
        }
        if (!(await compare(password, requester.password))) {
            return NextResponse.json({ message: "Incorrect password." }, { status: 401 });
        }
        if (!hasAdminPrivileges) {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }
        if (!hasSuperAdminPrivileges) {
            return NextResponse.json({ message: "Only the super admin can delete other users." }, { status: 403 });
        }

        const targetUser = await db.user.findFirst({
            where: {
                OR: [
                    ...(targetUserId ? [{ id: targetUserId }] : []),
                    ...(targetEmail ? [{ email: targetEmail }] : []),
                ],
            },
            select: { id: true, email: true, isAdmin: true },
        });

        if (!targetUser) {
            return NextResponse.json({ message: "Target user not found." }, { status: 404 });
        }

        if (getUserAdminStatus(targetUser)) {
            return NextResponse.json(
                { message: "Admins cannot delete other admin accounts." },
                { status: 403 },
            );
        }

        targetId = targetUser.id;
    }

    await deleteUserAndRelations(targetId);

    const deletedSelf = targetId === requester.id;
    const message = deletedSelf ? "Account deleted." : "Target user deleted.";

    return NextResponse.json({ message }, { status: 200 });
}
