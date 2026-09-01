import { expect, test } from "bun:test";
import {
  dateJST,
  isValidDrawTime,
  nextDrawEpochMs,
  previousDateJST,
  timeJST,
} from "../src/util/jst";

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

test("previousDateJST is the JST day before", () => {
  expect(previousDateJST(new Date("2026-09-02T00:30:00Z"))).toBe("2026-09-01");
  expect(previousDateJST(new Date("2026-03-01T15:30:00Z"))).toBe("2026-03-01");
});

test("nextDrawEpochMs schedules today's slot when the time is still ahead", () => {
  // now = 2026-09-01 10:00 JST, draw at 20:00 JST
  const now = Date.parse("2026-09-01T01:00:00Z");
  expect(nextDrawEpochMs("20:00", false, now)).toBe(Date.parse("2026-09-01T11:00:00Z"));
});

test("nextDrawEpochMs catches up immediately when the slot was missed", () => {
  // now = 2026-09-01 21:00 JST, draw at 20:00 JST, not drawn yet
  const now = Date.parse("2026-09-01T12:00:00Z");
  expect(nextDrawEpochMs("20:00", false, now)).toBe(now + 1000);
});

test("nextDrawEpochMs schedules tomorrow once today is drawn", () => {
  const now = Date.parse("2026-09-01T12:00:00Z");
  expect(nextDrawEpochMs("20:00", true, now)).toBe(Date.parse("2026-09-02T11:00:00Z"));
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
