import { expect, test } from "bun:test";
import { makeD1 } from "./helpers/d1";
import {
  addDailyEntry,
  addExclusion,
  hasDailyEntry,
  isExcluded,
  purgeDailyDataBefore,
} from "../src/db/queries";

test("purgeDailyDataBefore drops older per-day rows but keeps the cutoff day", async () => {
  const db = makeD1();
  await addDailyEntry(db, "g", "2026-08-01", "A");
  await addDailyEntry(db, "g", "2026-08-31", "B");
  await addExclusion(db, "g", "2026-08-01", "C");
  await addExclusion(db, "g", "2026-09-01", "D");

  await purgeDailyDataBefore(db, "g", "2026-09-01");

  expect(await hasDailyEntry(db, "g", "2026-08-01", "A")).toBe(false);
  expect(await hasDailyEntry(db, "g", "2026-08-31", "B")).toBe(false);
  expect(await isExcluded(db, "g", "2026-08-01", "C")).toBe(false);
  expect(await isExcluded(db, "g", "2026-09-01", "D")).toBe(true);
});
