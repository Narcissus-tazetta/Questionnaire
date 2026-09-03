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
