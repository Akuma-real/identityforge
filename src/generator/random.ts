export interface RNG {
  next(): number;
  intn(n: number): number;
}

export function createRNG(seed?: number): RNG {
  if (!seed) seed = Date.now() ^ (Math.random() * 0x100000000);
  let s = seed | 0;
  return {
    next() {
      s |= 0;
      s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    },
    intn(n) { return Math.floor(this.next() * n); },
  };
}

export function pick<T>(rng: RNG, arr: T[]): T | undefined {
  return arr.length ? arr[rng.intn(arr.length)] : undefined;
}
