import { expect, test } from "bun:test";
import { selectWinner } from "../src/services/drawService";
import { randomPick, weightedPick } from "../src/util/random";

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

test("selectWinner is empty when there are no entries", () => {
  expect(selectWinner({ entries: [] })).toEqual({ kind: "empty" });
});

test("selectWinner picks from all entries", () => {
  const r = selectWinner({ entries: ["A", "B", "C"] });
  if (r.kind !== "winner") throw new Error("expected a winner");
  expect(["A", "B", "C"]).toContain(r.winnerId);
});

test("selectWinner honours reroll excludes", () => {
  const r = selectWinner({ entries: ["A", "B", "C"], excludeIds: ["A", "B"] });
  expect(r).toEqual({ kind: "winner", winnerId: "C" });
});

test("selectWinner is empty when every entrant is excluded", () => {
  expect(selectWinner({ entries: ["A"], excludeIds: ["A"] })).toEqual({ kind: "empty" });
});

test("weightedPick always returns an element of the pool", () => {
  const pool = ["a", "b", "c"];
  const weight = { a: 1, b: 5, c: 20 };
  for (let i = 0; i < 500; i++) {
    expect(pool).toContain(weightedPick(pool, (x) => weight[x as keyof typeof weight]));
  }
});

test("weightedPick favors higher-weight items over many draws", () => {
  const pool = ["rare", "common"];
  const weight = { rare: 1, common: 99 };
  const counts = { rare: 0, common: 0 };
  for (let i = 0; i < 500; i++) {
    counts[weightedPick(pool, (x) => weight[x as keyof typeof weight]) as keyof typeof counts]++;
  }
  expect(counts.common).toBeGreaterThan(counts.rare);
});

test("selectWinner with weights always favors the heavier entrant over many draws", () => {
  const weights = new Map([
    ["A", 1],
    ["B", 100],
  ]);
  let bWins = 0;
  for (let i = 0; i < 300; i++) {
    const r = selectWinner({ entries: ["A", "B"], weights });
    if (r.kind === "winner" && r.winnerId === "B") bWins++;
  }
  expect(bWins).toBeGreaterThan(250);
});
