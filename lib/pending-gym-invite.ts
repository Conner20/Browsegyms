import { getListingVerification } from "@/lib/listing-verification";

export const PENDING_GYM_INVITE_COOKIE = "fittingin_pending_gym_invite";
export const PENDING_GYM_INVITE_MAX_AGE = 60 * 60 * 24 * 14;

export async function getValidPendingGymInvite(rawToken?: string | null) {
    const token = rawToken?.trim();
    if (!token) return "";

    const invite = await getListingVerification(token);

    if (!invite || invite.usedAt || invite.expiresAt <= new Date() || invite.gym._count.access > 0) return "";
    return token;
}
