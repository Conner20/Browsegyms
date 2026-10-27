import { MembershipOption, cleanMembershipOptions } from "./memberships";

export type MembershipCharge = {
  total: number;
  recurring: number;
  enrollment: number;
  additional: number;
  annual: number;
};

const cents = (value: number) => Math.round(value * 100);
const dollars = (value: number) => Math.round(value) / 100;
const utcDate = (value: string | Date) => {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
};
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const addMonths = (date: Date, months: number) => {
  const targetMonth = date.getUTCMonth() + months;
  const first = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, 1));
  const finalDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date.getUTCDate(), finalDay)));
};

export function membershipTermsFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const terms = (metadata as Record<string, unknown>).membershipTerms;
  return cleanMembershipOptions(Array.isArray(terms) ? terms : terms ? [terms] : [])[0] ?? null;
}

function firstAnnualFeeDate(option: MembershipOption, purchaseDate: Date) {
  if (option.annualFeeTiming === "anniversary") return addMonths(purchaseDate, 12);
  if (option.annualFeeTiming === "after_joining") {
    if (option.annualFeeOffsetUnit === "days") return addDays(purchaseDate, option.annualFeeOffset);
    if (option.annualFeeOffsetUnit === "weeks") return addDays(purchaseDate, option.annualFeeOffset * 7);
    return addMonths(purchaseDate, option.annualFeeOffset);
  }
  let date = new Date(Date.UTC(purchaseDate.getUTCFullYear(), option.annualFeeMonth - 1, option.annualFeeDay));
  if (date < purchaseDate) date = new Date(Date.UTC(purchaseDate.getUTCFullYear() + 1, option.annualFeeMonth - 1, option.annualFeeDay));
  return date;
}

// Browse Gyms attributes only the initial membership purchase. The gym handles any
// later billing directly, so no future billing periods become referral charges.
export function membershipInitialCharge(option: MembershipOption, purchaseValue: string | Date): MembershipCharge | null {
  const purchaseDate = utcDate(purchaseValue);
  if (!purchaseDate) return null;
  const recurring = dollars(cents(option.price));
  const enrollment = dollars(cents(option.enrollmentFee));
  const additional = dollars(cents(option.additionalFees));
  const annual = option.annualFee > 0 && firstAnnualFeeDate(option, purchaseDate).getTime() === purchaseDate.getTime() ? dollars(cents(option.annualFee)) : 0;
  return { total: dollars(cents(recurring) + cents(enrollment) + cents(additional) + cents(annual)), recurring, enrollment, additional, annual };
}
