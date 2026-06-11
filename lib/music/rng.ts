// Seeded PRNG (mulberry32) so every song is reproducible from its seed.

export type RNG = {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  pick<T>(arr: readonly T[]): T;
  pickWeighted<T>(arr: readonly { value: T; w: number }[]): T;
  chance(p: number): boolean;
  shuffle<T>(arr: readonly T[]): T[];
};

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRNG(seed: number): RNG {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    pickWeighted: (arr) => {
      const total = arr.reduce((s, x) => s + x.w, 0);
      let r = next() * total;
      for (const x of arr) {
        r -= x.w;
        if (r <= 0) return x.value;
      }
      return arr[arr.length - 1].value;
    },
    chance: (p) => next() < p,
    shuffle: (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
