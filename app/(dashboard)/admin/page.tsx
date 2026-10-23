import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import AdminHeader from "@/components/AdminHeader";
import AdminUserManager from "@/components/AdminUserManager";
import AdminGymVerificationLog from "@/components/AdminGymVerificationLog";
import AdminMetricsActions from "@/components/AdminMetricsActions";
import { authOptions } from "@/lib/auth";
import { hasAdminAccessByEmail } from "@/lib/admin";
import { db } from "@/prisma/client";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !(await hasAdminAccessByEmail(session.user.email))) redirect("/");
  const verificationLog = await db.gym.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, updatedAt: true,
      access: { orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true, assignedByEmail: true, user: { select: { email: true } } } },
    },
  });
  const verificationLogRows = verificationLog.map(gym => {
    const claim = gym.access[0] ?? null;
    const claimantEmail = claim?.user.email ?? null;
    return { id: gym.id, name: gym.name, isClaimed: Boolean(claim), claimedBy: claimantEmail ?? "—", claimedAt: claim?.createdAt.toISOString() ?? null, updatedAt: gym.updatedAt.toISOString() };
  });
  return <main className="min-h-screen bg-[#f8f8f8] text-black dark:bg-[#050505] dark:text-white">
    <AdminHeader active="overview" />
    <section className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <section id="users" className="space-y-4"><div><h2 className="text-xl font-black">Users</h2></div><AdminUserManager /></section>
      <section id="gym-verification-log" className="space-y-4 border-t border-black/10 pt-8 dark:border-white/10">
        <h2 className="text-xl font-black">Gyms</h2>
        <AdminGymVerificationLog rows={verificationLogRows} />
      </section>
      <div className="flex justify-center border-t border-black/10 pt-8 dark:border-white/10"><AdminMetricsActions /></div>
    </section>
  </main>;
}
