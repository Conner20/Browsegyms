import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hasAdminAccessByEmail } from "@/lib/admin";
import { cleanGymInput, gymListingUniquenessErrors, validateCompleteGymInput } from "@/lib/gyms";
import { changedGymSections } from "@/lib/gym-verification";
import { db } from "@/prisma/client";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !(await hasAdminAccessByEmail(session.user.email))) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const gym = await db.gym.findUnique({ where: { id }, include: { _count: { select: { access: true } } } });
    if (!gym) return NextResponse.json({ message: "Gym not found." }, { status: 404 });
    return NextResponse.json({ gym: { ...gym, isClaimed: gym._count.access > 0 } });
}

export async function PATCH(req: Request, { params }: Context) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !(await hasAdminAccessByEmail(session.user.email))) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const data = cleanGymInput(body);
    const missing = validateCompleteGymInput(body, data);
    if (missing.length) return NextResponse.json({ message: `Complete these required fields: ${missing.join(", ")}.` }, { status: 400 });
    const current = await db.gym.findUnique({ where: { id }, include: { _count: { select: { access: true } } } });
    if (!current) return NextResponse.json({ message: "Gym not found." }, { status: 404 });
    const uniquenessErrors = await gymListingUniquenessErrors(data, id);
    if (uniquenessErrors.length) return NextResponse.json({ message: uniquenessErrors[0].message, errors: uniquenessErrors }, { status: 409 });
    // Compare the submitted form with the same canonical representation of
    // the stored listing. Comparing cleaned input against raw legacy columns
    // incorrectly marked untouched sections as changed (particularly the
    // derived day-pass and membership price fields).
    const currentData = cleanGymInput(current as unknown as Record<string, unknown>);
    const storedBaseline = current.verificationBaseline && typeof current.verificationBaseline === "object" && !Array.isArray(current.verificationBaseline)
        ? current.verificationBaseline as Record<string, unknown>
        : null;
    const comparisonBaseline = storedBaseline ?? currentData;
    const changedSections = changedGymSections(comparisonBaseline, data);
    const requiresOwnerVerification = current._count.access > 0 && changedSections.length > 0;
    const gym = await db.gym.update({
        where: { id },
        data: {
            ...data,
            ...(requiresOwnerVerification ? {
                isVerified: false,
                verifiedAt: null,
                verifiedByEmail: null,
                verificationRequired: true,
                verificationSections: changedSections,
                verificationBaseline: storedBaseline ?? JSON.parse(JSON.stringify(currentData)),
            } : {}),
        },
    });
    return NextResponse.json({ gym });
}

export async function DELETE(_req: Request, { params }: Context) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !(await hasAdminAccessByEmail(session.user.email))) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    await db.$transaction(async (tx) => {
        const associatedUsers = await tx.gymAccess.findMany({
            where: { gymId: id },
            select: { userId: true },
        });
        await tx.gym.delete({ where: { id } });
        for (const { userId } of associatedUsers) {
            const remainingGymAccess = await tx.gymAccess.count({ where: { userId } });
            if (remainingGymAccess === 0) {
                await tx.user.update({ where: { id: userId }, data: { role: "TRAINEE" } });
            }
        }
    });
    return NextResponse.json({ message: "Gym listing deleted." });
}
