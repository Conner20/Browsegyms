// Sheet/Excel serial dates are timezone-free wall-clock values. Convert the instant
// before writing a numeric cell; setting the spreadsheet timezone alone cannot do it.
export const METRICS_TIME_ZONE = "America/New_York";
export const EASTERN_TIMESTAMP_FORMAT = 'mmm d, yyyy h:mm:ss AM/PM "ET"';
const eastern = new Intl.DateTimeFormat("en-US", {
  timeZone: METRICS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short",
});

function parts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid metrics timestamp");
  return { date, fields: Object.fromEntries(eastern.formatToParts(date).map(part => [part.type, part.value])) };
}

export function easternTimestampSerial(value: string | Date) {
  const { date, fields: p } = parts(value);
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second), date.getUTCMilliseconds()) / 86_400_000 + 25569;
}

export function easternTimestampText(value: string | Date) {
  const { fields: p } = parts(value);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}`;
}

export function easternDateKey(value: string | Date) {
  const { fields: p } = parts(value);
  return `${p.year}-${p.month}-${p.day}`;
}
