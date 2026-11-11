/**
 * Calendar dates are ISO strings "YYYY-MM-DD" in the user's local calendar (no time, no zone), months are "YYYY-MM".
 * String comparison orders them correctly. All helpers are pure and use UTC internally so DST never shifts a day.
 */
export type IsoDate = string;
export type MonthKey = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}

function parts(date: IsoDate): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid ISO date: ${date}`);
  return [+m[1]!, +m[2]!, +m[3]!];
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  const d = new Date(Date.UTC(year, month - 1, day));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Today in the device's local calendar. */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = parts(date);
  return toIsoDate(y, m, d + days);
}

/** Adds months keeping the anchor day, clamped to the month's last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: IsoDate, months: number, anchorDay?: number): IsoDate {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toIsoDate(ny, nm, Math.min(anchorDay ?? d, daysInMonth(ny, nm)));
}

export function diffDays(from: IsoDate, to: IsoDate): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function monthOf(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

export function monthStart(month: MonthKey): IsoDate {
  return `${month}-01`;
}

export function monthEnd(month: MonthKey): IsoDate {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return toIsoDate(y, m, daysInMonth(y, m));
}

export function addMonthKey(month: MonthKey, delta: number): MonthKey {
  return monthOf(addMonths(monthStart(month), delta));
}

/** Months from `from` to `to` inclusive, oldest first. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = from; m <= to; m = addMonthKey(m, 1)) out.push(m);
  return out;
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(date: IsoDate): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Full calendar months between today and a target date, at least 1 when the target is in the future. */
export function monthsUntil(from: IsoDate, to: IsoDate): number {
  if (to <= from) return 0;
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  let months = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) months -= 1;
  return Math.max(1, months);
}
