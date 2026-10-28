import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hasAdminAccessByEmail } from "@/lib/admin";
import { db } from "@/prisma/client";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !(await hasAdminAccessByEmail(session.user.email))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clearedAt = new Date();
  const deleted = await db.$transaction(async transaction => {
    const events = await transaction.landingEvent.deleteMany();
    await transaction.landingEvent.create({
      data: {
        eventType: "METRICS_RESET",
        visitorId: "system",
        visitId: `metrics-reset:${clearedAt.toISOString()}`,
        path: "/admin",
        metadata: { clearedAt: clearedAt.toISOString(), clearedBy: session.user!.email!.toLowerCase() },
        createdAt: clearedAt,
      },
    });
    return { events: events.count };
  });

  return NextResponse.json({ ok: true, deletedEvents: deleted.events, clearedAt: clearedAt.toISOString() });
}
