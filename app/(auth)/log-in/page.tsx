import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import LogInForm from "@/components/form/LogInForm";
import { authOptions } from "@/lib/auth";
import { getValidPendingGymInvite, PENDING_GYM_INVITE_COOKIE, LEGACY_GYM_INVITE_COOKIE } from "@/lib/pending-gym-invite";

const page = async ({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) => {
    const session = await getServerSession(authOptions);
    const requestedCallback = (await searchParams).callbackUrl ?? "";
    const explicitCallback = requestedCallback.startsWith("/") && !requestedCallback.startsWith("//") ? requestedCallback : "";
    const cookieStore = await cookies();
    // A gym claim is an administrator-issued, time-limited workflow. Keep it
    // ahead of unrelated purchase callbacks until the listing is claimed.
    const pendingInvite = await getValidPendingGymInvite(cookieStore.get(PENDING_GYM_INVITE_COOKIE)?.value ?? cookieStore.get(LEGACY_GYM_INVITE_COOKIE)?.value);
    const referralCallback = /^\/referrals\/review\/[A-Za-z0-9_-]+$/.test(explicitCallback);
    const callbackUrl = referralCallback ? explicitCallback : pendingInvite ? `/gym-invite/${encodeURIComponent(pendingInvite)}` : explicitCallback || "/";
    if (session?.user) {
        redirect(callbackUrl);
    }

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-[#070907] px-4 py-10">
            <div className="w-full max-w-sm space-y-6 rounded-3xl border border-white/10 bg-[#111411] p-6 shadow-2xl shadow-black/40">
                <LogInForm defaultCallbackUrl={callbackUrl} />
                <div className="text-center">
                    <Link
                        href="/"
                        className="text-sm text-white/45 transition hover:text-[#22c55e]"
                    >
                        ← Back
                    </Link>
                </div>
            </div>
        </div>
    )
}

export default page;
