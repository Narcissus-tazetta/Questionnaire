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
