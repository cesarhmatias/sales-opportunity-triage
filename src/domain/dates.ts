const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Parses a YYYY-MM-DD calendar date to UTC epoch ms, or null if malformed or impossible (e.g. 2026-02-30). */
export function parseIsoDate(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

function requireIsoDate(value: string): number {
  const ms = parseIsoDate(value);
  if (ms === null) throw new Error(`Invalid ISO date: ${value}`);
  return ms;
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((requireIsoDate(to) - requireIsoDate(from)) / MS_PER_DAY);
}

export function addDays(date: string, days: number): string {
  return new Date(requireIsoDate(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}
