// A small seeded random generator (mulberry32): the same seed always gives
// the same sequence, so a planet draws identically on the server, in the
// browser and in Candy Haven. Returns numbers in [0, 1).
//
// Shared with Candy Haven: this folder is copied there as it is, so it
// imports nothing outside itself. Edit it here, then run Haven's
// `npm run sync:planets`.

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for Shuffle, in the range a layer's seed accepts. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}
