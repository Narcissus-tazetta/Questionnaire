import { TIMEZONE } from "../config";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "YYYY-MM-DD" in Asia/Tokyo */
export function dateJST(at: Date = new Date()): string {
  return dateFmt.format(at);
}

/** "YYYY-MM-DD" for the JST day before the given instant's JST day */
export function previousDateJST(at: Date = new Date()): string {
  // JST has no DST, so subtracting 24h always lands on the previous JST day.
  return dateJST(new Date(at.getTime() - 24 * 60 * 60 * 1000));
}

/** "HH:MM" (24h) in Asia/Tokyo */
export function timeJST(at: Date = new Date()): string {
  return timeFmt.format(at);
}

/** ISO-8601 instant, used for stored timestamps */
export function nowISO(at: Date = new Date()): string {
  return at.toISOString();
}

const DRAW_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDrawTime(value: string): boolean {
  return DRAW_TIME_RE.test(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Epoch-ms for when the draw scheduler should next fire.
 * - before today's draw time  -> today's draw time
 * - after it, no result yet    -> ~now (a missed slot is caught up immediately)
 * - after it, already drawn     -> tomorrow's draw time
 */
export function nextDrawEpochMs(
  drawTime: string,
  hasResultToday: boolean,
  now: number = Date.now(),
): number {
  const todayAt = Date.parse(`${dateJST(new Date(now))}T${drawTime}:00+09:00`);
  if (now < todayAt) return todayAt;
  if (!hasResultToday) return now + 1000;
  return todayAt + DAY_MS;
}
