import { PENDING_GYM_INVITE_COOKIE } from "@/lib/brand-cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = [
    "/",
    "/log-in",
    "/sign-up",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/user-onboarding",
    "/legal/terms",
    "/legal/privacy",
    "/legal/contact",
    "/legal/support",
];

const RETAINED_PAGE_PREFIXES = ["/admin", "/gym-invite", "/gym-listing", "/day-pass", "/change-password", "/referrals"];
const PENDING_GYM_INVITE_MAX_AGE = 60 * 60 * 24 * 14;

const startsWithAny = (pathname: string, prefixes: string[]) =>
    prefixes.some((prefix) => pathname.startsWith(prefix));

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/api") ||
        pathname.startsWith("/static") ||
        pathname.startsWith("/assets") ||
        pathname.startsWith("/favicon.ico") ||
        /\.[^/]+$/.test(pathname)
    ) {
        return NextResponse.next();
    }

    const isPublic =
        PUBLIC_PATHS.includes(pathname) ||
        startsWithAny(pathname, ["/verify-email", "/reset-password", "/gym-invite/"]);

    if (isPublic) {
        const response = NextResponse.next();
        const inviteMatch = pathname.match(/^\/gym-invite\/([^/]+)\/?$/);
        if (inviteMatch) {
            response.cookies.set(PENDING_GYM_INVITE_COOKIE, decodeURIComponent(inviteMatch[1]), {
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: PENDING_GYM_INVITE_MAX_AGE,
            });
        }
        return response;
    }

    // Product pages are intentionally limited to discovery, authentication,
    // policies, gym verification and administration.
    if (!startsWithAny(pathname, RETAINED_PAGE_PREFIXES)) {
        return NextResponse.redirect(new URL("/", req.url));
    }

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
        if (pathname === "/referrals") {
            const loginUrl = new URL("/log-in", req.url);
            loginUrl.searchParams.set("callbackUrl", "/referrals");
            return NextResponse.redirect(loginUrl);
        }
        const redirectUrl = new URL("/", req.url);
        return NextResponse.redirect(redirectUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
