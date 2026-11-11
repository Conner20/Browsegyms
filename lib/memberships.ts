export const BILLING_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "semiannual", label: "Every 6 months" },
  { value: "annual", label: "Annually" },
  { value: "custom", label: "Custom" },
] as const;

export type BillingFrequency = typeof BILLING_FREQUENCIES[number]["value"];
export type BillingIntervalUnit = "days" | "weeks" | "months";
export type ContractLengthUnit = BillingIntervalUnit | "years";
export type GuestPassFrequency = "day" | "week" | "month" | "year";
export type AnnualFeeTiming = "anniversary" | "after_joining" | "fixed_date";
export type AnnualFeeOffsetUnit = "days" | "weeks" | "months";

export type MembershipOption = {
  id: string;
  name: string;
  price: number;
  billingFrequency: BillingFrequency;
  billingInterval: number;
  billingIntervalUnit: BillingIntervalUnit;
  contractLength: number;
  contractLengthUnit: ContractLengthUnit;
  enrollmentFee: number;
  annualFee: number;
  annualFeeTiming: AnnualFeeTiming;
  annualFeeOffset: number;
  annualFeeOffsetUnit: AnnualFeeOffsetUnit;
  annualFeeMonth: number;
  annualFeeDay: number;
  additionalFees: number;
  additionalFeesDetails: string;
  guestPassesEnabled: boolean;
  guestPassCount: number;
  guestPassFrequency: GuestPassFrequency;
  access: string[];
  purchaseUrl: string;
  notes: string;
};

const frequencies = new Set<string>(BILLING_FREQUENCIES.map(({ value }) => value));
const createMembershipId = () => typeof globalThis.crypto?.randomUUID === "function"
  ? globalThis.crypto.randomUUID()
  : `membership-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const amount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function emptyMembershipOption(): MembershipOption {
  return {
    id: createMembershipId(), name: "", price: 0, billingFrequency: "monthly",
    billingInterval: 1, billingIntervalUnit: "months", contractLength: 1, contractLengthUnit: "months",
    enrollmentFee: 0, annualFee: 0, annualFeeTiming: "anniversary",
    annualFeeOffset: 1, annualFeeOffsetUnit: "months", annualFeeMonth: 1, annualFeeDay: 1, additionalFees: 0,
    additionalFeesDetails: "", guestPassesEnabled: false, guestPassCount: 0,
    guestPassFrequency: "month", access: [], purchaseUrl: "", notes: "",
  };
}

export function cleanMembershipOptions(value: unknown): MembershipOption[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 25).filter(item => item && typeof item === "object").map((item) => {
    const raw = item as Record<string, unknown>;
    const billingFrequency = text(raw.billingFrequency);
    const billingIntervalUnit = text(raw.billingIntervalUnit);
    const contractLengthUnit = text(raw.contractLengthUnit);
    const guestPassFrequency = text(raw.guestPassFrequency);
    const annualFeeTiming = text(raw.annualFeeTiming);
    const annualFeeOffsetUnit = text(raw.annualFeeOffsetUnit);
    const annualFeeMonth = Math.min(12, Math.max(1, Math.floor(amount(raw.annualFeeMonth) || 1)));
    const annualFeeDay = Math.min(new Date(2025, annualFeeMonth, 0).getDate(), Math.max(1, Math.floor(amount(raw.annualFeeDay) || 1)));
    return {
      id: text(raw.id) || createMembershipId(),
      name: text(raw.name),
      price: amount(raw.price),
      billingFrequency: (frequencies.has(billingFrequency) ? billingFrequency : "monthly") as BillingFrequency,
      billingInterval: Math.max(1, amount(raw.billingInterval) || 1),
      billingIntervalUnit: (["days", "weeks", "months"].includes(billingIntervalUnit) ? billingIntervalUnit : "months") as BillingIntervalUnit,
      contractLength: Math.max(1, amount(raw.contractLength) || amount(raw.contractLengthMonths) || 1),
      contractLengthUnit: (["days", "weeks", "months", "years"].includes(contractLengthUnit) ? contractLengthUnit : "months") as ContractLengthUnit,
      enrollmentFee: amount(raw.enrollmentFee),
      annualFee: amount(raw.annualFee),
      annualFeeTiming: (["anniversary", "after_joining", "fixed_date"].includes(annualFeeTiming) ? annualFeeTiming : "anniversary") as AnnualFeeTiming,
      annualFeeOffset: Math.max(1, Math.floor(amount(raw.annualFeeOffset) || 1)),
      annualFeeOffsetUnit: (["days", "weeks", "months"].includes(annualFeeOffsetUnit) ? annualFeeOffsetUnit : "months") as AnnualFeeOffsetUnit,
      annualFeeMonth,
      annualFeeDay,
      additionalFees: amount(raw.additionalFees),
      additionalFeesDetails: text(raw.additionalFeesDetails),
      guestPassesEnabled: raw.guestPassesEnabled === true,
      guestPassCount: raw.guestPassesEnabled === true ? Math.max(0, Math.floor(amount(raw.guestPassCount))) : 0,
      guestPassFrequency: (["day", "week", "month", "year"].includes(guestPassFrequency) ? guestPassFrequency : "month") as GuestPassFrequency,
      access: Array.isArray(raw.access)
        ? raw.access.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean)
        : text(raw.access).split(/\r?\n/).map(item => item.trim()).filter(Boolean),
      purchaseUrl: text(raw.purchaseUrl),
      notes: text(raw.notes),
    };
  });
}

function rawRecurringMonthlyPrice(option: MembershipOption) {
  const customIntervalMonths = option.billingIntervalUnit === "days" ? option.billingInterval * 12 / 365.25
    : option.billingIntervalUnit === "weeks" ? option.billingInterval * 12 / 52
      : option.billingInterval;
  const recurring = option.billingFrequency === "custom" ? option.price / Math.max(customIntervalMonths, 1 / 31)
    : option.billingFrequency === "weekly" ? option.price * 52 / 12
    : option.billingFrequency === "biweekly" ? option.price * 26 / 12
      : option.billingFrequency === "quarterly" ? option.price / 3
        : option.billingFrequency === "semiannual" ? option.price / 6
          : option.billingFrequency === "annual" ? option.price / 12
            : option.price;
  return recurring;
}

export function membershipMonthlyBreakdown(option: MembershipOption) {
  const intervalMonths = option.billingIntervalUnit === "days" ? option.billingInterval * 12 / 365.25
    : option.billingIntervalUnit === "weeks" ? option.billingInterval * 12 / 52
      : option.billingInterval;
  const contractMonths = Math.max(1 / 31, option.contractLengthUnit === "days" ? option.contractLength * 12 / 365.25
    : option.contractLengthUnit === "weeks" ? option.contractLength * 12 / 52
      : option.contractLengthUnit === "years" ? option.contractLength * 12
        : option.contractLength);
  const isMonthToMonth = option.contractLength === 1 && option.contractLengthUnit === "months";
  const upfrontAmortizationMonths = isMonthToMonth ? 12 : contractMonths;
  const recurringMonthly = rawRecurringMonthlyPrice(option);
  const annualFeeMonthly = option.annualFee / 12;
  const upfrontFees = option.enrollmentFee + option.additionalFees;
  const upfrontFeesMonthly = upfrontFees / upfrontAmortizationMonths;
  const recurringFormula = option.billingFrequency === "weekly" ? `$${option.price.toFixed(2)} × 52 weeks ÷ 12 months`
    : option.billingFrequency === "biweekly" ? `$${option.price.toFixed(2)} × 26 billing periods ÷ 12 months`
      : option.billingFrequency === "quarterly" ? `$${option.price.toFixed(2)} ÷ 3 months`
        : option.billingFrequency === "semiannual" ? `$${option.price.toFixed(2)} ÷ 6 months`
          : option.billingFrequency === "annual" ? `$${option.price.toFixed(2)} ÷ 12 months`
            : option.billingFrequency === "custom" && option.billingIntervalUnit === "days" ? `$${option.price.toFixed(2)} × 365.25 days ÷ (${option.billingInterval} days × 12 months)`
              : option.billingFrequency === "custom" && option.billingIntervalUnit === "weeks" ? `$${option.price.toFixed(2)} × 52 weeks ÷ (${option.billingInterval} weeks × 12 months)`
                : option.billingFrequency === "custom" ? `$${option.price.toFixed(2)} ÷ ${option.billingInterval} months`
              : `$${option.price.toFixed(2)} per month`;
  const contractMonthsFormula = isMonthToMonth
    ? "12 months (first-year average)"
    : option.contractLengthUnit === "days"
    ? `(${option.contractLength} days × 12 months ÷ 365.25 days)`
    : option.contractLengthUnit === "weeks"
      ? `(${option.contractLength} weeks × 12 months ÷ 52 weeks)`
      : option.contractLengthUnit === "years"
        ? `(${option.contractLength} years × 12 months per year)`
        : `${option.contractLength} ${option.contractLength === 1 ? "month" : "months"}`;
  return {
    recurringMonthly,
    recurringFormula,
    annualFeeMonthly,
    upfrontFees,
    upfrontFeesMonthly,
    contractMonths,
    upfrontAmortizationMonths,
    contractMonthsFormula,
    averageMonthly: Math.round((recurringMonthly + annualFeeMonthly + upfrontFeesMonthly) * 100) / 100,
  };
}

export function recurringMonthlyPrice(option: MembershipOption) {
  return Math.round(rawRecurringMonthlyPrice(option) * 100) / 100;
}

export function effectiveMonthlyPrice(option: MembershipOption) {
  return membershipMonthlyBreakdown(option).averageMonthly;
}

export function lowestMembershipOption(options: MembershipOption[]) {
  return options.reduce<MembershipOption | null>((lowest, option) =>
    !lowest || effectiveMonthlyPrice(option) < effectiveMonthlyPrice(lowest) ? option : lowest, null);
}

const quantityLabel = (value: number, unit: string) => `${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`;

export function billingFrequencyLabel(option: MembershipOption) {
  return option.billingFrequency === "custom"
    ? `Every ${quantityLabel(option.billingInterval, option.billingIntervalUnit)}`
    : BILLING_FREQUENCIES.find(item => item.value === option.billingFrequency)?.label ?? "Monthly";
}

export function contractLengthLabel(option: MembershipOption) {
  return option.contractLength === 1 && option.contractLengthUnit === "months"
    ? "Month-to-month"
    : quantityLabel(option.contractLength, option.contractLengthUnit);
}

export function annualFeeTimingLabel(option: MembershipOption) {
  if (option.annualFeeTiming === "after_joining") {
    return `${quantityLabel(option.annualFeeOffset, option.annualFeeOffsetUnit)} after joining, then annually`;
  }
  if (option.annualFeeTiming === "fixed_date") {
    const date = new Date(2025, option.annualFeeMonth - 1, option.annualFeeDay);
    return `Every ${date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}`;
  }
  return "On the anniversary of the signup date";
}
