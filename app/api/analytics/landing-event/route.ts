import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { sha256Hex } from "@/lib/token";
import { db } from "@/prisma/client";
import { cleanMembershipOptions } from "@/lib/memberships";
import { cleanDayPassOptions } from "@/lib/day-passes";

const ALLOWED = new Set(["VISIT", "TIME_SPENT", "GYM_OPENED", "WEBSITE_CLICKED", "DIRECTIONS_CLICKED", "FAVORITE_ADDED", "FAVORITE_REMOVED", "COMPARE_ADDED", "COMPARE_REMOVED", "COMPARE_OPENED", "DAY_PASS_CLICKED", "DAY_PASS_CLAIM_CONFIRMED", "DAY_PASS_CLAIM_DECLINED", "MEMBERSHIP_CLICKED", "MEMBERSHIP_CLAIM_CONFIRMED", "MEMBERSHIP_CLAIM_DECLINED", "FILTER_OPENED", "FILTER_CHANGED", "FILTER_APPLIED", "FILTER_CLEARED", "LOCATION_SEARCHED", "LOCATION_USED", "SORT_CHANGED", "MAP_VIEWED", "LIST_VIEWED"]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const eventType = typeof body.eventType === "string" ? body.eventType : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 128) : "";
    const visitId = typeof body.visitId === "string" ? body.visitId.slice(0, 128) : "";
    if (!ALLOWED.has(eventType) || !visitorId || !visitId) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    const session = await getServerSession(authOptions);
    const user = session?.user?.email ? await db.user.findUnique({ where: { email: session.user.email.toLowerCase() }, select: { id: true } }) : null;
    const gymId = typeof body.gymId === "string" && body.gymId ? body.gymId : null;
    const durationMs = typeof body.durationMs === "number" && Number.isFinite(body.durationMs) ? Math.max(0, Math.min(Math.round(body.durationMs), 86_400_000)) : null;
    let metadata = body.metadata && typeof body.metadata === "object" ? JSON.parse(JSON.stringify(body.metadata)) as Prisma.InputJsonObject : undefined;
    let dedupeKey: string | undefined;
    if (gymId && ["DAY_PASS_CLICKED", "MEMBERSHIP_CLICKED"].includes(eventType)) {
      const optionId = typeof metadata?.optionId === "string" && metadata.optionId ? metadata.optionId : null;
      if (eventType === "MEMBERSHIP_CLICKED" && optionId) {
        const gym = await db.gym.findUnique({ where: { id: gymId }, select: { membershipOptions: true } });
        const option = cleanMembershipOptions(gym?.membershipOptions).find(item => item.id === optionId);
        if (!option) return NextResponse.json({ error: "Membership option not found" }, { status: 400 });
        metadata = { ...metadata, optionName: option.name, membershipTerms: JSON.parse(JSON.stringify(option)) as Prisma.InputJsonObject };
      }
      if (eventType === "DAY_PASS_CLICKED" && optionId) {
        const gym = await db.gym.findUnique({ where: { id: gymId }, select: { dayPassOptions: true } });
        const option = cleanDayPassOptions(gym?.dayPassOptions).find(item => item.id === optionId);
        if (!option) return NextResponse.json({ error: "Day-pass option not found" }, { status: 400 });
        metadata = { ...metadata, durationDays: option.durationDays, price: option.price };
      }
      const optionFallback = eventType === "MEMBERSHIP_CLICKED"
        ? typeof metadata?.optionName === "string" && metadata.optionName ? metadata.optionName : metadata?.url
        : typeof metadata?.durationDays === "number" ? String(metadata.durationDays) : metadata?.url;
      const claimKey = `${eventType}:${optionId || String(optionFallback || "default")}`;
      const priorClicks = await db.landingEvent.findMany({
        where: {
          eventType,
          gymId,
          OR: user?.id ? [{ userId: user.id }, { visitorId }] : [{ visitorId }],
        },
        select: { id: true, metadata: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      const duplicate = priorClicks.find(event => {
        const prior = event.metadata as Record<string, unknown> | null;
        if (prior?.claimKey === claimKey) return true;
        if (optionId) return prior?.optionId === optionId;
        const priorFallback = eventType === "MEMBERSHIP_CLICKED"
          ? typeof prior?.optionName === "string" && prior.optionName ? prior.optionName : prior?.url
          : typeof prior?.durationDays === "number" ? String(prior.durationDays) : prior?.url;
        return String(priorFallback || "default") === String(optionFallback || "default");
      });
      const prefix = eventType === "MEMBERSHIP_CLICKED" ? "MEMBERSHIP" : "DAY_PASS";
      const newerClick = duplicate ? priorClicks.find(click => click.createdAt > duplicate.createdAt) : null;
      const [gymResponse, userResponse] = duplicate ? await Promise.all([
        db.landingEvent.findFirst({
          where: { eventType: { in: [`${prefix}_GYM_CONFIRMED`, `${prefix}_GYM_DECLINED`] }, visitId: `gym-confirm:${duplicate.id}` },
          select: { id: true },
        }),
        db.landingEvent.findFirst({
          where: {
            eventType: { in: [`${prefix}_CLAIM_CONFIRMED`, `${prefix}_CLAIM_DECLINED`] },
            gymId,
            OR: user?.id ? [{ userId: user.id }, { visitorId }] : [{ visitorId }],
            createdAt: { gte: duplicate.createdAt, ...(newerClick ? { lt: newerClick.createdAt } : {}) },
          },
          select: { id: true },
        }),
      ]) : [null, null];
      if (duplicate && !gymResponse && !userResponse) return NextResponse.json({ ok: true, deduplicated: true, eventId: duplicate.id });
      metadata = { ...metadata, claimKey, ...(duplicate ? { previousClaimClickId: duplicate.id } : {}) };
      const actorKey = user?.id ? `user:${user.id}` : `visitor:${visitorId}`;
      const attemptKey = duplicate ? `after:${duplicate.id}` : "initial";
      dedupeKey = sha256Hex(`${gymId}:${actorKey}:${claimKey}:${attemptKey}`);
    }
    try {
      await db.landingEvent.create({ data: { eventType, visitorId, visitId, path: "/", gymId, userId: user?.id, durationMs, metadata, dedupeKey } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && dedupeKey) {
        return NextResponse.json({ ok: true, deduplicated: true });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to record event" }, { status: 400 });
  }
}
