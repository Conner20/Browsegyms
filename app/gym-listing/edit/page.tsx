import BrandIcon from "@/components/BrandIcon";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import AdminGymListingEditor from "@/components/AdminGymListingEditor";
import { authOptions } from "@/lib/auth";
import { hasAdminAccessByEmail } from "@/lib/admin";
import { db } from "@/prisma/client";

export default async function EditManagedGymPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/log-in?callbackUrl=/gym-listing/edit");
  if (await hasAdminAccessByEmail(session.user.email)) redirect("/admin/gyms");
  const access = await db.gymAccess.findFirst({ where: { user: { email: session.user.email.toLowerCase(), role: "GYM" } }, select: { gymId: true }, orderBy: { createdAt: "asc" } });
  if (!access) redirect("/");
  return <main className="gym-verification-page min-h-screen bg-zinc-50 text-zinc-950 dark:bg-neutral-950 dark:text-white"><header className="border-b border-black/5 bg-white px-4 py-6 dark:border-white/10 dark:bg-neutral-950 sm:px-10"><div className="mx-auto max-w-7xl"><BrandIcon /><h1 className="text-3xl font-black">Customize gym listing</h1></div></header><section className="mx-auto max-w-7xl px-4 py-8"><AdminGymListingEditor gymId={access.gymId} ownerMode /></section></main>;
}
