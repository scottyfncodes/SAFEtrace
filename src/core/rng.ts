/**
 * Deterministic RNG. The simulation must never call Math.random: reproducible
 * surveillance behaviour is what makes emergent bugs debuggable.
 */
export class Rng {
  private s: number;

  constructor(seed = 0x5afe7ace) {
    this.s = seed >>> 0;
  }

  /** Uniform in [0,1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number { return lo + this.next() * (hi - lo); }
  int(lo: number, hi: number): number { return Math.floor(this.range(lo, hi + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  sign(): number { return this.next() < 0.5 ? -1 : 1; }

  /** Approximately normal, mean 0 stddev 1. */
  gauss(): number {
    return (this.next() + this.next() + this.next() + this.next() + this.next() + this.next() - 3) / 0.7071;
  }

  fork(salt: number): Rng { return new Rng((this.s ^ Math.imul(salt, 0x9e3779b1)) >>> 0); }
  get state(): number { return this.s; }
  set state(v: number) { this.s = v >>> 0; }
}

/** Stable string hash, for deriving per-entity seeds from ids. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
