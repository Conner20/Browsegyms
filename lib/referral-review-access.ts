import { db } from "@/prisma/client";
import { sha256Hex } from "@/lib/token";

export async function getReferralReviewAccess(token: string, email?: string | null) {
  const link = await db.gymConversionReviewLink.findFirst({
    where: { tokenHash: sha256Hex(token), expiresAt: { gt: new Date() } },
    select: { gymId: true, gym: { select: { access: { select: { user: { select: { email: true, emailVerified: true, deletedAt: true } } } } } } },
  });
  if (!link) return { status: "invalid" as const };
  const owners = link.gym.access.filter(({ user }) => !user.deletedAt);
  if (!link.gym.access.length) return { status: "unclaimed" as const };
  if (!email) return { status: "signed_out" as const };
  const normalized = email.trim().toLowerCase();
  if (!owners.some(({ user }) => user.emailVerified && user.email?.toLowerCase() === normalized)) return { status: "forbidden" as const };
  return { status: "allowed" as const, gymId: link.gymId };
}
