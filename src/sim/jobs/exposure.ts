/**
 * Exposure: how much attention the rider has drawn, on one job.
 *
 * Not health, and never a failure. It is a reading of how hard the town is
 * looking, in four words the player can learn in one run:
 *
 *   UNSEEN      nothing has you.
 *   SPOTTED     something has had a look. Get out of its picture and it fades.
 *   TRACKED     the town has decided you are worth following: a drone is sent
 *               to where you were last seen. Stay out of sight long enough and
 *               the signal is lost.
 *   UNDERWATCH  everything that can follow you is following you, live.
 *
 * Being seen raises it, faster the better the picture and faster again once
 * tracked. Out of sight, SPOTTED simply fades; TRACKED and above hold for a
 * few seconds — the town is still looking for you where it lost you — and
 * then the signal drops all at once, which is the getaway's payoff.
 */
export type ExposureLevel = 'UNSEEN' | 'SPOTTED' | 'TRACKED' | 'UNDERWATCH';

export const EXPOSURE = {
  /** Thresholds on the 0..100 reading. */
  tracked: 40,
  underwatch: 80,
  /** Gain while seen, per second: a floor, plus more for a better picture. */
  gain: 8,
  gainQuality: 20,
  /** Once tracked, attention compounds. */
  trackedGain: 1.3,
  /** Out of sight and only spotted, it fades this fast, per second. */
  fade: 11,
  /** Out of sight this long, tracked or worse, and the signal is lost. Seconds. */
  holdTracked: 3.0,
  holdUnderwatch: 4.5,
  /** Where the reading drops to when the signal is lost. */
  lostTo: 22,
  /** Seen in the last this-many seconds still counts as spotted. */
  spottedMemory: 1.5,
};

export interface ExposureState {
  value: number;
  level: ExposureLevel;
  /** Seconds since anything last had the rider in its picture. */
  unseenFor: number;
  /** Whether something has the rider this tick. */
  seen: boolean;
  /** Seconds of the run spent in somebody's picture, and in total. */
  seenTime: number;
  totalTime: number;
  peak: number;
  /** Times the signal was lost: getaways made. */
  losses: number;
  /** Highest level reached. */
  worst: ExposureLevel;
}

export type ExposureChange = 'spotted' | 'tracked' | 'underwatch' | 'lost' | 'clear';

const RANK: Record<ExposureLevel, number> = { UNSEEN: 0, SPOTTED: 1, TRACKED: 2, UNDERWATCH: 3 };
export const exposureRank = (l: ExposureLevel): number => RANK[l];

export function makeExposure(start = 0): ExposureState {
  const e: ExposureState = {
    value: start, level: 'UNSEEN', unseenFor: start > 0 ? 0 : 99, seen: false,
    seenTime: 0, totalTime: 0, peak: start, losses: 0, worst: 'UNSEEN',
  };
  e.level = levelOf(e);
  e.worst = e.level;
  return e;
}

function levelOf(e: ExposureState): ExposureLevel {
  if (e.value >= EXPOSURE.underwatch) return 'UNDERWATCH';
  if (e.value >= EXPOSURE.tracked) return 'TRACKED';
  if (e.value > 1 || e.unseenFor < EXPOSURE.spottedMemory) return 'SPOTTED';
  return 'UNSEEN';
}

/** Advance one tick. `quality` is the best picture anything has of the rider, 0 for none. */
export function stepExposure(e: ExposureState, quality: number, dt: number): ExposureChange[] {
  const out: ExposureChange[] = [];
  const before = e.level;
  e.totalTime += dt;
  e.seen = quality > 0;
  if (e.seen) {
    e.unseenFor = 0;
    e.seenTime += dt;
    const k = e.value >= EXPOSURE.tracked ? EXPOSURE.trackedGain : 1;
    e.value = Math.min(100, e.value + (EXPOSURE.gain + EXPOSURE.gainQuality * quality) * k * dt);
  } else {
    e.unseenFor += dt;
    if (e.value >= EXPOSURE.tracked) {
      const hold = e.value >= EXPOSURE.underwatch ? EXPOSURE.holdUnderwatch : EXPOSURE.holdTracked;
      if (e.unseenFor >= hold) {
        e.value = EXPOSURE.lostTo;
        e.losses++;
        out.push('lost');
      }
    } else {
      e.value = Math.max(0, e.value - EXPOSURE.fade * dt);
    }
  }
  e.peak = Math.max(e.peak, e.value);
  e.level = levelOf(e);
  if (RANK[e.level] > RANK[e.worst]) e.worst = e.level;
  if (e.level !== before) {
    if (e.level === 'SPOTTED' && before === 'UNSEEN') out.push('spotted');
    else if (e.level === 'TRACKED' && RANK[before] < RANK.TRACKED) out.push('tracked');
    else if (e.level === 'UNDERWATCH') out.push('underwatch');
    else if (e.level === 'UNSEEN') out.push('clear');
  }
  return out;
}

/** The share of the run spent in somebody's picture, 0..1. */
export const exposureShare = (e: ExposureState): number => (e.totalTime > 0 ? e.seenTime / e.totalTime : 0);
