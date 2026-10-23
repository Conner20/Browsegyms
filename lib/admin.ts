import { env } from "@/lib/env";
import { db } from "@/prisma/client";

const SUPER_ADMIN_EMAILS = new Set([
    "conner.morgan14@gmail.com",
    "carson.morgan101@gmail.com",
]);

export function isMissingIsAdminColumnError(error: unknown) {
    if (!(error instanceof Error)) return false;

    return (
        error.message.includes("isAdmin") &&
        (
            error.message.includes("does not exist") ||
            error.message.includes("Unknown field") ||
            error.message.includes("column") ||
            error.message.includes("P2022")
        )
    );
}

export function getConfiguredAdminEmails() {
    return env.ADMIN_EMAILS.split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
}

export function isConfiguredAdminEmail(email: string | null | undefined) {
    if (!email) return false;
    return getConfiguredAdminEmails().includes(email.toLowerCase());
}

export function isSuperAdminEmail(email: string | null | undefined) {
    if (!email) return false;
    return SUPER_ADMIN_EMAILS.has(email.toLowerCase());
}

export function getUserAdminStatus(user: { email?: string | null; isAdmin?: boolean | null }) {
    return Boolean(user.isAdmin) || isConfiguredAdminEmail(user.email);
}

export async function hasAdminAccessByEmail(email: string | null | undefined) {
    if (!email) return false;
    if (isSuperAdminEmail(email)) return true;
    if (isConfiguredAdminEmail(email)) return true;

    try {
        const user = await db.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { isAdmin: true, deletedAt: true },
        });

        return Boolean(user?.isAdmin && !user.deletedAt);
    } catch (error) {
        if (isMissingIsAdminColumnError(error)) {
            return false;
        }
        throw error;
    }
}

export async function hasSuperAdminAccessByEmail(email: string | null | undefined) {
    return isSuperAdminEmail(email);
}
