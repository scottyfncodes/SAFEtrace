/**
 * Observations -> Tracks.
 *
 * This file contains the false positive. It is not scripted: misattribution is
 * a real outcome of the honest attribution rule below, which is why the story
 * beat is protected by a regression test.
 */
import { clamp01, lerpV } from '../../core/math';
import type { Rng } from '../../core/rng';
import type { Observation, Subject, Track } from './types';

export const TRACK_DECAY_HALFLIFE_TICKS = 150; // 2.5 s to halve confidence unobserved
export const HISTORY_LENGTH = 240; // 4 s of samples at 60 Hz
const ATTRIBUTION_ACCEPT = 0.62;

export function makeTrack(subject: Subject): Track {
  return {
    id: `TRK-${subject.id}`,
    subjectId: subject.id,
    attributedIdentity: subject.identity,
    attributionConfidence: 0,
    estimate: { x: subject.pos.x, y: subject.pos.y },
    estimatedVel: { x: 0, y: 0 },
    confidence: 0,
    lastObservedTick: -99999,
    history: [],
    flags: new Set(),
    prediction: [],
    predictionConfidence: 0,
    predictionError: 0,
    risk: { behaviour: 0, evidence: 0, incident: 0, anomaly: 0, history: 0, decay: 0, total: 0 },
    linkedEvidence: [],
    suppressedUntil: 0,
    maskedUntil: 0,
  };
}

/**
 * Fold this tick's observations into a track.
 *
 * Attribution rule: an observation attributes to the identity with the highest
 * posterior, combining match confidence with the identity's prior association
 * with the observation's district. When the true subject has no strong prior
 * and a candidate identity has a very strong one, the candidate can win. That
 * is exactly how a real system produces a 98.7% match on someone four
 * kilometres away, and nothing here has to lie for it to happen.
 */
export function fuse(
  track: Track,
  obs: Observation[],
  subject: Subject,
  tick: number,
  rng: Rng,
  candidates: Array<{ identity: string; prior: number }> = [],
): void {
  if (tick < track.maskedUntil || tick < track.suppressedUntil) {
    decayTrack(track, tick);
    pushHistory(track, subject, tick, 0);
    return;
  }

  if (obs.length === 0) {
    decayTrack(track, tick);
    pushHistory(track, subject, tick, 0);
    return;
  }

  // Best observation wins; multiple sensors raise confidence faster.
  let best = obs[0];
  for (const o of obs) if (o.quality > best.quality) best = o;
  const multi = clamp01(0.6 + obs.length * 0.25);

  const gain = clamp01(best.quality * multi);
  track.estimate = lerpV(track.estimate, best.pos, clamp01(0.35 + gain * 0.55));
  const dtTicks = Math.max(1, tick - track.lastObservedTick);
  if (dtTicks < 30) {
    track.estimatedVel = {
      x: (best.pos.x - track.estimate.x) * 60 / dtTicks,
      y: (best.pos.y - track.estimate.y) * 60 / dtTicks,
    };
  } else {
    track.estimatedVel = { x: subject.vel.x, y: subject.vel.y };
  }
  track.confidence = clamp01(track.confidence + gain * 0.5 * (1 - track.confidence) + 0.06);
  track.lastObservedTick = tick;

  // --- identity attribution -------------------------------------------
  const truePrior = 1;
  let bestIdentity = best.attributedIdentity;
  let bestScore = best.identityConfidence * truePrior;

  for (const c of candidates) {
    // Ambiguity rises as match confidence falls; a strong prior can then dominate.
    const ambiguity = 1 - best.identityConfidence;
    const score = (best.identityConfidence * 0.55 + ambiguity * 0.9) * c.prior;
    if (score > bestScore) { bestScore = score; bestIdentity = c.identity; }
  }

  const reported = clamp01(
    0.5 + bestScore * 0.5 + rng.gauss() * 0.01,
  );

  if (reported >= ATTRIBUTION_ACCEPT) {
    track.attributedIdentity = bestIdentity;
    track.attributionConfidence = reported;
  } else {
    track.attributedIdentity = 'UNKNOWN';
    track.attributionConfidence = reported;
  }

  pushHistory(track, subject, tick, best.quality);
}

export function decayTrack(track: Track, tick: number): void {
  const since = tick - track.lastObservedTick;
  if (since <= 0) return;
  track.confidence *= Math.pow(0.5, 1 / TRACK_DECAY_HALFLIFE_TICKS);
  if (track.confidence < 0.02) track.confidence = 0;
  // Dead reckoning: the estimate keeps moving on the last known velocity, then stalls.
  const drift = clamp01(1 - since / 180);
  track.estimate = {
    x: track.estimate.x + track.estimatedVel.x * (1 / 60) * drift,
    y: track.estimate.y + track.estimatedVel.y * (1 / 60) * drift,
  };
}

function pushHistory(track: Track, subject: Subject, tick: number, _quality: number): void {
  const last = track.history[track.history.length - 1];
  if (last && tick - last.tick < 4) return;
  track.history.push({
    pos: { x: subject.pos.x, y: subject.pos.y },
    tick,
    speed: subject.speed,
    offRoad: 0,
  });
  if (track.history.length > HISTORY_LENGTH / 4) track.history.shift();
}
