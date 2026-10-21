import ExcelJS from "exceljs";
import { getUserAdminStatus } from "@/lib/admin";
import { filterCategory } from "@/lib/metrics-filter-category";
import { db } from "@/prisma/client";
import { membershipChargeForPeriod, membershipContractEnd, membershipTermsFromMetadata } from "@/lib/membership-attribution";
import { cleanMembershipOptions, recurringMonthlyPrice } from "@/lib/memberships";

const day = (date: Date) => date.toISOString().slice(0, 10);
const actor = (event: { userId: string | null; visitorId: string }) => event.userId ? `user:${event.userId}` : `visitor:${event.visitorId}`;

function formatSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(2, sheet.rowCount), column: Math.max(1, sheet.columnCount) } };
  sheet.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: "FF000000" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF22C55E" } }; });
  sheet.columns.forEach(column => { let width = String(column.header || "").length + 2; column.eachCell?.({ includeEmpty: false }, cell => { width = Math.min(45, Math.max(width, String(cell.value ?? "").length + 2)); }); column.width = Math.max(12, width); });
}

export async function buildAdminMetricsWorkbook() {
  const [events, users, gyms, latestReset] = await Promise.all([
    db.landingEvent.findMany({ where: { eventType: { not: "METRICS_RESET" } }, select: { id: true, eventType: true, visitorId: true, visitId: true, path: true, gymId: true, userId: true, metadata: true, durationMs: true, createdAt: true, gym: { select: { name: true } }, user: { select: { email: true } } }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({ where: { emailVerified: { not: null } }, select: { id: true, email: true, role: true, isAdmin: true, createdAt: true, emailVerified: true, lastLoginAt: true, deletedAt: true, gymAccesses: { select: { gym: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "asc" } }),
    db.gym.findMany({ select: { id: true, name: true, isPublished: true, contactEmail: true, membershipOptions: true, createdAt: true, updatedAt: true, access: { orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true, assignedByEmail: true, user: { select: { email: true } } } } }, orderBy: { name: "asc" } }),
    db.landingEvent.findFirst({ where: { eventType: "METRICS_RESET" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  type ExportEvent = (typeof events)[number];
  const confirmedClickId = (event: ExportEvent, clickType: "DAY_PASS_CLICKED" | "MEMBERSHIP_CLICKED") => {
    const metadata = event.metadata as Record<string, unknown> | null;
    if (event.eventType.endsWith("_GYM_CONFIRMED") && typeof metadata?.claimClickId === "string") return metadata.claimClickId;
    return [...events].reverse().find(click => click.eventType === clickType && click.gymId === event.gymId && actor(click) === actor(event) && click.createdAt <= event.createdAt)?.id ?? event.id;
  };
  const resolvedConfirmations = (prefix: "DAY_PASS" | "MEMBERSHIP") => {
    const clickType = `${prefix}_CLICKED` as "DAY_PASS_CLICKED" | "MEMBERSHIP_CLICKED";
    const resolved = new Map<string, ExportEvent>();
    for (const event of events.filter(item => item.eventType===`${prefix}_GYM_CONFIRMED`)) {
      const key = confirmedClickId(event, clickType), current = resolved.get(key);
      if (!current || event.eventType === `${prefix}_GYM_CONFIRMED`) resolved.set(key, event);
    }
    return resolved;
  };
  const resolvedDayPasses = resolvedConfirmations("DAY_PASS");
  const resolvedMemberships = resolvedConfirmations("MEMBERSHIP");
  const financialRecords = events.filter(event => ["DAY_PASS_GYM_CONFIRMED", "MEMBERSHIP_GYM_CONFIRMED", "MEMBERSHIP_CYCLE_GYM_CONFIRMED"].includes(event.eventType)).map(event => {
    const metadata=event.metadata as Record<string,unknown>|null,amount=typeof metadata?.attributedAmount==="number"&&Number.isFinite(metadata.attributedAmount)?Math.max(0,Math.round(metadata.attributedAmount*100)/100):0,type=event.eventType==="DAY_PASS_GYM_CONFIRMED"?"Day pass":"Membership";
    return { event, type, amount, email:typeof metadata?.customerEmail==="string"?metadata.customerEmail:event.user?.email??"", offer:typeof metadata?.offerName==="string"?metadata.offerName:type, periodStart:typeof metadata?.membershipPeriodStart==="string"?metadata.membershipPeriodStart:"", periodEnd:typeof metadata?.membershipPeriodEnd==="string"?metadata.membershipPeriodEnd:"" };
  }).filter(record=>record.amount>0);
  const dayPassAttributedRevenue=financialRecords.filter(record=>record.type==="Day pass").reduce((sum,record)=>sum+record.amount,0),membershipAttributedRevenue=financialRecords.filter(record=>record.type==="Membership").reduce((sum,record)=>sum+record.amount,0),totalAttributedRevenue=dayPassAttributedRevenue+membershipAttributedRevenue;
  const payingUsers = new Set(financialRecords.map(record => record.email.trim().toLowerCase()).filter(Boolean));
  const unclaimedGymIds=new Set(gyms.filter(gym=>gym.access.length===0).map(gym=>gym.id)),gymById=new Map(gyms.map(gym=>[gym.id,gym])),reportedClickIds=new Set<string>(),opportunities=new Map<string,{gym:string;purchases:number;dayPassPurchases:number;membershipPurchases:number;customers:Set<string>;estimated:number;dayPassEstimated:number;membershipEstimated:number}>();
  for(const confirmation of events.filter(event=>["DAY_PASS_CLAIM_CONFIRMED","MEMBERSHIP_CLAIM_CONFIRMED"].includes(event.eventType)&&event.gymId&&unclaimedGymIds.has(event.gymId))){const membership=confirmation.eventType==="MEMBERSHIP_CLAIM_CONFIRMED",clickType=membership?"MEMBERSHIP_CLICKED":"DAY_PASS_CLICKED",click=[...events].reverse().find(event=>event.eventType===clickType&&event.gymId===confirmation.gymId&&actor(event)===actor(confirmation)&&event.createdAt<=confirmation.createdAt);if(!click||reportedClickIds.has(click.id)||!click.gymId)continue;const prefix=membership?"MEMBERSHIP":"DAY_PASS",hasGymResponse=events.some(event=>event.visitId===`gym-confirm:${click.id}`&&[`${prefix}_GYM_CONFIRMED`,`${prefix}_GYM_DECLINED`].includes(event.eventType));if(hasGymResponse)continue;reportedClickIds.add(click.id);const metadata=click.metadata as Record<string,unknown>|null,optionId=typeof metadata?.optionId==="string"?metadata.optionId:"",terms=membershipTermsFromMetadata(metadata)??(membership?cleanMembershipOptions(gymById.get(click.gymId)?.membershipOptions).find(option=>option.id===optionId)??null:null),charge=membership&&terms?membershipChargeForPeriod(terms,day(click.createdAt),0):null,amount=Math.max(0,membership?(charge?.total??(typeof metadata?.price==="number"?metadata.price:0)):(typeof metadata?.price==="number"?metadata.price:0)),row=opportunities.get(click.gymId)??{gym:click.gym?.name??"Deleted gym",purchases:0,dayPassPurchases:0,membershipPurchases:0,customers:new Set<string>(),estimated:0,dayPassEstimated:0,membershipEstimated:0};row.purchases+=1;row[membership?"membershipPurchases":"dayPassPurchases"]+=1;row.estimated+=amount;row[membership?"membershipEstimated":"dayPassEstimated"]+=amount;row.customers.add(actor(confirmation));opportunities.set(click.gymId,row)}
  const estimatedAttributedRevenue=[...opportunities.values()].reduce((sum,row)=>sum+row.estimated,0),userReportedPurchases=[...opportunities.values()].reduce((sum,row)=>sum+row.purchases,0),potentialCustomers=new Set([...opportunities.values()].flatMap(row=>[...row.customers])).size;
  const membershipClicksById=new Map(events.filter(event=>event.eventType==="MEMBERSHIP_CLICKED").map(event=>[event.id,event])),endedMemberships=new Set(events.filter(event=>event.eventType==="MEMBERSHIP_GYM_ENDED").map(event=>{const metadata=event.metadata as Record<string,unknown>|null;return typeof metadata?.claimClickId==="string"?metadata.claimClickId:""}).filter(Boolean)),mrrByGym=new Map<string,number>();
  let totalMrr=0;
  for(const event of events.filter(event=>event.eventType==="MEMBERSHIP_GYM_CONFIRMED")){const metadata=event.metadata as Record<string,unknown>|null,clickId=typeof metadata?.claimClickId==="string"?metadata.claimClickId:"",startDate=typeof metadata?.membershipStartDate==="string"?metadata.membershipStartDate:"",click=membershipClicksById.get(clickId),terms=membershipTermsFromMetadata(click?.metadata);if(!click||!terms||!startDate||endedMemberships.has(clickId))continue;const contractEnd=membershipContractEnd(terms,new Date(`${startDate}T00:00:00Z`));if(contractEnd&&contractEnd<=new Date())continue;const mrr=recurringMonthlyPrice(terms);totalMrr+=mrr;if(event.gymId)mrrByGym.set(event.gymId,(mrrByGym.get(event.gymId)??0)+mrr)}

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Fitting In"; workbook.created = new Date(); workbook.modified = new Date();
  const eventTypes = [...new Set(events.map(event => event.eventType))].sort();
  const visitors = new Set(events.filter(event => event.eventType === "VISIT").map(actor));
  const visits = new Set(events.filter(event => event.eventType === "VISIT").map(event => event.visitId));

  const summary = workbook.addWorksheet("Overview");
  summary.columns = [{ header: "Metric", key: "metric" }, { header: "Value", key: "value" }];
  summary.addRows([
    { metric: "Export generated", value: new Date().toISOString() }, { metric: "Verified users", value: users.filter(user => !user.deletedAt).length }, { metric: "Deleted users retained", value: users.filter(user => user.deletedAt).length }, { metric: "Gym users", value: users.filter(user => !user.deletedAt && user.role === "GYM").length },
    { metric: "Gyms", value: gyms.length }, { metric: "Claimed gyms", value: gyms.filter(gym => gym.access.length > 0).length }, { metric: "Unique visitors", value: visitors.size }, { metric: "Visits", value: visits.size },
    { metric: "Confirmed day passes", value: resolvedDayPasses.size }, { metric: "Confirmed memberships", value: resolvedMemberships.size },
    { metric: "Total attributed revenue", value: totalAttributedRevenue }, { metric: "Day-pass attributed revenue", value: dayPassAttributedRevenue }, { metric: "Membership attributed revenue", value: membershipAttributedRevenue }, { metric: "Total MRR", value: totalMrr }, { metric: "Unique paying users", value: payingUsers.size }, { metric: "Gym-confirmed paid charges", value: financialRecords.length }, { metric: "User-reported purchases — unclaimed gyms", value:userReportedPurchases }, { metric: "Estimated attributed revenue — unclaimed gyms", value:estimatedAttributedRevenue }, { metric: "Potential customers supplied — unclaimed gyms", value:potentialCustomers },
    ...["DAY_PASS_CLICKED", "MEMBERSHIP_CLICKED", "DAY_PASS_SIGNUP", "MEMBERSHIP_SIGNUP"].map(type => ({ metric: type.toLowerCase().replaceAll("_", " "), value: events.filter(event => event.eventType === type).length })),
  ]); formatSheet(summary);

  const coverage = workbook.addWorksheet("Audit notes");
  coverage.columns = [{ header: "Item", key: "item" }, { header: "Value", key: "value" }];
  coverage.addRows([
    { item: "Export generated", value: new Date().toISOString() },
    { item: "Metrics history begins", value: latestReset?.createdAt.toISOString() ?? "Earliest retained record" },
    { item: "Daily reporting timezone", value: "UTC" },
    { item: "Raw behavior records included", value: "Yes — see Raw events" },
    { item: "Historical gym claim changes", value: "Only the current owner, claim timestamp, assignment source, and last-updated timestamp are retained by the database." },
    { item: "Historical account role changes", value: "Only the current role is retained by the database." },
  ]);
  formatSheet(coverage);

  type DailyRow = { visitors: Set<string>; visits: Set<string>; users: number; gymUsers: number; gyms: number; events: Map<string, number>; actors: Map<string, Set<string>>; sourceEvents: ExportEvent[]; durationMs: number };
  const emptyDailyRow = (): DailyRow => ({ visitors: new Set(), visits: new Set(), users: 0, gymUsers: 0, gyms: 0, events: new Map(), actors: new Map(), sourceEvents: [], durationMs: 0 });
  const dailyMap = new Map<string, DailyRow>();
  const getDailyRow = (date: string) => { const existing = dailyMap.get(date); if (existing) return existing; const created = emptyDailyRow(); dailyMap.set(date, created); return created; };
  const resetAt = latestReset?.createdAt ?? null;
  for (const user of users.filter(user => !user.deletedAt)) { if (resetAt && user.createdAt < resetAt) continue; const row = getDailyRow(day(user.createdAt)); row.users++; if (user.role === "GYM") row.gymUsers++; }
  for (const gym of gyms) { if (resetAt && gym.createdAt < resetAt) continue; getDailyRow(day(gym.createdAt)).gyms++; }
  for (const event of events) {
    const row = getDailyRow(day(event.createdAt)), eventActor = actor(event);
    row.visitors.add(event.visitorId); row.visits.add(event.visitId); row.sourceEvents.push(event); row.durationMs += event.durationMs ?? 0;
    row.events.set(event.eventType, (row.events.get(event.eventType) ?? 0) + 1);
    const actors = row.actors.get(event.eventType) ?? new Set<string>(); actors.add(eventActor); row.actors.set(event.eventType, actors);
  }
  const recordedDates = [...users.map(user => user.createdAt), ...gyms.map(gym => gym.createdAt), ...events.map(event => event.createdAt)];
  const today = day(new Date()), firstRecordedDay = latestReset ? day(latestReset.createdAt) : recordedDates.length ? day(new Date(Math.min(...recordedDates.map(date => date.getTime())))) : today;
  for (let cursor = new Date(`${firstRecordedDay}T00:00:00.000Z`), end = new Date(`${today}T00:00:00.000Z`); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) getDailyRow(day(cursor));
  const daily = workbook.addWorksheet("Daily metrics");
  daily.columns = [
    { header: "Date", key: "date" }, { header: "New users", key: "users" }, { header: "Total users", key: "totalUsers" }, { header: "New gym users", key: "gymUsers" }, { header: "Total gym users", key: "totalGymUsers" }, { header: "New gyms", key: "gyms" }, { header: "Total gyms", key: "totalGyms" },
    { header: "Unique visitors", key: "visitors" }, { header: "Visits", key: "visits" }, { header: "Returning visits", key: "returningVisits" }, { header: "Time spent (minutes)", key: "timeSpent" }, { header: "Gym profile opens", key: "gymOpens" }, { header: "Directions clicks", key: "directions" }, { header: "Website clicks", key: "website" }, { header: "Favorites added", key: "favoritesAdded" }, { header: "Favorites removed", key: "favoritesRemoved" }, { header: "Gyms added to comparison", key: "comparisons" }, { header: "Comparison views", key: "compareViews" },
    { header: "Day-pass clicks", key: "dayPassClicks" }, { header: "Unique day-pass clickers", key: "uniqueDayPassClickers" }, { header: "Confirmed day passes", key: "confirmedDayPasses" }, { header: "User-confirmed day passes", key: "userConfirmedDayPasses" }, { header: "Day passes confirmed by gym", key: "gymConfirmedDayPasses" }, { header: "Unique users who got a day pass", key: "uniqueDayPassClaimers" }, { header: "Day-pass signups", key: "dayPassSignups" }, { header: "Day-pass click rate", key: "dayPassClickRate" },
    { header: "Membership clicks", key: "membershipClicks" }, { header: "Unique membership clickers", key: "uniqueMembershipClickers" }, { header: "Confirmed memberships", key: "confirmedMemberships" }, { header: "User-confirmed memberships", key: "userConfirmedMemberships" }, { header: "Memberships confirmed by gym", key: "gymConfirmedMemberships" }, { header: "Unique users who got a membership", key: "uniqueMembershipClaimers" }, { header: "Membership signups", key: "membershipSignups" }, { header: "Membership click rate", key: "membershipClickRate" }, { header: "Filter uses", key: "filterUses" }, { header: "Location searches", key: "locationSearches" },
    ...eventTypes.map(type => ({ header: `Raw event: ${type}`, key: `raw:${type}` })),
  ];
  const eventCount = (row: DailyRow, type: string) => row.events.get(type) ?? 0;
  const uniqueActors = (row: DailyRow, types: string[]) => new Set(types.flatMap(type => [...(row.actors.get(type) ?? [])]));
  let totalUsers = resetAt ? users.filter(user => user.createdAt < resetAt).length : 0;
  let totalGymUsers = resetAt ? users.filter(user => user.createdAt < resetAt && user.role === "GYM").length : 0;
  let totalGyms = resetAt ? gyms.filter(gym => gym.createdAt < resetAt).length : 0;
  for (const [date, row] of [...dailyMap].sort(([a], [b]) => a.localeCompare(b))) {
    totalUsers += row.users; totalGymUsers += row.gymUsers; totalGyms += row.gyms;
    const profileViewers = uniqueActors(row, ["GYM_OPENED"]), dayPassClickers = uniqueActors(row, ["DAY_PASS_CLICKED"]), membershipClickers = uniqueActors(row, ["MEMBERSHIP_CLICKED"]);
    const confirmedDayPassEvents = [...resolvedDayPasses.values()].filter(event => day(event.createdAt) === date), confirmedMembershipEvents = [...resolvedMemberships.values()].filter(event => day(event.createdAt) === date), confirmedDayPasses = confirmedDayPassEvents.length, confirmedMemberships = confirmedMembershipEvents.length;
    daily.addRow({
      date, users: row.users, totalUsers, gymUsers: row.gymUsers, totalGymUsers, gyms: row.gyms, totalGyms, visitors: row.visitors.size, visits: row.visits.size, returningVisits: Math.max(0, row.visits.size - row.visitors.size), timeSpent: Number((row.durationMs / 60_000).toFixed(2)), gymOpens: eventCount(row, "GYM_OPENED"), directions: eventCount(row, "DIRECTIONS_CLICKED"), website: eventCount(row, "WEBSITE_CLICKED"), favoritesAdded: eventCount(row, "FAVORITE_ADDED"), favoritesRemoved: eventCount(row, "FAVORITE_REMOVED"), comparisons: eventCount(row, "COMPARE_ADDED"), compareViews: eventCount(row, "COMPARE_OPENED"),
      dayPassClicks: eventCount(row, "DAY_PASS_CLICKED"), uniqueDayPassClickers: dayPassClickers.size, confirmedDayPasses, userConfirmedDayPasses: eventCount(row, "DAY_PASS_CLAIM_CONFIRMED"), gymConfirmedDayPasses: eventCount(row, "DAY_PASS_GYM_CONFIRMED"), uniqueDayPassClaimers: new Set(confirmedDayPassEvents.map(actor)).size, dayPassSignups: eventCount(row, "DAY_PASS_SIGNUP"), dayPassClickRate: profileViewers.size ? Number((dayPassClickers.size / profileViewers.size * 100).toFixed(1)) : 0,
      membershipClicks: eventCount(row, "MEMBERSHIP_CLICKED"), uniqueMembershipClickers: membershipClickers.size, confirmedMemberships, userConfirmedMemberships: eventCount(row, "MEMBERSHIP_CLAIM_CONFIRMED"), gymConfirmedMemberships: eventCount(row, "MEMBERSHIP_GYM_CONFIRMED"), uniqueMembershipClaimers: new Set(confirmedMembershipEvents.map(actor)).size, membershipSignups: eventCount(row, "MEMBERSHIP_SIGNUP"), membershipClickRate: profileViewers.size ? Number((membershipClickers.size / profileViewers.size * 100).toFixed(1)) : 0, filterUses: eventCount(row, "FILTER_CHANGED"), locationSearches: eventCount(row, "LOCATION_SEARCHED") + eventCount(row, "LOCATION_USED"),
      ...Object.fromEntries(eventTypes.map(type => [`raw:${type}`, eventCount(row, type)])),
    });
  }
  formatSheet(daily);

  const rawEvents = workbook.addWorksheet("Raw events");
  rawEvents.columns = ["Event ID", "Date", "Timestamp", "Event type", "User email", "User ID", "Visitor ID", "Visit ID", "Gym", "Gym ID", "Path", "Duration ms", "Metadata"].map(header => ({ header, key: header }));
  for (const event of events) rawEvents.addRow({
    "Event ID": event.id, Date: day(event.createdAt), Timestamp: event.createdAt.toISOString(), "Event type": event.eventType, "User email": event.user?.email ?? "", "User ID": event.userId ?? "", "Visitor ID": event.visitorId, "Visit ID": event.visitId, Gym: event.gym?.name ?? "", "Gym ID": event.gymId ?? "", Path: event.path, "Duration ms": event.durationMs ?? "", Metadata: event.metadata == null ? "" : JSON.stringify(event.metadata),
  });
  formatSheet(rawEvents);

  const visitorUsers = new Map(events.filter(event => event.userId).map(event => [event.visitorId, event.userId!]));
  const userFor = (event: ExportEvent) => event.userId || visitorUsers.get(event.visitorId);
  const userReports = (userId: string, prefix: "DAY_PASS" | "MEMBERSHIP", confirmed: Set<string>) => new Set(events.filter(event => event.eventType === `${prefix}_CLAIM_CONFIRMED` && userFor(event) === userId).map(event => {
    return [...events].reverse().find(click => click.eventType === `${prefix}_CLICKED` && click.gymId === event.gymId && userFor(click) === userId && click.createdAt <= event.createdAt)?.id ?? event.id;
  }).filter(id => !confirmed.has(id))).size;
  const byUser = new Map(users.map(user => [user.id, { dayClicks: 0, dayConfirmIds: new Set<string>(), memberClicks: 0, memberConfirmIds: new Set<string>() }]));
  for (const event of events) if (userFor(event) && byUser.has(userFor(event)!)) { const row = byUser.get(userFor(event)!)!; if (event.eventType === "DAY_PASS_CLICKED") row.dayClicks++; if (event.eventType === "MEMBERSHIP_CLICKED") row.memberClicks++; }
  for (const [clickId,event] of resolvedDayPasses) { const userId=userFor(event)||events.find(item=>item.id===clickId)?.userId;if(userId&&byUser.has(userId))byUser.get(userId)!.dayConfirmIds.add(clickId); }
  for (const [clickId,event] of resolvedMemberships) { const userId=userFor(event)||events.find(item=>item.id===clickId)?.userId;if(userId&&byUser.has(userId))byUser.get(userId)!.memberConfirmIds.add(clickId); }
  const userSheet = workbook.addWorksheet("Users");
  userSheet.columns = ["Email", "Status", "Deleted at", "Role", "Admin", "Gym", "Created", "Email verified", "Last active", "Day-pass clicks", "Day-pass confirms", "Membership clicks", "Membership confirms", "User-reported day passes", "User-reported memberships"].map(header => ({ header, key: header }));
  for (const user of users) { const metrics = byUser.get(user.id)!; userSheet.addRow({ Email: user.email ?? "", Status: user.deletedAt ? "Deleted" : "Active", "Deleted at": user.deletedAt?.toISOString() ?? "", Role: user.role ?? "", Admin: !user.deletedAt && getUserAdminStatus(user) ? "Yes" : "No", Gym: user.gymAccesses.map(access => access.gym.name).join(", "), Created: user.createdAt.toISOString(), "Email verified": user.emailVerified?.toISOString() ?? "", "Last active": [user.lastLoginAt, ...events.filter(event => event.userId === user.id).map(event => event.createdAt)].filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0]?.toISOString() ?? "", "Day-pass clicks": metrics.dayClicks, "Day-pass confirms": metrics.dayConfirmIds.size, "Membership clicks": metrics.memberClicks, "Membership confirms": metrics.memberConfirmIds.size, "User-reported day passes": userReports(user.id, "DAY_PASS", metrics.dayConfirmIds), "User-reported memberships": userReports(user.id, "MEMBERSHIP", metrics.memberConfirmIds) }); }
  formatSheet(userSheet);

  const visitorEmails = new Map(events.filter(event => event.user?.email).map(event => [event.visitorId, event.user!.email!.toLowerCase()]));
  const behaviorActor = (event: ExportEvent) => event.user?.email?.toLowerCase() || visitorEmails.get(event.visitorId) || `visitor:${event.visitorId}`;
  const gymEventTypes = ["GYM_OPENED", "FAVORITE_ADDED", "COMPARE_ADDED", "DIRECTIONS_CLICKED", "WEBSITE_CLICKED", "DAY_PASS_CLICKED", "DAY_PASS_CLAIM_CONFIRMED", "DAY_PASS_GYM_CONFIRMED", "DAY_PASS_SIGNUP", "MEMBERSHIP_CLICKED", "MEMBERSHIP_CLAIM_CONFIRMED", "MEMBERSHIP_GYM_CONFIRMED", "MEMBERSHIP_SIGNUP"];
  const gymSheet = workbook.addWorksheet("Gym demand funnel");
  gymSheet.columns = [{ header: "Gym", key: "Gym" }, { header: "Report email", key: "Report email" }, { header: "Gym ID", key: "Gym ID" }, { header: "Customers supplied", key: "Customers supplied" }, { header: "MRR", key: "MRR" }, { header: "Confirmed day passes", key: "Confirmed day passes" }, { header: "Confirmed memberships", key: "Confirmed memberships" }, ...gymEventTypes.map(type => ({ header: type, key: type }))];
  for (const gym of gyms) { const gymEvents = events.filter(event => event.gymId === gym.id),customersSupplied=new Set(financialRecords.filter(record=>record.event.gymId===gym.id).map(record=>record.email.trim().toLowerCase()).filter(Boolean)).size; gymSheet.addRow({ Gym: gym.name, "Report email": gym.access[0]?.user.email || gym.contactEmail || "", "Gym ID": gym.id, "Customers supplied":customersSupplied, MRR:mrrByGym.get(gym.id)??0, "Confirmed day passes": [...resolvedDayPasses.values()].filter(event=>event.gymId===gym.id).length, "Confirmed memberships": [...resolvedMemberships.values()].filter(event=>event.gymId===gym.id).length, ...Object.fromEntries(gymEventTypes.map(type => [type, new Set(gymEvents.filter(event => event.eventType === type).map(behaviorActor)).size])) }); }
  formatSheet(gymSheet);

  const dailyGymSheet = workbook.addWorksheet("Daily gym demand");
  dailyGymSheet.columns = [{ header: "Date", key: "Date" }, { header: "Gym", key: "Gym" }, { header: "Gym ID", key: "Gym ID" }, { header: "Confirmed day passes", key: "Confirmed day passes" }, { header: "Confirmed memberships", key: "Confirmed memberships" }, ...gymEventTypes.flatMap(type => [{ header: `${type} events`, key: `${type}:events` }, { header: `${type} unique users`, key: `${type}:users` }])];
  const retainedDates = [...dailyMap.keys()].sort();
  for (const date of retainedDates) for (const gym of gyms) {
    const gymEvents = dailyMap.get(date)!.sourceEvents.filter(event => event.gymId === gym.id);
    dailyGymSheet.addRow({ Date: date, Gym: gym.name, "Gym ID": gym.id, "Confirmed day passes": [...resolvedDayPasses.values()].filter(event=>event.gymId===gym.id&&day(event.createdAt)===date).length, "Confirmed memberships": [...resolvedMemberships.values()].filter(event=>event.gymId===gym.id&&day(event.createdAt)===date).length, ...Object.fromEntries(gymEventTypes.flatMap(type => [[`${type}:events`, gymEvents.filter(event => event.eventType === type).length], [`${type}:users`, new Set(gymEvents.filter(event => event.eventType === type).map(behaviorActor)).size]])) });
  }
  formatSheet(dailyGymSheet);

  const claimSheet = workbook.addWorksheet("Claim activity log");
  claimSheet.columns = ["Type", "Email", "Gym", "Offer", "Clicked at", "Gym response", "Confirmed by user", "Confirmed by gym", "Claim status", "Confirmation timestamp", "User confirmed at", "Gym confirmed at", "Gym ID", "Claim ID"].map(header => ({ header, key: header }));
  for (const click of events.filter(event => ["DAY_PASS_CLICKED", "MEMBERSHIP_CLICKED"].includes(event.eventType))) { const prefix = click.eventType === "DAY_PASS_CLICKED" ? "DAY_PASS" : "MEMBERSHIP",nextClick=events.find(event=>event.eventType===click.eventType&&event.gymId===click.gymId&&actor(event)===actor(click)&&event.createdAt>click.createdAt),userConfirmation=events.find(event=>event.eventType===`${prefix}_CLAIM_CONFIRMED`&&event.gymId===click.gymId&&actor(event)===actor(click)&&event.createdAt>=click.createdAt&&(!nextClick||event.createdAt<nextClick.createdAt)),gymConfirmation=events.find(event=>event.eventType===`${prefix}_GYM_CONFIRMED`&&event.visitId===`gym-confirm:${click.id}`),gymDeclined=events.some(event=>event.eventType===`${prefix}_GYM_DECLINED`&&event.visitId===`gym-confirm:${click.id}`),cycleResponse=prefix==="MEMBERSHIP"?[...events].reverse().find(event=>["MEMBERSHIP_CYCLE_GYM_CONFIRMED","MEMBERSHIP_GYM_ENDED"].includes(event.eventType)&&((event.metadata as Record<string,unknown>|null)?.claimClickId===click.id)):null,latestGymResponse=cycleResponse??gymConfirmation,claimState=gymConfirmation?"Confirmed":gymDeclined?"Unconfirmed":userConfirmation?"User reported":"Unconfirmed",metadata=click.metadata as Record<string,unknown>|null,offerName=prefix==="MEMBERSHIP"&&typeof metadata?.optionName==="string"&&metadata.optionName.trim()?metadata.optionName.trim():prefix==="DAY_PASS"&&typeof metadata?.durationDays==="number"?`${metadata.durationDays}-day pass`:prefix==="MEMBERSHIP"?"Membership":"Day pass",offerPrice=typeof metadata?.price==="number"?` · $${metadata.price.toFixed(2)}`:"",gymResponse=cycleResponse?.eventType==="MEMBERSHIP_CYCLE_GYM_CONFIRMED"?"Active":cycleResponse?.eventType==="MEMBERSHIP_GYM_ENDED"?"Inactive":gymConfirmation?"Purchased":gymDeclined?"Not Purchased":""; claimSheet.addRow({ Type: prefix === "DAY_PASS" ? "Day pass" : "Membership", Email: click.user?.email ?? "", Gym: click.gym?.name ?? "Deleted gym", Offer:`${offerName}${offerPrice}`, "Clicked at": click.createdAt.toISOString(), "Gym response":gymResponse, "Confirmed by user": userConfirmation ? "Yes" : "No", "Confirmed by gym": latestGymResponse ? "Yes" : "No", "Claim status":claimState, "Confirmation timestamp": latestGymResponse?.createdAt.toISOString() ?? userConfirmation?.createdAt.toISOString() ?? "", "User confirmed at": userConfirmation?.createdAt.toISOString() ?? "", "Gym confirmed at": latestGymResponse?.createdAt.toISOString() ?? "", "Gym ID": click.gymId ?? "", "Claim ID": click.id }); }
  formatSheet(claimSheet);
  for (const [type, label] of [["Day pass", "User-reported day passes"], ["Membership", "User-reported memberships"]]) {
    let reported = 0;
    claimSheet.eachRow((row, index) => { if (index > 1 && row.getCell("Type").value === type && row.getCell("Claim status").value === "User reported") reported++; });
    summary.addRow({ metric: label, value: reported });
  }

  const financialSheet = workbook.addWorksheet("Financial ledger");
  financialSheet.columns = ["Confirmed at", "Gym", "User", "Type", "Offer", "Billing period start", "Billing period end", "Attributed revenue", "Source event ID"].map(header => ({ header, key: header }));
  for (const record of financialRecords) financialSheet.addRow({ "Confirmed at":record.event.createdAt.toISOString(), Gym:record.event.gym?.name??"Deleted gym", User:record.email, Type:record.type, Offer:record.offer, "Billing period start":record.periodStart, "Billing period end":record.periodEnd, "Attributed revenue":record.amount, "Source event ID":record.event.id });
  formatSheet(financialSheet);

  const opportunitySheet=workbook.addWorksheet("Unclaimed gym opportunity");
  opportunitySheet.columns=["Gym","User-reported purchases","Day-pass purchases","Membership purchases","Potential customers","Estimated day-pass revenue","Estimated membership revenue","Estimated attributed revenue"].map(header=>({header,key:header}));
  for(const row of [...opportunities.values()].sort((a,b)=>b.estimated-a.estimated||a.gym.localeCompare(b.gym)))opportunitySheet.addRow({Gym:row.gym,"User-reported purchases":row.purchases,"Day-pass purchases":row.dayPassPurchases,"Membership purchases":row.membershipPurchases,"Potential customers":row.customers.size,"Estimated day-pass revenue":row.dayPassEstimated,"Estimated membership revenue":row.membershipEstimated,"Estimated attributed revenue":row.estimated});
  formatSheet(opportunitySheet);

  const filterSheet = workbook.addWorksheet("Filter usage");
  filterSheet.columns = [{ header: "Filter category", key: "category" }, { header: "Unique users", key: "users" }];
  const categories = ["Distance", "Day-pass price", "Membership price", "Gym type", "Equipment", "Amenities"];
  const matchesFilterCategory = (event: ExportEvent, category: string) => event.eventType === "FILTER_CHANGED" && filterCategory(event.metadata) === category;
  for (const category of categories) { const actors = new Set(events.filter(event => matchesFilterCategory(event, category)).map(actor)); filterSheet.addRow({ category, users: actors.size }); }
  formatSheet(filterSheet);

  const dailyFilters = workbook.addWorksheet("Daily filter usage");
  dailyFilters.columns = [{ header: "Date", key: "date" }, { header: "Filter category", key: "category" }, { header: "Uses", key: "uses" }, { header: "Unique users", key: "users" }];
  for (const date of retainedDates) for (const category of categories) { const matching = dailyMap.get(date)!.sourceEvents.filter(event => matchesFilterCategory(event, category)); dailyFilters.addRow({ date, category, uses: matching.length, users: new Set(matching.map(actor)).size }); }
  formatSheet(dailyFilters);

  const citySheet = workbook.addWorksheet("Popular cities");
  citySheet.columns = [{ header: "City", key: "city" }, { header: "State", key: "state" }, { header: "Country", key: "country" }, { header: "Unique users", key: "users" }];
  const cities = new Map<string, { city: string; state: string; country: string; users: Set<string> }>();
  for (const event of events.filter(event => ["LOCATION_SEARCHED", "LOCATION_USED"].includes(event.eventType))) { const data = event.metadata as Record<string, unknown> | null; const city = typeof data?.city === "string" ? data.city.trim() : ""; if (!city) continue; const state = typeof data?.state === "string" ? data.state.trim() : ""; const country = typeof data?.country === "string" ? data.country.trim() : ""; const key = `${city.toLowerCase()}|${state.toLowerCase()}|${country.toLowerCase()}`; const row = cities.get(key) ?? { city, state, country, users: new Set() }; row.users.add(actor(event)); cities.set(key, row); }
  for (const row of [...cities.values()].sort((a, b) => b.users.size - a.users.size)) citySheet.addRow({ city: row.city, state: row.state, country: row.country, users: row.users.size });
  formatSheet(citySheet);

  const dailyCities = workbook.addWorksheet("Daily city activity");
  dailyCities.columns = [{ header: "Date", key: "date" }, { header: "City", key: "city" }, { header: "State", key: "state" }, { header: "Country", key: "country" }, { header: "Searches / location uses", key: "uses" }, { header: "Unique users", key: "users" }];
  const dailyCityRows = new Map<string, { date: string; city: string; state: string; country: string; uses: number; users: Set<string> }>();
  for (const event of events.filter(event => ["LOCATION_SEARCHED", "LOCATION_USED"].includes(event.eventType))) {
    const data = event.metadata as Record<string, unknown> | null, city = typeof data?.city === "string" ? data.city.trim() : ""; if (!city) continue;
    const date = day(event.createdAt), state = typeof data?.state === "string" ? data.state.trim() : "", country = typeof data?.country === "string" ? data.country.trim() : "", key = `${date}|${city.toLowerCase()}|${state.toLowerCase()}|${country.toLowerCase()}`;
    const row = dailyCityRows.get(key) ?? { date, city, state, country, uses: 0, users: new Set<string>() }; row.uses++; row.users.add(actor(event)); dailyCityRows.set(key, row);
  }
  for (const row of [...dailyCityRows.values()].sort((a, b) => a.date.localeCompare(b.date) || b.users.size - a.users.size)) dailyCities.addRow({ date: row.date, city: row.city, state: row.state, country: row.country, uses: row.uses, users: row.users.size });
  formatSheet(dailyCities);

  const claims = workbook.addWorksheet("Gym claim log");
  claims.columns = ["Gym", "Claimed", "Claimed by", "Claimed at", "Assigned by", "Last updated"].map(header => ({ header, key: header }));
  for (const gym of gyms) { const access = gym.access[0]; claims.addRow({ Gym: gym.name, Claimed: access ? "Yes" : "No", "Claimed by": access?.user.email ?? "", "Claimed at": access?.createdAt.toISOString() ?? "", "Assigned by": access?.assignedByEmail ?? "", "Last updated": gym.updatedAt.toISOString() }); }
  formatSheet(claims);

  // Keep each sortable table on its own tab; never mix totals into detail rows.
  const addTable = (name: string, headers: string[]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = headers.map(header => ({ header, key: header }));
    return sheet;
  };
  const count = (type: string) => events.filter(event => event.eventType === type).length;
  const unique = (type: string) => new Set(events.filter(event => event.eventType === type).map(behaviorActor)).size;
  const demand = addTable("Landing-page demand", ["Metric", "Value", "Meaning"]);
  demand.addRows([
    ["Unique visitors", new Set(events.map(event => event.visitorId)).size, "Distinct visitor IDs in retained activity"],
    ["Visits", new Set(events.map(event => event.visitId)).size, "Distinct visits in retained activity"],
    ["Returning visits", Math.max(0, new Set(events.map(event => event.visitId)).size - new Set(events.map(event => event.visitorId)).size), "Visits minus visitors"],
    ...[["Gym profile opens", "GYM_OPENED"], ["Directions clicks", "DIRECTIONS_CLICKED"], ["Website clicks", "WEBSITE_CLICKED"], ["Favorites added", "FAVORITE_ADDED"], ["Favorites removed", "FAVORITE_REMOVED"], ["Gyms added to comparison", "COMPARE_ADDED"], ["Comparison views", "COMPARE_OPENED"], ["Day-pass clicks", "DAY_PASS_CLICKED"], ["Day-pass signups", "DAY_PASS_SIGNUP"], ["Membership clicks", "MEMBERSHIP_CLICKED"], ["Membership signups", "MEMBERSHIP_SIGNUP"], ["Filter uses", "FILTER_CHANGED"]].map(([label, type]) => [label, count(type), "Number of recorded actions"]),
    ["Location searches", count("LOCATION_SEARCHED") + count("LOCATION_USED"), "Searches and use-my-location actions"],
    ["Unique day-pass clickers", unique("DAY_PASS_CLICKED"), "People who clicked a day pass"],
    ["Unique membership clickers", unique("MEMBERSHIP_CLICKED"), "People who clicked a membership"],
    ["Confirmed day passes", resolvedDayPasses.size, "Distinct gym-confirmed purchases"],
    ["Confirmed memberships", resolvedMemberships.size, "Distinct gym-confirmed purchases"],
    ["Unique users who got a day pass", unique("DAY_PASS_GYM_CONFIRMED"), "People with a gym-confirmed day pass"],
    ["Unique users who got a membership", unique("MEMBERSHIP_GYM_CONFIRMED"), "People with a gym-confirmed membership"],
  ]);

  // Supply the actual cumulative chart series (daily distinct counts cannot be summed).
  const growth = addTable("User and demand growth", ["Date", "Users", "Unique visitors", "Gym profiles opened", "Unique day-pass clickers", "Confirmed day passes", "Unique membership clickers", "Confirmed memberships"]);
  const trendVisitors = new Set<string>(), trendDay = new Set<string>(), trendMember = new Set<string>(), trendDayConfirmed = new Set<string>(), trendMemberConfirmed = new Set<string>();
  let opens = 0;
  for (const date of retainedDates) {
    for (const event of dailyMap.get(date)!.sourceEvents) {
      trendVisitors.add(event.visitorId);
      if (event.eventType === "GYM_OPENED") opens++;
      if (event.eventType === "DAY_PASS_CLICKED") trendDay.add(behaviorActor(event));
      if (event.eventType === "MEMBERSHIP_CLICKED") trendMember.add(behaviorActor(event));
      if (event.eventType === "DAY_PASS_GYM_CONFIRMED") trendDayConfirmed.add(confirmedClickId(event, "DAY_PASS_CLICKED"));
      if (event.eventType === "MEMBERSHIP_GYM_CONFIRMED") trendMemberConfirmed.add(confirmedClickId(event, "MEMBERSHIP_CLICKED"));
    }
    growth.addRow([date, users.filter(user => !user.deletedAt && day(user.createdAt) <= date).length, trendVisitors.size, opens, trendDay.size, trendDayConfirmed.size, trendMember.size, trendMemberConfirmed.size]);
  }

  const revenueHeaders = ["Total revenue", "Day-pass revenue", "Membership revenue", "Paid charges", "Average charge"];
  const revenueTotals = (records: typeof financialRecords) => {
    const total = records.reduce((sum, record) => sum + Math.round(record.amount * 100), 0) / 100;
    return [total, records.filter(record => record.type === "Day pass").reduce((sum, record) => sum + Math.round(record.amount * 100), 0) / 100, records.filter(record => record.type === "Membership").reduce((sum, record) => sum + Math.round(record.amount * 100), 0) / 100, records.length, records.length ? total / records.length : 0];
  };
  const revenueByGym = addTable("Revenue by gym", ["Gym", "Customers supplied", "Monthly recurring revenue", ...revenueHeaders, "Gym ID"]);
  const revenueGymIds = new Set([...gyms.map(gym => gym.id), ...financialRecords.map(record => record.event.gymId ?? "deleted")]);
  const gymTotals: number[] = [];
  for (const id of revenueGymIds) {
    const records = financialRecords.filter(record => (record.event.gymId ?? "deleted") === id);
    const totals = revenueTotals(records);
    if (totals[0] > 0) gymTotals.push(totals[0]);
    revenueByGym.addRow([gymById.get(id)?.name ?? "Deleted gym", new Set(records.map(record => record.email.toLowerCase() || "Unknown user")).size, mrrByGym.get(id) ?? 0, ...totals, id]);
  }
  const spending = addTable("User spending", ["User email", "Total spent", "Day-pass spending", "Membership spending", "Confirmed payments", "Average payment"]);
  for (const email of new Set(financialRecords.map(record => record.email.toLowerCase() || "Unknown user"))) {
    spending.addRow([email, ...revenueTotals(financialRecords.filter(record => (record.email.toLowerCase() || "Unknown user") === email))]);
  }
  const offers = addTable("Revenue by offer", ["Gym", "Type", "Offer", "Paid charges", "Revenue", "Gym ID"]);
  const offerGroups = new Map<string, typeof financialRecords>();
  for (const record of financialRecords) {
    const key = JSON.stringify([record.event.gymId, record.type, record.offer]);
    const group = offerGroups.get(key) ?? []; group.push(record); offerGroups.set(key, group);
  }
  for (const records of offerGroups.values()) {
    const first = records[0];
    offers.addRow([first.event.gym?.name ?? "Deleted gym", first.type, first.offer, records.length, revenueTotals(records)[0], first.event.gymId ?? "deleted"]);
  }
  gymTotals.sort((a, b) => a - b);
  const middle = Math.floor(gymTotals.length / 2);
  const financial = addTable("Financial Metrics", ["Metric", "Value", "Meaning"]);
  financial.addRows([
    ["Total attributed revenue", totalAttributedRevenue, "USD; gym-confirmed paid charges only"],
    ["Day-pass attributed revenue", dayPassAttributedRevenue, "USD"],
    ["Membership attributed revenue", membershipAttributedRevenue, "USD"],
    ["Total MRR", totalMrr, "USD per month; active memberships"],
    ["Revenue-generating gyms", gymTotals.length, "Gyms with positive confirmed revenue"],
    ["Listed gyms", gyms.filter(gym => gym.isPublished).length, "Currently published gyms"],
    ["Average revenue per revenue-generating gym", gymTotals.length ? totalAttributedRevenue / gymTotals.length : 0, "USD"],
    ["Median revenue per revenue-generating gym", gymTotals.length ? (gymTotals.length % 2 ? gymTotals[middle] : (gymTotals[middle - 1] + gymTotals[middle]) / 2) : 0, "USD"],
    ["Paying users", payingUsers.size, "Distinct customer emails"],
    ["Paid charges", financialRecords.length, "Gym-confirmed paid charges"],
  ]);
  const membershipPeriods = events.filter(event => event.eventType === "MEMBERSHIP_GYM_CONFIRMED").flatMap(event => {
    const data = event.metadata as Record<string, unknown> | null;
    const clickId = typeof data?.claimClickId === "string" ? data.claimClickId : "";
    const click = membershipClicksById.get(clickId), terms = membershipTermsFromMetadata(click?.metadata);
    if (!terms || typeof data?.membershipStartDate !== "string") return [];
    const contractEnd = membershipContractEnd(terms, new Date(`${data.membershipStartDate}T00:00:00Z`));
    const endedAt = events.filter(item => item.eventType === "MEMBERSHIP_GYM_ENDED" && (item.metadata as Record<string, unknown> | null)?.claimClickId === clickId).at(-1)?.createdAt;
    const end = contractEnd && endedAt ? new Date(Math.min(contractEnd.getTime(), endedAt.getTime())) : contractEnd ?? endedAt;
    return [{ gymId: event.gymId ?? click?.gymId ?? "deleted", start: day(event.createdAt), end: end ? day(end) : null, mrr: recurringMonthlyPrice(terms) }];
  });
  const financialGrowth = addTable("Financial growth", ["Gym", "Date", "Total revenue", "Day-pass revenue", "Membership revenue", "Monthly recurring revenue", "Customers supplied", "Gym ID"]);
  for (const id of ["all", ...revenueGymIds]) {
    const records = financialRecords.filter(record => id === "all" || (record.event.gymId ?? "deleted") === id);
    const customers = new Set<string>(); let total = 0, dayPass = 0, membership = 0;
    const recordsByDate = new Map<string, typeof financialRecords>();
    for (const record of records) { const date = day(record.event.createdAt), group = recordsByDate.get(date) ?? []; group.push(record); recordsByDate.set(date, group); }
    for (const date of retainedDates) {
      for (const record of recordsByDate.get(date) ?? []) {
        const cents = Math.round(record.amount * 100); total += cents;
        if (record.type === "Day pass") dayPass += cents; else membership += cents;
        customers.add(record.email.toLowerCase() || "Unknown user");
      }
      const mrr = membershipPeriods.filter(period => (id === "all" || period.gymId === id) && period.start <= date && (!period.end || date < period.end)).reduce((sum, period) => sum + Math.round(period.mrr * 100), 0) / 100;
      financialGrowth.addRow([id === "all" ? "All gyms (combined)" : gymById.get(id)?.name ?? "Deleted gym", date, total / 100, dayPass / 100, membership / 100, mrr, customers.size, id]);
    }
  }

  // One row per gym assignment makes exact gym filtering possible for multi-gym users.
  const userGyms = addTable("User gym access", ["Gym", "User email", "Account status", "Gym ID"]);
  for (const user of users) for (const access of user.gymAccesses) userGyms.addRow([access.gym.name, user.email ?? "", user.deletedAt ? "Deleted" : "Active", access.gym.id]);
  const signupSheet = addTable("Signup activity", ["Gym", "User email", "Type", "Clicked at", "Signed up at", "Gym ID"]);
  for (const event of events.filter(event => ["DAY_PASS_SIGNUP", "MEMBERSHIP_SIGNUP"].includes(event.eventType))) {
    const data = event.metadata as Record<string, unknown> | null;
    signupSheet.addRow([event.gym?.name ?? "Deleted gym", event.user?.email ?? data?.email ?? "Unknown user", event.eventType === "DAY_PASS_SIGNUP" ? "Day pass" : "Membership", data?.clickedAt ?? event.createdAt.toISOString(), event.createdAt.toISOString(), event.gymId ?? ""]);
  }

  // Plain-English event labels retain the distinctions between actions and people.
  const eventLabel = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^gym opened$/, "Gym profile opens").replace(/gym confirmed/g, "confirmed by gym").replace(/claim confirmed/g, "reported by user").replace(/^./, char => char.toUpperCase());
  for (const sheet of [gymSheet, dailyGymSheet]) sheet.getRow(1).eachCell(cell => {
    const title = String(cell.value);
    const type = gymEventTypes.find(type => title.startsWith(type));
    if (type) cell.value = `${eventLabel(type)} (${title.endsWith(" events") ? "actions" : "unique people"})`;
  });
  // Technical daily event columns remain available in the hidden Raw events tab.
  const firstRaw = daily.columns.findIndex(column => String(column.header).startsWith("Raw event:"));
  if (firstRaw >= 0) daily.spliceColumns(firstRaw + 1, daily.columnCount - firstRaw);
  // Keep gym names at the left of the tables where people look up gyms.
  for (const sheet of [claimSheet, financialSheet, dailyGymSheet]) {
    const gymColumn = sheet.columns.findIndex(column => column.header === "Gym") + 1;
    if (gymColumn > 1) {
      const values = Array.from({ length: sheet.rowCount }, (_, index) => sheet.getRow(index + 1).getCell(gymColumn).value);
      sheet.spliceColumns(gymColumn, 1); sheet.spliceColumns(1, 0, values);
    }
  }
  const guide = addTable("Start here", ["Topic or tab", "How to use it"]);
  guide.addRows([
    ["Last refreshed (UTC)", new Date().toISOString()],
    ["Reporting period", "All retained history. Summary tabs match All time; use dates in activity and growth tabs for history."],
    ["Find a gym", "Open Gym demand funnel, Revenue by gym, Gym claim log, or Claim activity log. Click the filter arrow on Gym, search its name, and select it."],
    ["Sort data", "Use the header filter arrow to sort A–Z or largest–smallest. Always sort the whole table so rows stay together."],
    ["Personal filters", "In Google Sheets, use Data > Filter views to save your own view without changing someone else's view."],
    ["Find text", "Use Ctrl+F (Windows) or Command+F (Mac) to find a gym, email, city, or offer in a tab."],
    ["Automatic refresh", "This is a reporting copy. Values and standard layout are replaced by the app sync; keep personal notes in a separate tab."],
    ["Money", "Amounts are USD. Estimated revenue is user-reported and is separate from gym-confirmed revenue. MRR means monthly recurring revenue."],
    ["Growth tabs", "Cumulative totals at the end of each UTC date. Do not sum cumulative rows. Financial growth includes All gyms (combined); filter to one gym or the combined row group."],
    ["User gym access", "One row per gym and user, for exact gym filtering. Users contains one row per account."],
    ["Supporting history", "Daily metrics, Daily gym demand, Daily filter usage, Daily city activity, Raw events, and Audit notes are hidden. Unhide them for detailed analysis."],
    ["History limits", "Only retained database records are available. Metric resets remove earlier event history; account and ownership fields show current state."],
  ]);
  const tabOrder = ["Start here", "Overview", "Users", "User gym access", "Gym claim log", "Landing-page demand", "User and demand growth", "Gym demand funnel", "Claim activity log", "Signup activity", "Popular cities", "Filter usage", "Financial Metrics", "Financial growth", "Revenue by gym", "Unclaimed gym opportunity", "User spending", "Revenue by offer", "Financial ledger", "Daily metrics", "Daily gym demand", "Daily filter usage", "Daily city activity", "Raw events", "Audit notes"];
  const hiddenTabs = new Set(["Daily metrics", "Daily gym demand", "Daily filter usage", "Daily city activity", "Raw events", "Audit notes"]);
  const ordered = new ExcelJS.Workbook();
  ordered.creator = workbook.creator; ordered.created = workbook.created; ordered.modified = workbook.modified;
  for (const name of tabOrder) {
    const source = workbook.getWorksheet(name)!;
    formatSheet(source);
    source.state = hiddenTabs.has(name) ? "hidden" : "visible";
    if (name === "Start here") { source.getColumn(2).width = 100; source.getColumn(2).alignment = { wrapText: true, vertical: "middle" }; }
    if (["Overview", "Financial Metrics"].includes(name)) source.eachRow((row, index) => {
      if (index > 1 && typeof row.getCell(2).value === "number" && /revenue|MRR/i.test(row.getCell(1).text) && !/Revenue-generating gyms/.test(row.getCell(1).text)) row.getCell(2).numFmt = '"$"#,##0.00';
    });
    source.getRow(1).height = 42;
    source.getRow(1).alignment = { vertical: "middle", wrapText: true };
    source.eachRow((row, index) => {
      if (index > 1 && index % 2 === 0) row.eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } }; });
    });
    source.columns.forEach(column => {
      const header = String(source.getRow(1).getCell(column.number!).value);
      if (/revenue|spending|spent|charge$|payment$|MRR|Monthly recurring/i.test(header) && !/charges/i.test(header)) column.numFmt = '"$"#,##0.00';
      if (/rate/i.test(header)) column.numFmt = '0.0"%"';
    });
    // ID fields are available for audits without distracting from readable names.
    source.columns.forEach(column => { if (/ ID$/.test(String(source.getRow(1).getCell(column.number!).value))) column.hidden = true; });
    const target = ordered.addWorksheet(name);
    target.model = { ...source.model, id: target.id };
    target.state = source.state;
    if (!hiddenTabs.has(name) && name !== "Start here") guide.addRow([name, `Matches the ${name} section or its supporting detail on the admin overview.`]);
  }
  // The guide was extended while copying; copy it again to include the tab directory.
  formatSheet(guide);
  guide.getColumn(2).width = 100;
  ordered.getWorksheet("Start here")!.model = { ...guide.model, id: ordered.getWorksheet("Start here")!.id };
  return ordered;

}
