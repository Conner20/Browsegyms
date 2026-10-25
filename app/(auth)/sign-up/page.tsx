import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import SignUpForm from "@/components/form/SignUpForm"
import { getValidPendingGymInvite, PENDING_GYM_INVITE_COOKIE, LEGACY_GYM_INVITE_COOKIE } from "@/lib/pending-gym-invite";

const page = async () => {
    const cookieStore = await cookies();
    const pendingInvite = await getValidPendingGymInvite(cookieStore.get(PENDING_GYM_INVITE_COOKIE)?.value ?? cookieStore.get(LEGACY_GYM_INVITE_COOKIE)?.value);
    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-[#070907] px-4 py-4 sm:py-6">
            <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-[#111411] p-4 shadow-2xl shadow-black/40 sm:space-y-6 sm:rounded-3xl sm:p-6">
                <Suspense
                    fallback={
                        <div className="flex min-h-screen items-center justify-center bg-[#070907]">
                            <span className="h-12 w-12 animate-spin rounded-full border-2 border-[#22c55e] border-t-transparent" />
                        </div>
                    }
                >
                    <SignUpForm pendingInvite={pendingInvite} />
                </Suspense>
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
