import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { compare } from "bcrypt";
import { authOptions } from "@/lib/auth";
import { getUserAdminStatus,hasAdminAccessByEmail,hasSuperAdminAccessByEmail,isConfiguredAdminEmail } from "@/lib/admin";
import { syncAdminMetricsToGoogleSheets } from "@/lib/google-sheets-sync";
import { db } from "@/prisma/client";

export async function GET(request:Request){
  const session=await getServerSession(authOptions);
  if(!session?.user?.email||!(await hasAdminAccessByEmail(session.user.email)))return NextResponse.json({error:"Unauthorized"},{status:401});
  const searchParams=new URL(request.url).searchParams;
  const query=searchParams.get("q")?.trim()||"";
  const where: Prisma.UserWhereInput = {
    emailVerified: { not: null },
    ...(query ? { email: { contains: query, mode: Prisma.QueryMode.insensitive } } : {}),
  };
  const [users,events]=await Promise.all([
    db.user.findMany({where,take:500,orderBy:{createdAt:"desc"},select:{id:true,email:true,role:true,isAdmin:true,lastLoginAt:true,deletedAt:true,landingEvents:{select:{createdAt:true},orderBy:{createdAt:"desc"},take:1},gymAccesses:{select:{id:true,gym:{select:{id:true,name:true}}}}}}),
    db.landingEvent.findMany({where:{eventType:{in:["DAY_PASS_CLICKED","DAY_PASS_CLAIM_CONFIRMED","DAY_PASS_GYM_CONFIRMED","DAY_PASS_SIGNUP","MEMBERSHIP_CLICKED","MEMBERSHIP_CLAIM_CONFIRMED","MEMBERSHIP_GYM_CONFIRMED","MEMBERSHIP_SIGNUP"]}},select:{id:true,eventType:true,userId:true,visitorId:true,visitId:true,gymId:true,metadata:true,createdAt:true,gym:{select:{name:true}}},take:100_000}),
  ]);
  const visitorUsers=new Map(events.filter(event=>event.userId).map(event=>[event.visitorId,event.userId!]));
  const activity=new Map<string,{dayPassClicks:number;confirmedDayPasses:number;userReportedDayPasses:number;membershipClicks:number;confirmedMemberships:number;userReportedMemberships:number}>();
  const confirmedDayPasses=new Map<string,Set<string>>(),reportedDayPasses=new Map<string,Set<string>>(),confirmedMemberships=new Map<string,Set<string>>(),reportedMemberships=new Map<string,Set<string>>();
  type ClaimConfirmation={gymId:string;gymName:string;claimType:"day-pass"|"membership";gymConfirmed:boolean};
  const claimConfirmations=new Map<string,Map<string,ClaimConfirmation>>();
  for(const event of events){const userId=event.userId||visitorUsers.get(event.visitorId);if(!userId)continue;const totals=activity.get(userId)||{dayPassClicks:0,confirmedDayPasses:0,userReportedDayPasses:0,membershipClicks:0,confirmedMemberships:0,userReportedMemberships:0};if(event.eventType==="DAY_PASS_CLICKED")totals.dayPassClicks++;if(event.eventType==="MEMBERSHIP_CLICKED")totals.membershipClicks++;activity.set(userId,totals);if(event.gymId&&(event.eventType==="DAY_PASS_CLICKED"||event.eventType==="MEMBERSHIP_CLICKED")){const claimType=event.eventType==="DAY_PASS_CLICKED"?"day-pass":"membership",key=`${claimType}:${event.gymId}`,byUser=claimConfirmations.get(userId)||new Map<string,ClaimConfirmation>();if(!byUser.has(key))byUser.set(key,{gymId:event.gymId,gymName:event.gym?.name||"Deleted gym",claimType,gymConfirmed:false});claimConfirmations.set(userId,byUser)}}
  for(const event of events){const userId=event.userId||visitorUsers.get(event.visitorId);if(!userId)continue;const clickType=event.eventType.startsWith("MEMBERSHIP_")?"MEMBERSHIP_CLICKED":"DAY_PASS_CLICKED",metadata=event.metadata as Record<string,unknown>|null,claimKey=event.eventType.endsWith("_GYM_CONFIRMED")&&typeof metadata?.claimClickId==="string"?metadata.claimClickId:events.filter(click=>click.eventType===clickType&&click.gymId===event.gymId&&(click.userId||visitorUsers.get(click.visitorId))===userId&&click.createdAt<=event.createdAt).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime())[0]?.id||event.id;if(event.eventType==="DAY_PASS_GYM_CONFIRMED"){const values=confirmedDayPasses.get(userId)||new Set<string>();values.add(claimKey);confirmedDayPasses.set(userId,values)}if(event.eventType==="DAY_PASS_CLAIM_CONFIRMED"){const values=reportedDayPasses.get(userId)||new Set<string>();values.add(claimKey);reportedDayPasses.set(userId,values)}if(event.eventType==="MEMBERSHIP_GYM_CONFIRMED"){const values=confirmedMemberships.get(userId)||new Set<string>();values.add(claimKey);confirmedMemberships.set(userId,values)}if(event.eventType==="MEMBERSHIP_CLAIM_CONFIRMED"){const values=reportedMemberships.get(userId)||new Set<string>();values.add(claimKey);reportedMemberships.set(userId,values)}if(event.gymId&&(event.eventType==="DAY_PASS_GYM_CONFIRMED"||event.eventType==="MEMBERSHIP_GYM_CONFIRMED")){const claimType=event.eventType==="DAY_PASS_GYM_CONFIRMED"?"day-pass":"membership",confirmation=claimConfirmations.get(userId)?.get(`${claimType}:${event.gymId}`);if(confirmation)confirmation.gymConfirmed=true}}
  for(const [userId,totals] of activity){const gymDay=confirmedDayPasses.get(userId)??new Set<string>(),gymMembership=confirmedMemberships.get(userId)??new Set<string>();totals.confirmedDayPasses=gymDay.size;totals.userReportedDayPasses=[...(reportedDayPasses.get(userId)??[])].filter(key=>!gymDay.has(key)).length;totals.confirmedMemberships=gymMembership.size;totals.userReportedMemberships=[...(reportedMemberships.get(userId)??[])].filter(key=>!gymMembership.has(key)).length}
  return NextResponse.json({canManageUsers:await hasSuperAdminAccessByEmail(session.user.email),users:users.filter(user=>user.email?.toLowerCase()!==session.user.email?.toLowerCase()).map(user=>{const latestEvent=user.landingEvents[0]?.createdAt;const lastActiveAt=latestEvent&&(!user.lastLoginAt||latestEvent>user.lastLoginAt)?latestEvent:user.lastLoginAt;return {id:user.id,email:user.email,role:user.role,deletedAt:user.deletedAt?.toISOString()||null,hasAdminAccess:!user.deletedAt&&getUserAdminStatus(user),isConfiguredAdmin:isConfiguredAdminEmail(user.email),gymAccessCount:user.gymAccesses.length,gyms:user.gymAccesses.map(access=>access.gym),claimConfirmations:[...(claimConfirmations.get(user.id)?.values()||[])].sort((a,b)=>a.gymName.localeCompare(b.gymName)||a.claimType.localeCompare(b.claimType)),lastActiveAt:lastActiveAt?.toISOString()||null,...(activity.get(user.id)||{dayPassClicks:0,confirmedDayPasses:0,userReportedDayPasses:0,membershipClicks:0,confirmedMemberships:0,userReportedMemberships:0})}})});
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const body = await request.json().catch(() => ({}));
  if (body.action === "permanentlyDeleteUsers") {
    if (!session?.user?.email || !(await hasSuperAdminAccessByEmail(session.user.email))) return NextResponse.json({ error: "Only the superadmin can permanently delete accounts." }, { status: 403 });
    const userIds: string[] = Array.isArray(body.userIds)
      ? Array.from(new Set<string>(body.userIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0))).slice(0, 500)
      : [];
    const password = typeof body.password === "string" ? body.password : "";
    if (!userIds.length || !password) return NextResponse.json({ error: "Select at least one deleted account and enter your admin password." }, { status: 400 });
    const currentAdmin = await db.user.findUnique({ where: { email: session.user.email.toLowerCase() }, select: { password: true } });
    if (!currentAdmin?.password || !(await compare(password, currentAdmin.password))) return NextResponse.json({ error: "The admin password is incorrect." }, { status: 401 });
    const targets = await db.user.findMany({ where: { id: { in: userIds }, deletedAt: { not: null } }, select: { id: true, email: true } });
    if (targets.length !== userIds.length) return NextResponse.json({ error: "Only deleted accounts can be permanently deleted." }, { status: 409 });
    if (targets.some(target => isConfiguredAdminEmail(target.email))) return NextResponse.json({ error: "Configured superadmin accounts cannot be permanently deleted here." }, { status: 409 });

    await db.$transaction(async tx => {
      for (const target of targets) {
        // LandingEvent.userId uses ON DELETE SET NULL so analytics would
        // otherwise survive a permanent account deletion. Include events
        // captured before login by removing the visitor histories that were
        // subsequently linked to this account as well.
        const identifiedVisitors = await tx.landingEvent.findMany({
          where: { userId: target.id },
          select: { visitorId: true },
          distinct: ["visitorId"],
        });
        const visitorIds = identifiedVisitors.map(event => event.visitorId);
        await tx.landingEvent.deleteMany({
          where: {
            OR: [
              { userId: target.id },
              ...(visitorIds.length ? [{ visitorId: { in: visitorIds }, userId: null }] : []),
            ],
          },
        });
        if (target.email) {
          await tx.verificationToken.deleteMany({ where: { identifier: target.email } });
          await tx.pendingSignup.deleteMany({ where: { email: target.email } });
          await tx.gym.updateMany({ where: { verifiedByEmail: target.email }, data: { verifiedByEmail: null } });
          await tx.gymAccess.updateMany({ where: { assignedByEmail: target.email }, data: { assignedByEmail: null } });
          const signupEvents = await tx.landingEvent.findMany({ where: { userId: target.id, eventType: { in: ["DAY_PASS_SIGNUP", "MEMBERSHIP_SIGNUP"] } }, select: { id: true, metadata: true } });
          for (const event of signupEvents) {
            const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? { ...(event.metadata as Record<string, Prisma.JsonValue>) } : null;
            if (metadata && typeof metadata.email === "string" && metadata.email.toLowerCase() === target.email.toLowerCase()) {
              delete metadata.email;
              await tx.landingEvent.update({ where: { id: event.id }, data: { metadata } });
            }
          }
        }
        await tx.user.delete({ where: { id: target.id } });
      }
    });
    // Reflect the deletion in Browse Gyms Metrics immediately instead of
    // waiting for the next scheduled sync. A later cron run remains a safe
    // fallback if Google is temporarily unavailable.
    let metricsSynced = true;
    try {
      await syncAdminMetricsToGoogleSheets();
    } catch (error) {
      metricsSynced = false;
      console.error("Browse Gyms metrics refresh after permanent user deletion failed", error);
    }
    return NextResponse.json({ ok: true, count: targets.length, metricsSynced });
  }
  if (body.action === "recoverUsers") {
    if (!session?.user?.email || !(await hasSuperAdminAccessByEmail(session.user.email))) return NextResponse.json({ error: "Only the superadmin can recover accounts." }, { status: 403 });
    const userIds: string[] = Array.isArray(body.userIds)
      ? Array.from(new Set<string>(body.userIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0))).slice(0, 500)
      : [];
    const password = typeof body.password === "string" ? body.password : "";
    if (!userIds.length || !password) return NextResponse.json({ error: "Select at least one deleted account and enter your admin password." }, { status: 400 });
    const currentAdmin = await db.user.findUnique({ where: { email: session.user.email.toLowerCase() }, select: { password: true } });
    if (!currentAdmin?.password || !(await compare(password, currentAdmin.password))) return NextResponse.json({ error: "The admin password is incorrect." }, { status: 401 });
    const targets = await db.user.findMany({ where: { id: { in: userIds }, deletedAt: { not: null } }, select: { id: true, password: true } });
    if (targets.length !== userIds.length) return NextResponse.json({ error: "Only deleted accounts can be recovered." }, { status: 409 });
    if (targets.some(target => !target.password)) return NextResponse.json({ error: "One or more legacy deleted accounts no longer have a saved password and cannot be recovered automatically." }, { status: 409 });
    const result = await db.user.updateMany({ where: { id: { in: userIds }, deletedAt: { not: null } }, data: { deletedAt: null, role: "TRAINEE", isAdmin: false } });
    return NextResponse.json({ ok: true, count: result.count });
  }
  if (!session?.user?.email || !(await hasSuperAdminAccessByEmail(session.user.email))) {
    return NextResponse.json({ error: "Only the superadmin can change admin access." }, { status: 403 });
  }
  const userIds: string[] = Array.isArray(body.userIds)
    ? Array.from(new Set<string>(body.userIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0))).slice(0, 500)
    : [];
  if (userIds.length) {
    const password = typeof body.password === "string" ? body.password : "";
    const isAdmin = typeof body.isAdmin === "boolean" ? body.isAdmin : null;
    if (isAdmin === null) return NextResponse.json({ error: "Admin status is required." }, { status: 400 });
    const currentAdmin = await db.user.findUnique({ where: { email: session.user.email.toLowerCase() }, select: { password: true } });
    if (!password || !currentAdmin?.password || !(await compare(password, currentAdmin.password))) return NextResponse.json({ error: "The admin password is incorrect." }, { status: 401 });
    const targets = await db.user.findMany({ where: { id: { in: userIds } }, select: { email: true } });
    if (!isAdmin && targets.some(target => isConfiguredAdminEmail(target.email))) return NextResponse.json({ error: "Configured superadmins cannot be demoted here." }, { status: 409 });
    const result = await db.user.updateMany({ where: { id: { in: userIds }, deletedAt: null }, data: { isAdmin } });
    return NextResponse.json({ ok: true, count: result.count });
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  const isAdmin = typeof body.isAdmin === "boolean" ? body.isAdmin : null;
  if (!userId || isAdmin === null) return NextResponse.json({ error: "User and admin status are required." }, { status: 400 });
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (isConfiguredAdminEmail(target.email)) return NextResponse.json({ error: "Configured admin access is managed through ADMIN_EMAILS." }, { status: 409 });
  await db.user.update({ where: { id: userId }, data: { isAdmin } });
  return NextResponse.json({ ok: true, isAdmin });
}
