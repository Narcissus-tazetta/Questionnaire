import { expect, test } from "bun:test";
import {
  currentDrawDateJST,
  dateJST,
  isValidDrawTime,
  nextDrawDateJST,
  nextDrawEpochMs,
  timeJST,
} from "../src/util/jst";

// Draw dates (anchor 2026-09-29, every 5 days): ..., 09-24, 09-29, 10-04, ...

test("dateJST rolls over at JST midnight, not UTC midnight", () => {
  // 2026-09-01T14:59:00Z = 2026-09-01 23:59 JST
  expect(dateJST(new Date("2026-09-01T14:59:00Z"))).toBe("2026-09-01");
  // 2026-09-01T15:00:00Z = 2026-09-02 00:00 JST
  expect(dateJST(new Date("2026-09-01T15:00:00Z"))).toBe("2026-09-02");
});

test("timeJST returns zero-padded 24h HH:MM in Tokyo", () => {
  expect(timeJST(new Date("2026-09-01T15:00:00Z"))).toBe("00:00");
  expect(timeJST(new Date("2026-09-01T11:05:00Z"))).toBe("20:05");
});

test("currentDrawDateJST is the latest draw date on or before today", () => {
  // 2026-09-29 09:00 JST: a draw day
  expect(currentDrawDateJST(new Date("2026-09-29T00:00:00Z"))).toBe("2026-09-29");
  // 2026-10-03 23:59 JST: last day of that cycle
  expect(currentDrawDateJST(new Date("2026-10-03T14:59:00Z"))).toBe("2026-09-29");
  // 2026-10-04 00:00 JST: next draw day
  expect(currentDrawDateJST(new Date("2026-10-03T15:00:00Z"))).toBe("2026-10-04");
  // before the anchor
  expect(currentDrawDateJST(new Date("2026-09-28T03:00:00Z"))).toBe("2026-09-24");
});

test("nextDrawDateJST is the first draw date after today, even on a draw day", () => {
  expect(nextDrawDateJST(new Date("2026-09-29T00:00:00Z"))).toBe("2026-10-04");
  expect(nextDrawDateJST(new Date("2026-09-28T03:00:00Z"))).toBe("2026-09-29");
});

test("nextDrawEpochMs schedules this cycle's slot when the time is still ahead", () => {
  // now = 2026-09-29 10:00 JST, draw at 20:00 JST
  const now = Date.parse("2026-09-29T01:00:00Z");
  expect(nextDrawEpochMs("20:00", false, now)).toBe(Date.parse("2026-09-29T11:00:00Z"));
});

test("nextDrawEpochMs catches up a slot missed within the last few hours", () => {
  // now = 2026-09-29 21:00 JST, draw at 20:00 JST, not drawn yet
  const now = Date.parse("2026-09-29T12:00:00Z");
  expect(nextDrawEpochMs("20:00", false, now)).toBe(now + 1000);
});

test("nextDrawEpochMs waits for the next cycle once the miss is stale", () => {
  // now = 2026-09-29 10:00 JST, draw at 00:00 JST, still not drawn (10h late)
  const now = Date.parse("2026-09-29T01:00:00Z");
  expect(nextDrawEpochMs("00:00", false, now)).toBe(Date.parse("2026-10-03T15:00:00Z"));
});

test("nextDrawEpochMs schedules the next cycle once this one is drawn", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");
  expect(nextDrawEpochMs("20:00", true, now)).toBe(Date.parse("2026-10-04T11:00:00Z"));
});

test("nextDrawEpochMs skips this cycle's slot when it was already drawn early", () => {
  // now = 2026-09-29 10:00 JST (before the 20:00 slot), but a manual draw ran
  const now = Date.parse("2026-09-29T01:00:00Z");
  expect(nextDrawEpochMs("20:00", true, now)).toBe(Date.parse("2026-10-04T11:00:00Z"));
});

test("nextDrawEpochMs on a non-draw day targets the next draw day", () => {
  // now = 2026-10-01 12:00 JST, cycle 09-29 already drawn
  const now = Date.parse("2026-10-01T03:00:00Z");
  expect(nextDrawEpochMs("00:00", true, now)).toBe(Date.parse("2026-10-03T15:00:00Z"));
});

test("isValidDrawTime", () => {
  expect(isValidDrawTime("20:00")).toBe(true);
  expect(isValidDrawTime("00:00")).toBe(true);
  expect(isValidDrawTime("23:59")).toBe(true);
  expect(isValidDrawTime("24:00")).toBe(false);
  expect(isValidDrawTime("9:00")).toBe(false);
  expect(isValidDrawTime("20:60")).toBe(false);
  expect(isValidDrawTime("")).toBe(false);
});
