/**
 * How a run is scored: four numbers, each one a different way to be good.
 *
 *   STYLE     what the board did: tricks, grabs, grinds, roofs, air — and
 *             above all chaining them. Every scoring move inside a few seconds
 *             of the last one raises the multiplier; touching down and rolling
 *             quietly for a while banks the chain; a bail loses whatever was
 *             not yet banked.
 *   TIME      how long the job took.
 *   EXPOSURE  how much of the run somebody had you in their picture.
 *   FLOW      how much of the run you were actually moving.
 *
 * None of these is the "right" one. A loud, fast, stylish run and a slow,
 * patient, unseen one should both be able to score well, so that a replay is
 * always "I can do that cleaner" in whichever sense the player cares about.
 */
import { clamp01 } from '../../core/math';

export const STYLE = {
  trick: 250,
  grab: 300,
  /** Locking onto a line, and then every second spent riding it. */
  grind: 150,
  grindPerSecond: 420,
  /** Setting a board down on a roof. */
  roof: 400,
  /** Getting to where the plan said, the way the plan said: the recon was right. */
  plan: 600,
  /** Per second of air, paid on landing, for air longer than `airFloor`. */
  air: 220,
  airFloor: 0.7,
  /** Seconds between moves that still count as one chain. */
  chainWindow: 3.0,
  /** The multiplier never goes past this. */
  maxMultiplier: 8,
  /** Rolling at least this fast counts as flowing, m/s. */
  flowSpeed: 5,
};

export interface StyleTally {
  /** Banked: safe. */
  banked: number;
  /** In the current chain, not yet banked: lost on a bail. */
  pending: number;
  multiplier: number;
  /** Seconds since the last scoring move. */
  sinceMove: number;
  /** Biggest chain banked, in points. */
  bestChain: number;
  grinds: number;
  /** Jumps long enough to be paid as air. */
  airs: number;
  tricks: number;
  roofs: number;
  bails: number;
  /** Seconds moving, and in total. */
  flowTime: number;
  totalTime: number;
  /** Seconds in the air on the current jump. */
  airTime: number;
}

export function makeTally(): StyleTally {
  return {
    banked: 0, pending: 0, multiplier: 1, sinceMove: 99, bestChain: 0,
    grinds: 0, airs: 0, tricks: 0, roofs: 0, bails: 0, flowTime: 0, totalTime: 0, airTime: 0,
  };
}

/** A scoring move: worth `base`, at the current multiplier, and the chain goes on. */
export function scoreMove(t: StyleTally, base: number): number {
  const chaining = t.sinceMove < STYLE.chainWindow && t.pending > 0;
  if (chaining) t.multiplier = Math.min(STYLE.maxMultiplier, t.multiplier + 1);
  else { bank(t); t.multiplier = 1; }
  const pts = Math.round(base * t.multiplier);
  t.pending += pts;
  t.sinceMove = 0;
  return pts;
}

/** Put the chain in the bank. */
export function bank(t: StyleTally): void {
  if (t.pending > 0) {
    t.banked += t.pending;
    t.bestChain = Math.max(t.bestChain, t.pending);
  }
  t.pending = 0;
  t.multiplier = 1;
}

/** A bail: whatever was not banked is gone. */
export function bailChain(t: StyleTally): number {
  const lost = t.pending;
  t.pending = 0;
  t.multiplier = 1;
  t.bails++;
  return lost;
}

/** The clock: chains bank when nothing has happened for a while; flow is counted. */
export function stepTally(t: StyleTally, dt: number, speed: number, airborne: boolean): void {
  t.totalTime += dt;
  t.sinceMove += dt;
  if (airborne) t.airTime += dt;
  if (speed >= STYLE.flowSpeed || airborne) t.flowTime += dt;
  if (t.pending > 0 && t.sinceMove >= STYLE.chainWindow && !airborne) bank(t);
}

/** Landing: pays the air, if there was enough of it, and returns what it paid. */
export function landed(t: StyleTally): number {
  const air = t.airTime;
  t.airTime = 0;
  if (air < STYLE.airFloor) return 0;
  t.airs++;
  return scoreMove(t, STYLE.air * air);
}

export const styleTotal = (t: StyleTally): number => t.banked + t.pending;
export const flowShare = (t: StyleTally): number => (t.totalTime > 0 ? clamp01(t.flowTime / t.totalTime) : 0);

export interface RunResult {
  style: number;
  time: number;
  /** 0..1 of the run on somebody's picture. */
  exposure: number;
  /** 0..1 of the run moving. */
  flow: number;
  /** One number, for the board and for bests. */
  total: number;
  grade: 'S' | 'A' | 'B' | 'C';
  /** Never anything above SPOTTED. */
  ghost: boolean;
  /** Times the signal was lost on the way. */
  escapes: number;
}

/**
 * Turn a run into one number and a grade. Time is scored against the job's
 * own target, exposure and flow out of what they could have been, so a run
 * that is excellent at any one thing gets somewhere and one excellent at all
 * of them gets the S.
 */
export function totalFor(style: number, time: number, target: number, exposure: number, flow: number, ghostWeight = 1): number {
  const speed = Math.max(0, 1 - Math.max(0, time - target * 0.6) / (target * 1.4)) * 4000;
  const quiet = (1 - clamp01(exposure)) * 3000 * ghostWeight;
  const moving = clamp01(flow) * 2000;
  return Math.round(style + speed + quiet + moving);
}

export function gradeFor(total: number, ghostWeight = 1): RunResult['grade'] {
  const k = 1 + (ghostWeight - 1) * 0.4;
  if (total >= 9500 * k) return 'S';
  if (total >= 7000 * k) return 'A';
  if (total >= 4500 * k) return 'B';
  return 'C';
}
