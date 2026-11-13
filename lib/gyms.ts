import { db } from "@/prisma/client";
import { Prisma } from "@prisma/client";
import { cleanMembershipOptions, effectiveMonthlyPrice, lowestMembershipOption } from "@/lib/memberships";
import { cleanDayPassOptions, lowestDayPassOption } from "@/lib/day-passes";

const GYM_TYPES = new Set(["Open", "Personal training gym", "Group training gym", "Specialty gym/studio"]);

type GymLookupClient = {
    gym: {
        findFirst(args: { where: Prisma.GymWhereInput; select: { id: true } }): Promise<{ id: string } | null>;
    };
};

export async function gymListingUniquenessErrors(
    listing: { name: string; address: string },
    excludeGymId?: string,
    client: GymLookupClient = db,
) {
    const exclusion = excludeGymId ? { id: { not: excludeGymId } } : {};
    const name = listing.name.trim(), address = listing.address.trim();
    const [nameMatch, addressMatch] = await Promise.all([
        name ? client.gym.findFirst({ where: { ...exclusion, name: { equals: name, mode: "insensitive" } }, select: { id: true } }) : Promise.resolve(null),
        address ? client.gym.findFirst({ where: { ...exclusion, address: { equals: address, mode: "insensitive" } }, select: { id: true } }) : Promise.resolve(null),
    ]);
    return [
        ...(nameMatch ? [{ field: "name", message: "That gym name is already in use. Enter a unique gym name." }] : []),
        ...(addressMatch ? [{ field: "address", message: "That address is already in use by another gym listing." }] : []),
    ];
}

export function gymSlug(name: string) {
    const base = name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "gym";
    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function userCanEditGym(userId: string, gymId: string) {
    const access = await db.gymAccess.findUnique({
        where: { gymId_userId: { gymId, userId } },
        select: { id: true, user: { select: { role: true } } },
    });
    return Boolean(access && access.user.role === "GYM");
}

export function cleanGymInput(body: Record<string, unknown>) {
    const text = (key: string, fallback = "") =>
        typeof body[key] === "string" ? (body[key] as string).trim() : fallback;
    const optionalText = (key: string) => {
        if (!(key in body)) return undefined;
        return text(key) || null;
    };
    const number = (key: string, fallback = 0) => {
        const value = Number(body[key]);
        return Number.isFinite(value) ? value : fallback;
    };
    const optionalNumber = (key: string) => {
        if (!(key in body) || body[key] === "" || body[key] == null) return null;
        const value = Number(body[key]);
        return Number.isFinite(value) ? value : null;
    };
    const stringList = (key: string) => Array.isArray(body[key])
        ? (body[key] as unknown[]).filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
        : [];
    const gymType = optionalText("gymType");
    const amenities = stringList("amenities");
    const dayPassOptions = cleanDayPassOptions(body.dayPassOptions).map(option => ({ ...option, access: option.access.filter(item => amenities.includes(item)) }));
    const lowestDayPass = lowestDayPassOption(dayPassOptions);
    const membershipOptions = cleanMembershipOptions(body.membershipOptions).map(option => ({ ...option, access: option.access.filter(item => amenities.includes(item)) }));
    const lowestMembership = lowestMembershipOption(membershipOptions);
    return {
        name: text("name"),
        address: text("address"),
        phone: text("phone"),
        website: text("website").replace(/^https?:\/\//i, "").replace(/\/$/, ""),
        gymType: gymType === "Open gym" ? "Open" : gymType,
        city: optionalText("city"),
        state: optionalText("state"),
        country: optionalText("country"),
        lat: body.lat == null ? undefined : number("lat"),
        lng: body.lng == null ? undefined : number("lng"),
        amenities,
        equipment: stringList("equipment"),
        dayPassPrice: lowestDayPass?.price ?? optionalNumber("dayPassPrice"),
        dayPassDetails: lowestDayPass ? String(lowestDayPass.durationDays) : optionalText("dayPassDetails"),
        dayPassUrl: dayPassOptions[0]?.purchaseUrl || optionalText("dayPassUrl"),
        dayPassOptions,
        membershipPrice: lowestMembership ? effectiveMonthlyPrice(lowestMembership) : optionalNumber("membershipPrice"),
        membershipDetails: optionalText("membershipDetails"),
        membershipOptions,
        hours: optionalText("hours"),
        contactEmail: optionalText("contactEmail"),
        coverPhotoUrl: optionalText("coverPhotoUrl"),
        photoUrls: stringList("photoUrls"),
        isPublished: body.isPublished !== false,
    };
}

export function validateCompleteGymInput(body: Record<string, unknown>, data: ReturnType<typeof cleanGymInput>) {
    const missing: string[] = [];
    const requireText = (key: keyof typeof data, label: string) => {
        const value = data[key];
        if (typeof value !== "string" || !value.trim()) missing.push(label);
    };
    const requireList = (key: "amenities" | "equipment" | "photoUrls", label: string) => {
        if (!data[key].length) missing.push(label);
    };
    [
        ["name", "gym name"], ["address", "street address"], ["city", "city"], ["state", "state"],
        ["country", "country"], ["phone", "phone"], ["contactEmail", "contact email"], ["website", "website"],
        ["gymType", "gym type"],
        ["hours", "hours"], ["coverPhotoUrl", "cover photo"],
    ].forEach(([key, label]) => requireText(key as keyof typeof data, label));
    if (!data.gymType || !GYM_TYPES.has(data.gymType)) missing.push("gym type");
    const dayPassDurations = new Set<number>();
    data.dayPassOptions.forEach((option, index) => {
        const prefix = `pass option ${index + 1}`;
        if (!option.name) missing.push(`${prefix} name`);
        if (!Number.isFinite(option.price) || option.price < 0) missing.push(`${prefix} price`);
        if (!Number.isInteger(option.durationDays) || option.durationDays < 1) missing.push(`${prefix} duration`);
        if (!option.access.length) missing.push(`${prefix} access`);
        if (dayPassDurations.has(option.durationDays)) missing.push("unique pass durations");
        dayPassDurations.add(option.durationDays);
        const destination = option.purchaseUrl || data.dayPassOptions[0]?.purchaseUrl;
        if (!destination || (!/^[a-z][a-z\d+.-]*:\/\//i.test(destination) && !destination.includes("."))) missing.push(index === 0 ? `${prefix} URL` : `${prefix} URL or a valid first-option URL`);
    });
    if (!data.membershipOptions.length) missing.push("at least one membership option");
    data.membershipOptions.forEach((option, index) => {
        const prefix = `membership option ${index + 1}`;
        if (!option.name) missing.push(`${prefix} name`);
        if (!Number.isFinite(option.price) || option.price < 0) missing.push(`${prefix} price`);
        if (!option.billingFrequency) missing.push(`${prefix} billing frequency`);
        if (option.billingFrequency === "custom" && (!Number.isFinite(option.billingInterval) || option.billingInterval < 1)) missing.push(`${prefix} billing interval`);
        if (!Number.isFinite(option.contractLength) || option.contractLength < 1) missing.push(`${prefix} contract length`);
        if (option.annualFee > 0 && option.annualFeeTiming === "after_joining" && (!Number.isInteger(option.annualFeeOffset) || option.annualFeeOffset < 1)) missing.push(`${prefix} annual fee timing`);
        if (option.annualFee > 0 && option.annualFeeTiming === "fixed_date" && (!Number.isInteger(option.annualFeeMonth) || option.annualFeeMonth < 1 || option.annualFeeMonth > 12 || !Number.isInteger(option.annualFeeDay) || option.annualFeeDay < 1 || option.annualFeeDay > new Date(2025, option.annualFeeMonth, 0).getDate())) missing.push(`${prefix} annual fee date`);
        if (option.guestPassesEnabled && (!Number.isInteger(option.guestPassCount) || option.guestPassCount < 1)) missing.push(`${prefix} guest pass count`);
        if ([option.enrollmentFee, option.annualFee, option.additionalFees].some(value => !Number.isFinite(value) || value < 0)) missing.push(`${prefix} fees`);
        if (!option.access.length) missing.push(`${prefix} access`);
        const destination = option.purchaseUrl || data.membershipOptions[0]?.purchaseUrl;
        if (!destination || (!/^[a-z][a-z\d+.-]*:\/\//i.test(destination) && !destination.includes("."))) missing.push(index === 0 ? `${prefix} purchase URL` : `${prefix} purchase URL or a valid first-option purchase URL`);
    });
    requireList("amenities", "amenities");
    requireList("equipment", "equipment");
    requireList("photoUrls", "amenity photos");
    if (body.lat == null || body.lat === "" || !Number.isFinite(Number(body.lat))) missing.push("mapped latitude");
    if (body.lng == null || body.lng === "" || !Number.isFinite(Number(body.lng))) missing.push("mapped longitude");
    return [...new Set(missing)];
}
