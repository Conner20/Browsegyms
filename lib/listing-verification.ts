import { db } from "@/prisma/client";
import { sha256Hex } from "@/lib/token";

export async function getListingVerification(token: string) {
  const tokenHash = sha256Hex(token);
  const include = { gym: { include: { _count: { select: { access: true } } } } } as const;
  const invite = await db.gymInvite.findUnique({ where: { tokenHash }, include });
  return invite ? { ...invite, kind: "invite" as const } : null;
}
