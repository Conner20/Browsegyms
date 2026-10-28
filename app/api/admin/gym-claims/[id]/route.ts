import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hasAdminAccessByEmail } from "@/lib/admin";
import { db } from "@/prisma/client";
import { Prisma } from "@prisma/client";
import { cleanGymInput, validateCompleteGymInput } from "@/lib/gyms";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !(await hasAdminAccessByEmail(session.user.email))) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    const adminEmail = session.user.email.toLowerCase();
    const reviewer = await db.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
    if (!reviewer) return NextResponse.json({ message: "Admin user not found." }, { status: 404 });
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const status = body.status === "APPROVED" ? "APPROVED" : body.status === "REJECTED" ? "REJECTED" : null;
    if (!status) return NextResponse.json({ message: "Status must be APPROVED or REJECTED." }, { status: 400 });
    const claim = await db.gymClaim.findUnique({ where: { id }, select: { id: true, gymId: true, claimantId: true, status: true, proposedData: true, claimant: { select: { email: true } } } });
    if (!claim) return NextResponse.json({ message: "Claim not found." }, { status: 404 });
    if (claim.status !== "PENDING") return NextResponse.json({ message: "Claim has already been reviewed." }, { status: 409 });
    if (status === "APPROVED") {
        const conflictingAccess = await db.gymAccess.findFirst({
            where: { OR: [{ userId: claim.claimantId, gymId: { not: claim.gymId } }, { gymId: claim.gymId, userId: { not: claim.claimantId } }] },
            select: { id: true },
        });
        if (conflictingAccess) return NextResponse.json({ message: "Gym users can own only one listing, and each listing can have only one owner." }, { status: 409 });
    }
    const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim() : null;
    let reviewedGymData: Prisma.GymUpdateInput | null = null;
    if (status === "APPROVED" && body.gymData && typeof body.gymData === "object") {
        const cleaned = cleanGymInput(body.gymData as Record<string, unknown>);
        const missing = validateCompleteGymInput(body.gymData as Record<string, unknown>, cleaned);
        if (missing.length) return NextResponse.json({ message: `Complete these required fields: ${missing.join(", ")}.` }, { status: 400 });
        const { isPublished: _isPublished, ...editable } = cleaned;
        reviewedGymData = editable;
    }
    const result = await db.$transaction(async (tx) => {
        if (status === "APPROVED") {
            await tx.gymAccess.upsert({
                where: { gymId_userId: { gymId: claim.gymId, userId: claim.claimantId } },
                create: { gymId: claim.gymId, userId: claim.claimantId, assignedByEmail: adminEmail },
                update: {},
            });
            const proposedData = reviewedGymData ?? (claim.proposedData && typeof claim.proposedData === "object" && !Array.isArray(claim.proposedData) ? claim.proposedData as Prisma.GymUpdateInput : {});
            await tx.user.update({ where: { id: claim.claimantId }, data: { role: "GYM" } });
            await tx.gym.update({ where: { id: claim.gymId }, data: { ...proposedData, isVerified: true, verifiedAt: new Date(), verifiedByEmail: claim.claimant.email, verificationRequired: false, verificationSections: [], verificationBaseline: Prisma.JsonNull } });
        }
        return tx.gymClaim.update({
            where: { id },
            data: { status, reviewNote, reviewedById: reviewer.id, reviewedAt: new Date(), ...(status === "APPROVED" ? { proposedData: undefined } : {}) },
            include: { gym: true, claimant: { select: { id: true, email: true } } },
        });
    });
    return NextResponse.json({ claim: result });
}
