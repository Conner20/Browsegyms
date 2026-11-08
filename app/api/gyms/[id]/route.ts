import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { cleanGymInput, gymListingUniquenessErrors, userCanEditGym, validateCompleteGymInput } from "@/lib/gyms";
import { db } from "@/prisma/client";
import { Prisma } from "@prisma/client";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
    const session = await getServerSession(authOptions);
    const { id } = await params;
    const gym = await db.gym.findFirst({
        where: { id, isPublished: true },
        select: { id: true, slug: true, name: true, address: true, phone: true, website: true, isVerified: true, verificationRequired: true, verificationSections: true, isPublished: true, gymType: true, dayPassPrice: true, dayPassDetails: true, dayPassUrl: true, dayPassOptions: true, membershipPrice: true, membershipDetails: true, membershipOptions: true, city: true, state: true, country: true, lat: true, lng: true, amenities: true, equipment: true, hours: true, contactEmail: true, coverPhotoUrl: true, photoUrls: true, _count: { select: { access: true } } },
    });
    if (!gym) return NextResponse.json({ message: "Gym not found." }, { status: 404 });
    const { _count, ...profile } = gym;
    if (!session?.user?.email) return NextResponse.json({ gym: { ...profile, isClaimed: _count.access > 0 } });

    const user = await db.user.findUnique({ where: { email: session.user.email.toLowerCase() }, select: { id: true } });
    if (!user || !(await userCanEditGym(user.id, id))) return NextResponse.json({ gym: { ...profile, isClaimed: _count.access > 0 } });

    // Private editors show the submitted verification data immediately. The
    // public landing API continues to read only the approved Gym record.
    const pendingClaim = await db.gymClaim.findUnique({
        where: { gymId_claimantId: { gymId: id, claimantId: user.id } },
        select: { id: true, status: true, proposedData: true },
    });
    const proposed = pendingClaim?.status === "PENDING" && pendingClaim.proposedData && typeof pendingClaim.proposedData === "object" && !Array.isArray(pendingClaim.proposedData)
        ? pendingClaim.proposedData
        : {};
    if (pendingClaim?.status === "PENDING" && Object.keys(proposed).length > 0) {
        await db.$transaction([
            db.gym.update({ where: { id }, data: { ...(proposed as Prisma.GymUpdateInput), isVerified: true, verificationRequired: false, verificationSections: [], verificationBaseline: Prisma.JsonNull } }),
            db.gymClaim.update({ where: { id: pendingClaim.id }, data: { status: "APPROVED", proposedData: undefined, reviewedAt: new Date() } }),
        ]);
    }
    const verified = pendingClaim?.status === "PENDING" && Object.keys(proposed).length > 0 ? true : profile.isVerified;
    return NextResponse.json({ gym: { ...profile, ...proposed, isVerified: verified, isClaimed: _count.access > 0 } });
}

export async function PATCH(req: Request, { params }: Context) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const user = await db.user.findUnique({ where: { email: session.user.email.toLowerCase() }, select: { id: true } });
    if (!user) return NextResponse.json({ message: "User not found." }, { status: 404 });
    const { id } = await params;
    if (!(await userCanEditGym(user.id, id))) return NextResponse.json({ message: "You do not have access to manage this gym." }, { status: 403 });
    const current = await db.gym.findUnique({ where: { id }, select: { name: true, address: true, verificationRequired: true } });
    if (!current) return NextResponse.json({ message: "Gym not found." }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const input = cleanGymInput({ ...body, name: body.name ?? current.name, address: body.address ?? current.address });
    const missing = validateCompleteGymInput({ ...body, name: body.name ?? current.name, address: body.address ?? current.address }, input);
    if (missing.length) return NextResponse.json({ message: `Complete these required fields: ${missing.join(", ")}.` }, { status: 400 });
    const uniquenessErrors = await gymListingUniquenessErrors(input, id);
    if (uniquenessErrors.length) return NextResponse.json({ message: uniquenessErrors[0].message, errors: uniquenessErrors }, { status: 409 });
    const { isPublished: _isPublished, ...editable } = input;

    const gym = await db.$transaction(async (tx) => {
        const updated = await tx.gym.update({ where: { id }, data: { ...editable, isVerified: true, verifiedAt: current.verificationRequired ? new Date() : undefined, verifiedByEmail: current.verificationRequired ? session.user.email!.toLowerCase() : undefined, verificationRequired: false, verificationSections: [], verificationBaseline: Prisma.JsonNull } });
        await tx.gymClaim.updateMany({
            where: { gymId: id, claimantId: user.id, status: "PENDING" },
            data: { status: "APPROVED", proposedData: undefined, reviewedAt: new Date() },
        });
        return updated;
    });
    return NextResponse.json({ gym, message: current.verificationRequired ? "Admin changes verified." : "Gym listing updated." });
}

export async function DELETE(_req: Request, { params }: Context) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const user = await db.user.findUnique({ where: { email: session.user.email.toLowerCase() }, select: { id: true } });
    if (!user) return NextResponse.json({ message: "User not found." }, { status: 404 });
    const { id } = await params;
    if (!(await userCanEditGym(user.id, id))) return NextResponse.json({ message: "You do not have access to delete this gym." }, { status: 403 });

    await db.$transaction(async (tx) => {
        const associatedUsers = await tx.gymAccess.findMany({ where: { gymId: id }, select: { userId: true } });
        await tx.gym.delete({ where: { id } });
        for (const { userId } of associatedUsers) {
            const remainingGymAccess = await tx.gymAccess.count({ where: { userId } });
            if (remainingGymAccess === 0) await tx.user.update({ where: { id: userId }, data: { role: "TRAINEE" } });
        }
    });
    return NextResponse.json({ message: "Gym listing deleted." });
}
