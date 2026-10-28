import { db } from "@/prisma/client";

export async function getReferralReviewAccess(email?: string | null) {
  if (!email) return { status: "signed_out" as const };
  const normalized = email.trim().toLowerCase();
  const owner = await db.user.findUnique({
    where: { email: normalized },
    select: {
      role: true,
      emailVerified: true,
      deletedAt: true,
      gymAccesses: { orderBy: { createdAt: "asc" }, take: 2, select: { gymId: true } },
    },
  });
  if (!owner || owner.deletedAt || !owner.emailVerified || owner.role !== "GYM" || owner.gymAccesses.length !== 1) return { status: "forbidden" as const };
  return { status: "allowed" as const, gymId: owner.gymAccesses[0].gymId };
}
