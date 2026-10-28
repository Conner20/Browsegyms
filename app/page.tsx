import { getServerSession } from "next-auth";
import GymDiscoveryLanding from "@/components/GymDiscoveryLanding";
import { authOptions } from "@/lib/auth";
import { hasAdminAccessByEmail } from "@/lib/admin";
import { db } from "@/prisma/client";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  const isAdmin = email ? await hasAdminAccessByEmail(email) : false;
  const managedGym = email && !isAdmin ? await db.gymAccess.findFirst({ where: { user: { email: email.toLowerCase(), role: "GYM" } }, select: { gymId: true }, orderBy: { createdAt: "asc" } }) : null;
  return <GymDiscoveryLanding initiallySignedIn={Boolean(email)} isAdmin={isAdmin} managedGymId={managedGym?.gymId} />;
}
