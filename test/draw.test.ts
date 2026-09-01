import { expect, test } from "bun:test";
import { selectWinner } from "../src/services/drawService";
import { randomPick } from "../src/util/random";

test("randomPick always returns an element of the pool", () => {
  const pool = ["a", "b", "c", "d"];
  for (let i = 0; i < 500; i++) expect(pool).toContain(randomPick(pool));
});

test("randomPick covers every element over many draws", () => {
  const pool = ["a", "b", "c"];
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) seen.add(randomPick(pool));
  expect(seen.size).toBe(3);
});

test("selectWinner excludes the previous day's winner", () => {
  const r = selectWinner({ entries: ["A", "B"], prevWinnerId: "A" });
  expect(r).toEqual({ kind: "winner", winnerId: "B" });
});

test("selectWinner carries over when there are no entries", () => {
  expect(selectWinner({ entries: [], prevWinnerId: "A" })).toEqual({ kind: "carryover" });
});

test("selectWinner carries over when the only entrant is yesterday's winner", () => {
  expect(selectWinner({ entries: ["A"], prevWinnerId: "A" })).toEqual({ kind: "carryover" });
});

test("selectWinner without a previous winner picks from all entries", () => {
  const r = selectWinner({ entries: ["A", "B", "C"], prevWinnerId: null });
  expect(r.kind).toBe("winner");
  expect(["A", "B", "C"]).toContain(r.winnerId);
});

test("selectWinner honours reroll excludes on top of the previous winner", () => {
  const r = selectWinner({
    entries: ["A", "B", "C"],
    prevWinnerId: "A",
    excludeIds: ["B"],
  });
  expect(r).toEqual({ kind: "winner", winnerId: "C" });
});
