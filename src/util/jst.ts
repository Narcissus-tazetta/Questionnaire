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
  // JST has no DST, so shifting 24h always lands on the adjacent JST day.
  return dateJST(new Date(at.getTime() - 24 * 60 * 60 * 1000));
}

/** "YYYY-MM-DD" for the JST day after the given instant's JST day */
export function nextDateJST(at: Date = new Date()): string {
  return dateJST(new Date(at.getTime() + 24 * 60 * 60 * 1000));
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

// How long after a missed slot we still bother catching it up. Past this the day
// is mostly gone, so we wait for the next slot rather than firing at an odd hour
// (which also stops repeated re-arms — e.g. /setup at 00:00 — from misfiring).
const CATCHUP_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * Epoch-ms for when the draw scheduler should next fire.
 * - draw time still ahead, not yet drawn -> today's draw time
 * - draw time passed within the catch-up window, not yet drawn -> ~now
 * - otherwise -> tomorrow's draw time
 */
export function nextDrawEpochMs(
  drawTime: string,
  hasResultToday: boolean,
  now: number = Date.now(),
): number {
  const todayAt = Date.parse(`${dateJST(new Date(now))}T${drawTime}:00+09:00`);
  if (now < todayAt) return hasResultToday ? todayAt + DAY_MS : todayAt;
  if (!hasResultToday && now - todayAt < CATCHUP_WINDOW_MS) return now + 1000;
  return todayAt + DAY_MS;
}
