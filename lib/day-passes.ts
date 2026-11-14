export type DayPassOption = {
  id: string;
  name: string;
  description: string;
  price: number;
  durationDays: number;
  purchaseUrl: string;
  access: string[];
};

const createId = () => typeof globalThis.crypto?.randomUUID === "function"
  ? globalThis.crypto.randomUUID()
  : `day-pass-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function emptyDayPassOption(): DayPassOption {
  return { id: createId(), name: "", description: "", price: 0, durationDays: 1, purchaseUrl: "", access: [] };
}

export function cleanDayPassOptions(value: unknown): DayPassOption[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 25).filter(item => item && typeof item === "object").map(item => {
    const raw = item as Record<string, unknown>;
    const price = Number(raw.price);
    const durationDays = Number(raw.durationDays);
    return {
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : createId(),
      name: typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : defaultDayPassOptionName(Number.isInteger(durationDays) && durationDays > 0 ? durationDays : 1),
      description: typeof raw.description === "string" ? raw.description.trim() : "",
      price: Number.isFinite(price) ? Math.max(0, price) : 0,
      durationDays: Number.isInteger(durationDays) && durationDays > 0 ? durationDays : 1,
      purchaseUrl: typeof raw.purchaseUrl === "string" ? raw.purchaseUrl.trim() : "",
      access: Array.isArray(raw.access)
        ? raw.access.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean)
        : [],
    };
  });
}

export function lowestDayPassOption(options: DayPassOption[]) {
  return options.reduce<DayPassOption | null>((lowest, option) =>
    !lowest || option.price < lowest.price ? option : lowest, null);
}

export function dayPassDurationLabel(days: number) {
  if (!Number.isInteger(days) || days < 1) return "Pass access";
  const words = ["", "Single", "Two", "Three", "Four", "Five", "Six", "Seven"];
  return `${words[days] || days}-day access`;
}

export function defaultDayPassOptionName(days: number) {
  if (!Number.isInteger(days) || days < 1) return "Pass";
  const words = ["", "Single", "Two", "Three", "Four", "Five", "Six", "Seven"];
  return `${words[days] || days}-Day Pass`;
}

export function dayPassOptionLabel(option: DayPassOption) {
  return option.name.trim() || defaultDayPassOptionName(option.durationDays);
}
