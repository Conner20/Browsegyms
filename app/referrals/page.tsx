import { getServerSession } from "next-auth";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BrandIcon from "@/components/BrandIcon";
import GymConversionReview from "@/components/GymConversionReview";
import { authOptions } from "@/lib/auth";
import { getConversionReview } from "@/lib/conversion-review";
import { getReferralReviewAccess } from "@/lib/referral-review-access";

export const metadata: Metadata = { title: "My Referrals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const session = await getServerSession(authOptions);
  const access = await getReferralReviewAccess(session?.user?.email);
  if (access.status === "signed_out") redirect(`/log-in?callbackUrl=${encodeURIComponent("/referrals")}`);
  if (access.status !== "allowed") return <main className="grid min-h-screen place-items-center bg-[#070907] p-5 text-white"><div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111411] p-7 text-center shadow-2xl sm:p-9"><h1 className="text-3xl font-black">Unauthorized</h1><p className="mt-4 text-white/65">Only the assigned owner of a claimed gym listing can confirm its referrals.</p><Link href="/" className="mt-6 inline-flex rounded-xl bg-[#22c55e] px-5 py-3 font-black text-black">Return to Browse Gyms</Link></div></main>;
  const review = await getConversionReview(access.gymId);
  if (!review) return <main className="grid min-h-screen place-items-center bg-[#070907] p-5 text-white"><p>Gym listing unavailable.</p></main>;
  return <main className="gym-verification-page min-h-screen bg-zinc-50 text-zinc-950 dark:bg-neutral-950 dark:text-white"><header className="border-b border-black/5 bg-white px-4 py-6 dark:border-white/10 dark:bg-neutral-950 sm:px-10"><div className="mx-auto max-w-7xl"><BrandIcon /><h1 className="text-3xl font-black">Confirm referrals for {review.gymName}</h1></div></header><section className="mx-auto max-w-7xl px-4 py-8"><GymConversionReview initialRows={review.rows} /></section></main>;
}
