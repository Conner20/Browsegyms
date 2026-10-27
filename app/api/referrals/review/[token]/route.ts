import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getReferralReviewAccess } from "@/lib/referral-review-access";
import { NextResponse } from "next/server";
import { getConversionReview, type ConversionReviewStatus } from "@/lib/conversion-review";
import { membershipInitialCharge, membershipTermsFromMetadata } from "@/lib/membership-attribution";
import { db } from "@/prisma/client";

type Context = { params: Promise<{ token: string }> };
const validStatuses = new Set<ConversionReviewStatus>(["purchased", "not_found"]);

export async function PATCH(req: Request, { params }: Context) {
  const { token } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ message: "Log in as the gym’s assigned owner to confirm referrals." }, { status: 401 });
  const access = await getReferralReviewAccess(token, session.user.email);
  if (access.status === "invalid") return NextResponse.json({ message: "This review link is invalid or has expired." }, { status: 404 });
  if (access.status !== "allowed") return NextResponse.json({ message: "Only the gym’s assigned owner can confirm referrals." }, { status: 403 });
  const review = await getConversionReview(token);
  if (!review) return NextResponse.json({ message: "This review link is invalid or has expired." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const decisions: unknown[] = Array.isArray(body.decisions) ? body.decisions : [];
  const pendingRows = review.rows.filter(row => row.status === "check_later");
  const allowedRows = new Map(pendingRows.map(row => [row.id, row]));
  const normalized = decisions
    .map((decision: unknown) => decision as { clickId?: unknown; status?: unknown })
    .filter(decision => typeof decision.clickId === "string" && typeof decision.status === "string" && validStatuses.has(decision.status as ConversionReviewStatus) && allowedRows.has(decision.clickId))
    .map(decision => ({ clickId: decision.clickId as string, status: decision.status as ConversionReviewStatus }));
  if (!normalized.length) return NextResponse.json({ message: "No referral decisions were submitted." }, { status: 400 });
  const submittedIds = new Set(normalized.map(decision => decision.clickId));
  if (submittedIds.size !== pendingRows.length || pendingRows.some(row => !submittedIds.has(row.id))) return NextResponse.json({ message: "Answer yes or no for every unconfirmed referral." }, { status: 400 });
  const sourceClickIds = [...new Set(normalized.map(item => allowedRows.get(item.clickId)!.sourceClickId))];
  const clicks = await db.landingEvent.findMany({ where: { id: { in: sourceClickIds }, gymId: review.gymId }, select: { id: true, eventType: true, visitorId: true, userId: true, metadata: true, createdAt: true } });
  const clickById = new Map(clicks.map(click => [click.id, click]));
  const saved = await db.$transaction(async tx => {
    const owner = await tx.gymAccess.findFirst({
      where: { gymId: review.gymId, user: { email: session.user!.email!.trim().toLowerCase(), emailVerified: { not: null }, deletedAt: null } },
      select: { id: true },
    });
    if (!owner) return false;
    for (const decision of normalized) {
      const row = allowedRows.get(decision.clickId)!;
      const click = clickById.get(row.sourceClickId);
      if (!click || !["DAY_PASS_CLICKED", "MEMBERSHIP_CLICKED"].includes(click.eventType)) continue;
      const membership = click.eventType === "MEMBERSHIP_CLICKED";
      const prefix = membership ? "MEMBERSHIP" : "DAY_PASS";
      const visitId = `gym-confirm:${click.id}`;
      const desiredType = decision.status === "purchased" ? `${prefix}_GYM_CONFIRMED` : `${prefix}_GYM_DECLINED`;
      await tx.landingEvent.deleteMany({ where: { visitId, eventType: { in: [`${prefix}_GYM_CONFIRMED`, `${prefix}_GYM_DECLINED`] } } });
      const clickMetadata = click.metadata as Record<string, unknown> | null;
      const membershipPurchaseDate = membership && decision.status === "purchased" ? click.createdAt.toISOString().slice(0, 10) : null;
      const terms = membershipTermsFromMetadata(clickMetadata);
      const membershipCharge = membershipPurchaseDate && terms ? membershipInitialCharge(terms, membershipPurchaseDate) : null;
      const clickPrice = typeof clickMetadata?.price === "number" ? clickMetadata.price : 0;
      await tx.landingEvent.create({ data: {
        eventType: desiredType,
        visitorId: click.visitorId,
        visitId,
        path: "/referrals/review",
        gymId: review.gymId,
        userId: click.userId,
        metadata: {
          claimClickId: click.id,
          confirmedBy: "gym conversion link",
          confirmedAt: new Date().toISOString(),
          reviewLinkId: review.linkId,
          customerEmail: row.email,
          offerId: typeof clickMetadata?.optionId === "string" ? clickMetadata.optionId : null,
          offerName: typeof clickMetadata?.optionName === "string" ? clickMetadata.optionName : typeof clickMetadata?.durationDays === "number" ? `${clickMetadata.durationDays}-day pass` : membership ? "Membership" : "Day pass",
          ...(membershipPurchaseDate ? { membershipPurchaseDate } : {}),
          attributedAmount: decision.status === "purchased" ? membership ? membershipCharge?.total ?? 0 : clickPrice : 0,
          ...(membershipCharge ? { membershipCharge: JSON.parse(JSON.stringify(membershipCharge)) } : {}),
        },
      } });
    }
    return true;
  });
  if (!saved) return NextResponse.json({ message: "Only the gym’s assigned owner can confirm referrals." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
