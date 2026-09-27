import { DRAW_CYCLE_ANCHOR, DRAW_INTERVAL_DAYS, TIMEZONE } from "../config";

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

/** Whole days from JST date `from` to JST date `to` (both "YYYY-MM-DD"). */
export function daysSinceJST(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function addDaysJST(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The draw date of the cycle containing the given instant's JST day. */
export function currentDrawDateJST(at: Date = new Date()): string {
  const today = dateJST(at);
  const offset = daysSinceJST(DRAW_CYCLE_ANCHOR, today) % DRAW_INTERVAL_DAYS;
  return addDaysJST(today, -((offset + DRAW_INTERVAL_DAYS) % DRAW_INTERVAL_DAYS));
}

/**
 * The first draw date strictly after the given instant's JST day. Entries are
 * registered against this, so even on a draw day whose slot is still ahead,
 * sign-ups count toward the following draw.
 */
export function nextDrawDateJST(at: Date = new Date()): string {
  return addDaysJST(currentDrawDateJST(at), DRAW_INTERVAL_DAYS);
}

// How long after a missed slot we still bother catching it up. Past this the day
// is mostly gone, so we wait for the next slot rather than firing at an odd hour
// (which also stops repeated re-arms — e.g. /setup at 00:00 — from misfiring).
const CATCHUP_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * Epoch-ms for when the draw scheduler should next fire.
 * - this cycle's draw time still ahead, not yet drawn -> that draw time
 * - draw time passed within the catch-up window, not yet drawn -> ~now
 * - otherwise -> the next cycle's draw time
 */
export function nextDrawEpochMs(
  drawTime: string,
  hasResultThisCycle: boolean,
  now: number = Date.now(),
): number {
  const slotAt = Date.parse(`${currentDrawDateJST(new Date(now))}T${drawTime}:00+09:00`);
  const nextSlotAt = slotAt + DRAW_INTERVAL_DAYS * DAY_MS;
  if (now < slotAt) return hasResultThisCycle ? nextSlotAt : slotAt;
  if (!hasResultThisCycle && now - slotAt < CATCHUP_WINDOW_MS) return now + 1000;
  return nextSlotAt;
}
