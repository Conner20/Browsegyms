import { getServerSession } from "next-auth";
import Link from "next/link";
import AdminGymListingEditor from "@/components/AdminGymListingEditor";
import StableExploreLink from "@/components/StableExploreLink";
import { authOptions } from "@/lib/auth";
import { getListingVerification } from "@/lib/listing-verification";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ token: string }> };

export default async function GymInvitePage({ params }: Props) {
    const { token } = await params;

    const invite = await getListingVerification(token);
    if (invite?.kind === "referral" && invite.gym._count.access) redirect(`/referrals/review/${encodeURIComponent(token)}`);

    if (invite?.gym._count.access) {
        return (
            <main className="grid min-h-screen place-items-center bg-zinc-50 p-6 text-zinc-950 dark:bg-neutral-950 dark:text-white">
                <div className="w-full max-w-md rounded-3xl border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/5">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#22c55e]/15 text-2xl text-[#22c55e]">
                        ✓
                    </div>

                    <h1 className="mt-5 text-2xl font-black">
                        Listing already claimed
                    </h1>

                    <p className="mt-3 text-sm leading-6 text-zinc-500">
                        The listing for {invite.gym.name} has already been claimed and verified.
                    </p>

                    <StableExploreLink className="gym-invite-explore-action mt-6 inline-flex rounded-full bg-[#22c55e] px-5 py-3 text-sm font-black text-black transition" />
                </div>
            </main>
        );
    }

    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
        return (
            <main className="grid min-h-screen place-items-center bg-zinc-50 p-6 dark:bg-neutral-950">
                <div className="max-w-md rounded-3xl border bg-white p-8 text-center dark:border-white/10 dark:bg-white/5">
                    <h1 className="text-2xl font-bold">
                        Invitation unavailable
                    </h1>

                    <p className="mt-3 text-sm text-zinc-500">
                        This gym invitation is invalid, expired, or has already been used.
                    </p>

                    <StableExploreLink className="gym-invite-explore-action mt-6 inline-flex rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white" />
                </div>
            </main>
        );
    }

    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return (
            <main className="grid min-h-screen place-items-center bg-[#070907] p-5 text-white">
                <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111411] p-7 text-center shadow-2xl sm:p-9">
                    <h1 className="text-3xl font-black">
                        Verify your listing
                    </h1>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <StableExploreLink
                            href={`/sign-up?invite=${encodeURIComponent(token)}`}
                            className="gym-invite-signup-action rounded-xl border border-[#22c55e] bg-[#22c55e] px-5 py-3 text-sm font-black text-black"
                        >
                            Sign up
                        </StableExploreLink>

                        <Link
                            href={`/log-in?callbackUrl=${encodeURIComponent(`/gym-invite/${token}`)}`}
                            className="gym-invite-login-action rounded-xl border border-white/15 px-5 py-3 text-sm font-black text-white hover:border-white"
                        >
                            Log in
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    const gym = invite.gym;

    const initialGym = {
        id: gym.id,
        name: gym.name,
        address: gym.address,
        city: gym.city,
        state: gym.state,
        country: gym.country,
        lat: gym.lat,
        lng: gym.lng,
        phone: gym.phone,
        contactEmail: gym.contactEmail,
        website: gym.website,
        gymType: gym.gymType,
        dayPassPrice: gym.dayPassPrice,
        dayPassDetails: gym.dayPassDetails,
        dayPassUrl: gym.dayPassUrl,
        dayPassOptions: gym.dayPassOptions,
        membershipPrice: gym.membershipPrice,
        membershipDetails: gym.membershipDetails,
        membershipOptions: gym.membershipOptions,
        hours: gym.hours,
        amenities: gym.amenities,
        equipment: gym.equipment,
        coverPhotoUrl: gym.coverPhotoUrl,
        photoUrls: gym.photoUrls,
        isPublished: gym.isPublished,
    };

    return (
        <main className="gym-verification-page min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 dark:bg-neutral-950 dark:text-white">
            <div className="mx-auto max-w-4xl">
                <div className="mb-7">
                    <h1 className="text-3xl font-black">
                        Verify your gym info
                    </h1>

                    <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        Review the prefilled listing and correct anything that is inaccurate.
                        Verifying the information claims this listing for {session.user.email}.
                    </p>
                </div>

                <AdminGymListingEditor
                    gymId={gym.id}
                    inviteToken={token}
                    initialGym={initialGym}
                    accountEmail={session.user.email}
                />
            </div>
        </main>
    );
}
