import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { getReferralReviewAccess } from "@/lib/referral-review-access";
import ReferralSwitchAccount from "@/components/ReferralSwitchAccount";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import GymConversionReview from "@/components/GymConversionReview";
import { getConversionReview } from "@/lib/conversion-review";

export const metadata: Metadata = { title: "Confirm referrals", robots: { index: false, follow: false } };

export default async function ReferralReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getServerSession(authOptions);
  const access = await getReferralReviewAccess(token, session?.user?.email);
  if (access.status === "invalid") notFound();
  const returnTo = `/referrals/review/${encodeURIComponent(token)}`;
  if (access.status === "unclaimed" && session?.user?.email) redirect(`/gym-invite/${encodeURIComponent(token)}`);
  if (access.status !== "allowed") {
    return <main className="grid min-h-screen place-items-center bg-[#070907] p-5 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111411] p-7 text-center shadow-2xl sm:p-9">
        <h1 className="text-3xl font-black">{access.status === "unclaimed" ? "Verify your listing" : access.status === "forbidden" ? "Unauthorized" : "Confirm referrals"}</h1>
        {access.status === "forbidden" ? <>
          <p className="mt-4 text-white/65">You’re signed in with an account that does not own this listing. Sign in with the gym’s assigned owner account to continue.</p>
          <ReferralSwitchAccount returnTo={returnTo} />
        </> : <>
          <p className="mt-4 text-white/65">{access.status === "unclaimed" ? "Sign up or log in to verify and claim your gym listing, then confirm referrals." : "This gym listing is claimed. Log in with the gym’s assigned owner account to continue."}</p>
          <div className={`mt-6 grid gap-3 ${access.status === "unclaimed" ? "sm:grid-cols-2" : ""}`}>
            {access.status === "unclaimed" && <Link href={`/sign-up?callbackUrl=${encodeURIComponent(returnTo)}`} className="rounded-xl bg-[#22c55e] px-5 py-3 font-black text-black">Sign up</Link>}
            <Link href={`/log-in?callbackUrl=${encodeURIComponent(returnTo)}`} className={`rounded-xl px-5 py-3 font-black ${access.status === "unclaimed" ? "border border-white/15" : "bg-[#22c55e] text-black"}`}>Log in</Link>
          </div>
        </>}
      </div>
    </main>;
  }
  const review = await getConversionReview(token);
  if (!review) notFound();
  return <GymConversionReview token={token} gymName={review.gymName} expiresAt={review.expiresAt} initialRows={review.rows} />;
}
