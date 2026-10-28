import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hasAdminAccessByEmail } from "@/lib/admin";
import { db } from "@/prisma/client";
import { Prisma } from "@prisma/client";

type Context = { params: Promise<{ id: string }> };

async function adminEmail() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !(await hasAdminAccessByEmail(session.user.email))) return null;
  return session.user.email.toLowerCase();
}

async function demoteIfUnassigned(tx: Prisma.TransactionClient, userId: string) {
  const remaining = await tx.gymAccess.count({ where: { userId } });
  if (remaining === 0) await tx.user.update({ where: { id: userId }, data: { role: "TRAINEE" } });
}

export async function GET(req: Request, { params }: Context) {
  if (!(await adminEmail())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const { id: gymId } = await params;
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const [gym, users] = await Promise.all([
    db.gym.findUnique({
      where: { id: gymId },
      select: {
        access: { orderBy: { createdAt: "asc" }, select: { createdAt: true, user: { select: { id: true, email: true } } } },
      },
    }),
    db.user.findMany({
      where: { role: "TRAINEE", deletedAt: null, email: { not: null, ...(q ? { contains: q, mode: "insensitive" as const } : {}) } },
      orderBy: { email: "asc" },
      take: 20,
      select: { id: true, email: true },
    }),
  ]);
  if (!gym) return NextResponse.json({ message: "Gym not found." }, { status: 404 });
  return NextResponse.json({ owners: gym.access.map(access => ({ id: access.user.id, email: access.user.email, claimedAt: access.createdAt })), users });
}

export async function PATCH(req: Request, { params }: Context) {
  const assigningAdminEmail = await adminEmail();
  if (!assigningAdminEmail) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const { id: gymId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === "removeClaim" || action === "unverify" || action === "removeOwner") {
    await db.$transaction(async tx => {
      const owners = await tx.gymAccess.findMany({ where: { gymId }, select: { userId: true } });
      const latestInvite = await tx.gymInvite.findFirst({ where: { gymId }, orderBy: { createdAt: "desc" }, select: { id: true } });
      await tx.gymAccess.deleteMany({ where: { gymId } });
      await tx.gymClaim.deleteMany({ where: { gymId } });
      if (latestInvite) {
        await tx.gymInvite.deleteMany({ where: { gymId, id: { not: latestInvite.id } } });
        await tx.gymInvite.update({ where: { id: latestInvite.id }, data: { usedAt: null, proposedData: Prisma.JsonNull, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14) } });
      }
      await tx.gym.update({ where: { id: gymId }, data: { isVerified: false, verifiedAt: null, verifiedByEmail: null, verificationRequired: false, verificationSections: [], verificationBaseline: Prisma.JsonNull } });
      for (const owner of owners) await demoteIfUnassigned(tx, owner.userId);
    });
    return NextResponse.json({ message: "Gym claim removed. The listing can now be claimed and verified again." });
  }

  if (action === "assignOwner") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) return NextResponse.json({ message: "Select a trainee account." }, { status: 400 });
    await db.$transaction(async tx => {
      const [gym, user, oldOwners] = await Promise.all([
        tx.gym.findUnique({ where: { id: gymId }, select: { id: true } }),
        tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true, gymAccesses: { select: { gymId: true } } } }),
        tx.gymAccess.findMany({ where: { gymId }, select: { userId: true } }),
      ]);
      if (!gym) throw new Error("Gym not found.");
      if (!user || user.role !== "TRAINEE") throw new Error("The selected account is no longer an available trainee.");
      if (user.gymAccesses.some(access => access.gymId !== gymId)) throw new Error("The selected account is already associated with another gym.");
      await tx.gymAccess.deleteMany({ where: { gymId } });
      await tx.gymClaim.deleteMany({ where: { gymId, claimantId: { in: oldOwners.map(owner => owner.userId) } } });
      for (const owner of oldOwners) if (owner.userId !== userId) await demoteIfUnassigned(tx, owner.userId);
      await tx.user.update({ where: { id: userId }, data: { role: "GYM" } });
      await tx.gymAccess.create({ data: { gymId, userId, assignedByEmail: assigningAdminEmail } });
      await tx.gym.update({ where: { id: gymId }, data: { isVerified: true, verifiedAt: new Date(), verifiedByEmail: user.email, verificationRequired: false, verificationSections: [], verificationBaseline: Prisma.JsonNull } });
      await tx.gymClaim.upsert({
        where: { gymId_claimantId: { gymId, claimantId: userId } },
        create: { gymId, claimantId: userId, status: "APPROVED", businessRole: "Gym representative", evidence: "Assigned by an administrator." },
        update: { status: "APPROVED", reviewedAt: new Date() },
      });
    });
    return NextResponse.json({ message: "Gym claim assigned." });
  }

  return NextResponse.json({ message: "Unsupported ownership action." }, { status: 400 });
}
