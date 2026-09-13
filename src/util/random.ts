/** Unbiased uniform integer in [0, max) using rejection sampling. */
function randomInt(max: number): number {
  if (max <= 0) throw new Error("max must be > 0");
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0]!;
  } while (x >= limit);
  return x % max;
}

export function randomPick<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error("cannot pick from an empty list");
  return items[randomInt(items.length)]!;
}

/** Weighted pick via cumulative sum; weights must be positive integers. */
export function weightedPick<T>(items: readonly T[], weightOf: (item: T) => number): T {
  if (items.length === 0) throw new Error("cannot pick from an empty list");
  const weights = items.map(weightOf);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) throw new Error("total weight must be > 0");
  let r = randomInt(total);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
