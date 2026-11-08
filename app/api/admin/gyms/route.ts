import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hasAdminAccessByEmail } from "@/lib/admin";
import { cleanGymInput, gymListingUniquenessErrors, gymSlug, validateCompleteGymInput } from "@/lib/gyms";
import { db } from "@/prisma/client";

async function authorize() {
    const session = await getServerSession(authOptions);
    return session?.user?.email && await hasAdminAccessByEmail(session.user.email);
}

export async function GET(req: Request) {
    if (!(await authorize())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const searchParams = new URL(req.url).searchParams;
    const query = searchParams.get("q")?.trim() ?? "";
    const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = 9;
    const where = query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { address: { contains: query, mode: "insensitive" as const } }] } : {};
    const [gyms, total] = await db.$transaction([
        db.gym.findMany({
            where,
            include: {
                _count: { select: { access: true } },
                access: { select: { user: { select: { email: true } } }, orderBy: { createdAt: "asc" } },
            },
            orderBy: { name: "asc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        db.gym.count({ where }),
    ]);
    const metricTypes = ["GYM_OPENED", "DAY_PASS_CLICKED", "WEBSITE_CLICKED", "DAY_PASS_CLAIM_CONFIRMED", "DAY_PASS_SIGNUP"];
    const events = gyms.length ? await db.landingEvent.findMany({
        where: { gymId: { in: gyms.map((gym) => gym.id) }, eventType: { in: metricTypes } },
        select: { gymId: true, eventType: true, userId: true, visitorId: true },
    }) : [];
    const analytics = new Map<string, Record<string, { total: number; uniqueUsers: Set<string> }>>();
    const visitorAccounts = new Map(events.filter((event) => event.userId).map((event) => [event.visitorId, event.userId!]));
    for (const event of events) {
        if (!event.gymId) continue;
        const gymMetrics = analytics.get(event.gymId) ?? {};
        const metric = gymMetrics[event.eventType] ?? { total: 0, uniqueUsers: new Set<string>() };
        metric.total += 1;
        const userId = event.userId || visitorAccounts.get(event.visitorId);
        metric.uniqueUsers.add(userId ? `user:${userId}` : `visitor:${event.visitorId}`);
        gymMetrics[event.eventType] = metric;
        analytics.set(event.gymId, gymMetrics);
    }
    const metric = (gymId: string, eventType: string) => {
        const value = analytics.get(gymId)?.[eventType];
        return { total: value?.total ?? 0, uniqueUsers: value?.uniqueUsers.size ?? 0 };
    };
    return NextResponse.json({
        gyms: gyms.map((gym) => ({ ...gym, isClaimed: gym._count.access > 0, ownerEmails: gym.access.map(({ user }) => user.email).filter(Boolean), analytics: { listingClicks: metric(gym.id, "GYM_OPENED"), dayPassClicks: metric(gym.id, "DAY_PASS_CLICKED"), websiteVisits: metric(gym.id, "WEBSITE_CLICKED"), confirmedClaims: metric(gym.id, "DAY_PASS_CLAIM_CONFIRMED"), postClickSignups: metric(gym.id, "DAY_PASS_SIGNUP") } })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
}

export async function POST(req: Request) {
    if (!(await authorize())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const data = cleanGymInput(body);
    const missing = validateCompleteGymInput(body, data);
    if (missing.length) return NextResponse.json({ message: `Complete these required fields: ${missing.join(", ")}.` }, { status: 400 });
    const uniquenessErrors = await gymListingUniquenessErrors(data);
    if (uniquenessErrors.length) return NextResponse.json({ message: uniquenessErrors[0].message, errors: uniquenessErrors }, { status: 409 });
    const gym = await db.gym.create({ data: { ...data, slug: gymSlug(data.name), isVerified: false } });
    return NextResponse.json({ gym, isClaimed: false }, { status: 201 });
}
