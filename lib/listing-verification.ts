import { db } from "@/prisma/client";
import { sha256Hex } from "@/lib/token";

// Referral links can initiate verification, but never replace an existing owner.
export async function getListingVerification(token: string) {
  const tokenHash = sha256Hex(token);
  const include = { gym: { include: { _count: { select: { access: true } } } } } as const;
  const invite = await db.gymInvite.findUnique({ where: { tokenHash }, include });
  if (invite) return { ...invite, kind: "invite" as const };
  const referral = await db.gymConversionReviewLink.findUnique({ where: { tokenHash }, include });
  return referral ? { ...referral, usedAt: null, kind: "referral" as const } : null;
}
