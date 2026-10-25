import { EASTERN_TIMESTAMP_FORMAT, easternTimestampSerial, easternTimestampText } from "@/lib/metrics-reporting-time";
import ExcelJS from "exceljs";
import { getUserAdminStatus } from "@/lib/admin";
import { filterCategory } from "@/lib/metrics-filter-category";
import { db } from "@/prisma/client";
import { membershipChargeForPeriod, membershipTermsFromMetadata } from "@/lib/membership-attribution";
import { cleanMembershipOptions } from "@/lib/memberships";

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

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Browse Gyms"; workbook.created = new Date(); workbook.modified = new Date();
  const summary = workbook.addWorksheet("Overview");
  summary.columns = ["Metric", "Value", "Past week", "Past month", "Past year"].map(header => ({ header, key: header }));
  const overviewNow = Date.now();
  const overviewForPeriod = (days: number) => {
    const since = days ? overviewNow - days * 86_400_000 : -Infinity;
    const scopedEvents = events.filter(event => event.createdAt.getTime() >= since);
    const scopedUsers = users.filter(user => !user.deletedAt && user.createdAt.getTime() >= since);
    const visitEvents = scopedEvents.filter(event => event.eventType === "VISIT");
    const count = (type: string) => scopedEvents.filter(event => event.eventType === type).length;
    const claims = (prefix: "DAY_PASS" | "MEMBERSHIP") => {
      const clickType = `${prefix}_CLICKED` as "DAY_PASS_CLICKED" | "MEMBERSHIP_CLICKED";
      const clicks = new Set(scopedEvents.filter(event => event.eventType === clickType).map(event => event.id));
      // Responses can arrive after the click; scope purchases by the original click, as the dashboard does.
      const keys = (suffix: string) => new Set(events.filter(event => event.eventType === `${prefix}_${suffix}`).map(event => confirmedClickId(event, clickType)));
      const confirmed = keys("GYM_CONFIRMED"), declined = keys("GYM_DECLINED");
      return `${clicks.size} / ${[...confirmed].filter(id => clicks.has(id)).length} / ${[...keys("CLAIM_CONFIRMED")].filter(id => clicks.has(id) && !confirmed.has(id) && !declined.has(id)).length}`;
    };
    return [
      `${scopedUsers.length} / ${scopedUsers.filter(user => user.role === "GYM").length}`,
      `${new Set(visitEvents.map(actor)).size} / ${new Set(visitEvents.map(event => event.visitId)).size}`,
      claims("DAY_PASS"), claims("MEMBERSHIP"),
      `${count("DAY_PASS_SIGNUP")} / ${count("MEMBERSHIP_SIGNUP")}`,
    ];
  };
  const overviewPeriods = [0, 7, 30, 365].map(overviewForPeriod);
  ["Total Users / Gym Users", "Visitors / Visits", "Day-pass Clicks / Confirmed / User Reported", "Membership Clicks / Confirmed / User Reported", "Day-pass Signups / Membership Signups"].forEach((label, index) => summary.addRow([label, ...overviewPeriods.map(period => period[index])]));
  for (const column of [3, 4, 5]) summary.getColumn(column).hidden = true;
  formatSheet(summary);

  const dailyMap = new Map<string, { sourceEvents: ExportEvent[] }>();
  const getDailyRow = (date: string) => {
    const row = dailyMap.get(date) ?? { sourceEvents: [] };
    dailyMap.set(date, row);
    return row;
  };
  for (const event of events) getDailyRow(day(event.createdAt)).sourceEvents.push(event);
  const recordedDates = [...users.map(user => user.createdAt), ...gyms.map(gym => gym.createdAt), ...events.map(event => event.createdAt)];
  const today = day(new Date()), firstRecordedDay = latestReset ? day(latestReset.createdAt) : recordedDates.length ? day(new Date(Math.min(...recordedDates.map(date => date.getTime())))) : today;
  for (let cursor = new Date(`${firstRecordedDay}T00:00:00.000Z`), end = new Date(`${today}T00:00:00.000Z`); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) getDailyRow(day(cursor));
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
  const gymSheet = workbook.addWorksheet("Gym demand funnel");
  gymSheet.columns = ["Gym", "Profile opens", "Favorites", "Compared", "Website visits", "Day-pass clicks / confirms", "Day-pass signups", "Day-pass rate", "Membership clicks / confirms", "Membership signups", "Membership rate"].map(header => ({ header, key: header }));
  for (const gym of gyms) {
    const gymEvents = events.filter(event => event.gymId === gym.id);
    const unique = (type: string) => new Set(gymEvents.filter(event => event.eventType === type).map(behaviorActor)).size;
    const opens = unique("GYM_OPENED"), dayClicks = unique("DAY_PASS_CLICKED"), memberClicks = unique("MEMBERSHIP_CLICKED");
    gymSheet.addRow([gym.name, opens, unique("FAVORITE_ADDED"), unique("COMPARE_ADDED"), unique("WEBSITE_CLICKED"), `${dayClicks} / ${unique("DAY_PASS_GYM_CONFIRMED")}`, unique("DAY_PASS_SIGNUP"), opens ? Math.round(dayClicks / opens * 100) : 0, `${memberClicks} / ${unique("MEMBERSHIP_GYM_CONFIRMED")}`, unique("MEMBERSHIP_SIGNUP"), opens ? Math.round(memberClicks / opens * 100) : 0]);
  }
  formatSheet(gymSheet);

  const claimSheet = workbook.addWorksheet("Claim activity log");
  claimSheet.columns = ["Type", "Email", "Gym", "Offer", "Clicked at", "Gym response", "Confirmed by user", "Confirmed by gym", "Claim status", "Confirmation timestamp", "User confirmed at", "Gym confirmed at", "Gym ID", "Claim ID", "User response"].map(header => ({ header, key: header }));
  for (const click of events.filter(event => ["DAY_PASS_CLICKED", "MEMBERSHIP_CLICKED"].includes(event.eventType)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) { const prefix = click.eventType === "DAY_PASS_CLICKED" ? "DAY_PASS" : "MEMBERSHIP",nextClick=events.find(event=>event.eventType===click.eventType&&event.gymId===click.gymId&&behaviorActor(event)===behaviorActor(click)&&event.createdAt>click.createdAt),userOutcome=[...events].reverse().find(event=>[`${prefix}_CLAIM_CONFIRMED`,`${prefix}_CLAIM_DECLINED`].includes(event.eventType)&&event.gymId===click.gymId&&behaviorActor(event)===behaviorActor(click)&&event.createdAt>=click.createdAt&&(!nextClick||event.createdAt<nextClick.createdAt)),userConfirmation=userOutcome?.eventType===`${prefix}_CLAIM_CONFIRMED`?userOutcome:null,gymConfirmation=events.find(event=>event.eventType===`${prefix}_GYM_CONFIRMED`&&event.visitId===`gym-confirm:${click.id}`),gymDeclined=events.some(event=>event.eventType===`${prefix}_GYM_DECLINED`&&event.visitId===`gym-confirm:${click.id}`),cycleResponse=prefix==="MEMBERSHIP"?[...events].reverse().find(event=>["MEMBERSHIP_CYCLE_GYM_CONFIRMED","MEMBERSHIP_GYM_ENDED"].includes(event.eventType)&&((event.metadata as Record<string,unknown>|null)?.claimClickId===click.id)):null,latestGymResponse=cycleResponse??gymConfirmation,claimState=gymConfirmation?"Confirmed":gymDeclined?"Unconfirmed":userConfirmation?"User reported":"Unconfirmed",metadata=click.metadata as Record<string,unknown>|null,offerName=prefix==="MEMBERSHIP"&&typeof metadata?.optionName==="string"&&metadata.optionName.trim()?metadata.optionName.trim():prefix==="DAY_PASS"&&typeof metadata?.durationDays==="number"?`${metadata.durationDays}-day pass`:prefix==="MEMBERSHIP"?"Membership":"Day pass",offerPrice=typeof metadata?.price==="number"?` · $${metadata.price.toFixed(2)}`:"",gymResponse=cycleResponse?.eventType==="MEMBERSHIP_CYCLE_GYM_CONFIRMED"?"Active":cycleResponse?.eventType==="MEMBERSHIP_GYM_ENDED"?"Inactive":gymConfirmation?"Purchased":gymDeclined?"Not Purchased":""; claimSheet.addRow({ Type: prefix === "DAY_PASS" ? "Day pass" : "Membership", Email: click.user?.email ?? visitorEmails.get(click.visitorId) ?? "", Gym: click.gym?.name ?? "Deleted gym", Offer:`${offerName}${offerPrice}`, "Clicked at": click.createdAt.toISOString(), "Gym response":gymResponse, "Confirmed by user": userConfirmation ? "Yes" : "No", "Confirmed by gym": latestGymResponse ? "Yes" : "No", "Claim status":claimState, "Confirmation timestamp": latestGymResponse?.createdAt.toISOString() ?? userConfirmation?.createdAt.toISOString() ?? "", "User confirmed at": userConfirmation?.createdAt.toISOString() ?? "", "Gym confirmed at": latestGymResponse?.createdAt.toISOString() ?? "", "Gym ID": click.gymId ?? "", "Claim ID": click.id, "User response": userOutcome?.eventType===`${prefix}_CLAIM_CONFIRMED`?"Confirmed":userOutcome?.eventType===`${prefix}_CLAIM_DECLINED`?"Declined":"Unsure" }); }
  formatSheet(claimSheet);
  const gymClicks = workbook.addWorksheet("Gym claim clicks");
  gymClicks.columns = ["Gym name", "User email", "Offer", "Clicked", "Gym response", "Gym confirmed at", "Type", "Confirmed by user", "Confirmed by gym", "Claim status", "Confirmation timestamp", "User confirmed at", "User response", "Gym ID", "Claim ID"].map(header => ({ header, key: header }));
  claimSheet.eachRow((row, index) => {
    if (index > 1) gymClicks.addRow(["Gym", "Email", "Offer", "Clicked at", "Gym response", "Gym confirmed at", "Type", "Confirmed by user", "Confirmed by gym", "Claim status", "Confirmation timestamp", "User confirmed at", "User response", "Gym ID", "Claim ID"].map(key => row.getCell(key).value));
  });

  const opportunitySheet=workbook.addWorksheet("Unclaimed gym opportunity");
  opportunitySheet.columns=["Gym","User-reported purchases","Day-pass purchases","Membership purchases","Potential customers","Estimated day-pass revenue","Estimated membership revenue","Estimated attributed revenue"].map(header=>({header,key:header}));
  for(const row of [...opportunities.values()].sort((a,b)=>b.estimated-a.estimated||a.gym.localeCompare(b.gym)))opportunitySheet.addRow({Gym:row.gym,"User-reported purchases":row.purchases,"Day-pass purchases":row.dayPassPurchases,"Membership purchases":row.membershipPurchases,"Potential customers":row.customers.size,"Estimated day-pass revenue":row.dayPassEstimated,"Estimated membership revenue":row.membershipEstimated,"Estimated attributed revenue":row.estimated});
  formatSheet(opportunitySheet);

  const filterSheet = workbook.addWorksheet("Filter usage");
  filterSheet.columns = [{ header: "Filter category", key: "category" }, { header: "Unique users", key: "users" }];
  const categories = ["Distance", "Day-pass price", "Membership price", "Gym type", "Equipment", "Amenities"];
  const matchesFilterCategory = (event: ExportEvent, category: string) => event.eventType === "FILTER_CHANGED" && filterCategory(event.metadata) === category;
  for (const category of categories) { const actors = new Set(events.filter(event => matchesFilterCategory(event, category)).map(behaviorActor)); filterSheet.addRow({ category, users: actors.size }); }
  formatSheet(filterSheet);

  const citySheet = workbook.addWorksheet("Popular cities");
  citySheet.columns = [{ header: "City", key: "city" }, { header: "State", key: "state" }, { header: "Country", key: "country" }, { header: "Unique users", key: "users" }];
  const cities = new Map<string, { city: string; state: string; country: string; users: Set<string> }>();
  for (const event of events.filter(event => ["LOCATION_SEARCHED", "LOCATION_USED"].includes(event.eventType))) { const data = event.metadata as Record<string, unknown> | null; const city = typeof data?.city === "string" ? data.city.trim() : ""; if (!city) continue; const state = typeof data?.state === "string" ? data.state.trim() : ""; const country = typeof data?.country === "string" ? data.country.trim() : ""; const key = `${city.toLowerCase()}|${state.toLowerCase()}|${country.toLowerCase()}`; const row = cities.get(key) ?? { city, state, country, users: new Set() }; row.users.add(behaviorActor(event)); cities.set(key, row); }
  for (const row of [...cities.values()].sort((a, b) => b.users.size - a.users.size)) citySheet.addRow({ city: row.city, state: row.state, country: row.country, users: row.users.size });
  formatSheet(citySheet);

  const claims = workbook.addWorksheet("Gym claim log");
  claims.columns = ["Gym", "Claimed", "Claimed by", "Claimed when", "Assigned by", "Last updated"].map(header => ({ header, key: header }));
  for (const gym of gyms) { const access = gym.access[0]; claims.addRow({ Gym: gym.name, Claimed: access ? "Yes" : "No", "Claimed by": access?.user.email ?? "", "Claimed when": access?.createdAt.toISOString() ?? "", "Assigned by": access?.assignedByEmail ?? "", "Last updated": gym.updatedAt.toISOString() }); }
  formatSheet(claims);

  // Keep each sortable table on its own tab; never mix totals into detail rows.
  const addTable = (name: string, headers: string[]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = headers.map(header => ({ header, key: header }));
    return sheet;
  };
  const count = (type: string) => events.filter(event => event.eventType === type).length;
  const unique = (type: string) => new Set(events.filter(event => event.eventType === type).map(behaviorActor)).size;
  const demand = addTable("Landing-page demand", ["Metric", "Value"]);
  demand.addRows([
    ["Unique visitors", new Set(events.map(event => event.visitorId)).size],
    ["Visits", new Set(events.map(event => event.visitId)).size],
    ["Gym profiles opened", count("GYM_OPENED")],
    ["Directions clicks", count("DIRECTIONS_CLICKED")],
    ["Favorites added", count("FAVORITE_ADDED")],
    ["Gyms compared", count("COMPARE_ADDED")],
    ["Unique Claim Day Pass clickers", unique("DAY_PASS_CLICKED")],
    ["Users who got a day pass", unique("DAY_PASS_GYM_CONFIRMED")],
    ["Signups after day-pass click", count("DAY_PASS_SIGNUP")],
    ["Unique Claim Membership clickers", unique("MEMBERSHIP_CLICKED")],
    ["Users who got a membership", unique("MEMBERSHIP_GYM_CONFIRMED")],
    ["Signups after membership click", count("MEMBERSHIP_SIGNUP")],
  ]);

  // Supply the actual cumulative chart series (daily distinct counts cannot be summed).
  const retainedDates = [...dailyMap.keys()].sort();
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
  const revenueByGym = addTable("Revenue by gym", ["Gym", "Customers supplied", ...revenueHeaders, "Gym ID"]);
  const revenueGymIds = new Set([...gyms.map(gym => gym.id), ...financialRecords.map(record => record.event.gymId ?? "deleted")]);
  const gymTotals: number[] = [];
  for (const id of revenueGymIds) {
    const records = financialRecords.filter(record => (record.event.gymId ?? "deleted") === id);
    const totals = revenueTotals(records);
    if (totals[0] > 0) gymTotals.push(totals[0]);
    revenueByGym.addRow([gymById.get(id)?.name ?? "Deleted gym", new Set(records.map(record => record.email.toLowerCase() || "Unknown user")).size, ...totals, id]);
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
    ["Revenue-generating gyms", gymTotals.length, "Gyms with positive confirmed revenue"],
    ["Listed gyms", gyms.filter(gym => gym.isPublished).length, "Currently published gyms"],
    ["Average revenue per revenue-generating gym", gymTotals.length ? totalAttributedRevenue / gymTotals.length : 0, "USD"],
    ["Median revenue per revenue-generating gym", gymTotals.length ? (gymTotals.length % 2 ? gymTotals[middle] : (gymTotals[middle - 1] + gymTotals[middle]) / 2) : 0, "USD"],
    ["Paying users", payingUsers.size, "Distinct customer emails"],
    ["Paid charges", financialRecords.length, "Gym-confirmed paid charges"],
  ]);
  const financialGrowth = addTable("Financial growth", ["Gym", "Date", "Total revenue", "Day-pass revenue", "Membership revenue", "Customers supplied", "Gym ID"]);
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
      financialGrowth.addRow([id === "all" ? "All gyms (combined)" : gymById.get(id)?.name ?? "Deleted gym", date, total / 100, dayPass / 100, membership / 100, customers.size, id]);
    }
  }

  // Keep gym names at the left of the tables where people look up gyms.
  for (const sheet of [claimSheet]) {
    const gymColumn = sheet.columns.findIndex(column => column.header === "Gym") + 1;
    if (gymColumn > 1) {
      const values = Array.from({ length: sheet.rowCount }, (_, index) => sheet.getRow(index + 1).getCell(gymColumn).value);
      sheet.spliceColumns(gymColumn, 1); sheet.spliceColumns(1, 0, values);
    }
  }
  // Join tables at their native grain: one account/email or one stable gym ID.
  const spendByEmail = new Map<string, ExcelJS.CellValue[]>();
  spending.eachRow((row, index) => { if (index > 1) spendByEmail.set(row.getCell(1).text.trim().toLowerCase(), Array.from({ length: 5 }, (_, column) => row.getCell(column + 2).value)); });
  const spendingHeaders = ["Total spent", "Day-pass spending", "Membership spending", "Confirmed payments", "Average payment"];
  spendingHeaders.forEach((header, index) => { userSheet.getCell(1, 16 + index).value = header; });
  userSheet.eachRow((row, index) => {
    if (index === 1) return;
    const email = row.getCell(1).text.trim().toLowerCase();
    const totals = spendByEmail.get(email) ?? [0, 0, 0, 0, 0];
    totals.forEach((value, column) => { row.getCell(16 + column).value = value; });
    spendByEmail.delete(email);
  });
  for (const [email, totals] of spendByEmail) userSheet.addRow([email, "Historical spending (no matching account)", ...Array(13).fill(""), ...totals]);

  const combinedGyms = addTable("Gyms", ["Gym", "Claimed", "Owner", "Claimed when", "Assigned by", "Last updated", ...Array.from({ length: 10 }, (_, i) => gymSheet.getRow(1).getCell(i + 2).text), "Gym ID"]);
  gyms.forEach((gym, index) => {
    const ownership = claims.getRow(index + 2), funnel = gymSheet.getRow(index + 2);
    combinedGyms.addRow([gym.name, ...Array.from({ length: 5 }, (_, i) => ownership.getCell(i + 2).value), ...Array.from({ length: 10 }, (_, i) => funnel.getCell(i + 2).value), gym.id]);
  });

  const combinedFinancials = addTable("Gym financials", ["Gym", "Customers supplied", ...revenueHeaders, "User-reported purchases", "Day-pass purchases", "Membership purchases", "Potential customers", "Estimated day-pass revenue", "Estimated membership revenue", "Estimated attributed revenue", "Gym ID"]);
  revenueByGym.eachRow((row, index) => {
    if (index === 1) return;
    const id = row.getCell(8).text, opportunity = opportunities.get(id);
    combinedFinancials.addRow([...Array.from({ length: 7 }, (_, i) => row.getCell(i + 1).value), opportunity?.purchases ?? 0, opportunity?.dayPassPurchases ?? 0, opportunity?.membershipPurchases ?? 0, opportunity?.customers.size ?? 0, opportunity?.dayPassEstimated ?? 0, opportunity?.membershipEstimated ?? 0, opportunity?.estimated ?? 0, id]);
  });

  summary.getCell("F1").value = "Period";
  summary.getCell("G1").value = "Meaning";
  summary.addRow(["Landing-page demand", "", "", "", "", "All time"]);
  demand.eachRow((row, index) => { if (index > 1) summary.addRow([row.getCell(1).value, row.getCell(2).value, "", "", "", "All time"]); });
  summary.addRow(["Financial metrics", "", "", "", "", "All time"]);
  financial.eachRow((row, index) => { if (index > 1) summary.addRow([row.getCell(1).value, row.getCell(2).value, "", "", "", "All time", row.getCell(3).value]); });
  const tabOrder = ["Overview", "Users", "User and demand growth", "Gyms", "Gym claim clicks", "Gym financials", "Financial growth", "Revenue by offer", "Popular cities", "Filter usage"];
  const ordered = new ExcelJS.Workbook();
  ordered.creator = workbook.creator; ordered.created = workbook.created; ordered.modified = workbook.modified;
  for (const name of tabOrder) {
    const source = workbook.getWorksheet(name)!;
    source.eachRow((row, index) => {
      if (index === 1) return;
      row.eachCell(cell => {
        if (typeof cell.value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/.test(cell.value)) return;
        if (name === "Overview") cell.value = easternTimestampText(cell.value);
        else { cell.value = easternTimestampSerial(cell.value); cell.numFmt = EASTERN_TIMESTAMP_FORMAT; }
      });
    });
    formatSheet(source);
    source.state = "visible";
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
      column.eachCell?.({ includeEmpty: false }, cell => { if (cell.numFmt === EASTERN_TIMESTAMP_FORMAT) column.width = 32; });
    });
    // ID fields are available for audits without distracting from readable names.
    source.columns.forEach(column => { if (/ ID$/.test(String(source.getRow(1).getCell(column.number!).value))) column.hidden = true; });
    const target = ordered.addWorksheet(name);
    target.model = { ...source.model, id: target.id };
    target.state = source.state;
  }
  return ordered;

}
