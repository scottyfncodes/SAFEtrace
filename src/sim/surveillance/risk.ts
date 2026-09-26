/**
 * The scoring model.
 *
 * Every term is inspectable in VISION. A system the player cannot audit is a
 * random number generator with a user interface, so the breakdown is part of
 * the design rather than a debug feature.
 */
import { clamp, clamp01, dist } from '../../core/math';
import { behaviourScore } from './behavior';
import type { Evidence, Incident, RiskBreakdown, Subject, Track } from './types';

export const WEIGHTS = {
  behaviour: 1.0,
  evidence: 1.0,
  incident: 1.0,
  anomaly: 20.0,
  history: 4.5,
  decayPerSecondUnobserved: 0.85,
  decayPerSecondNormal: 0.35,
};

export const EVIDENCE_DECAY_TICKS = 3600; // 60 s to fully shed one piece of evidence
/** The most that behaviour and prediction error alone can score: just under DRONE_DISPATCH. */
export const BEHAVIOUR_CEILING = 44;

export function scoreRisk(
  track: Track,
  subject: Subject,
  tick: number,
  evidence: Map<string, Evidence>,
  incidents: Incident[],
): RiskBreakdown {
  const behaviour = behaviourScore(track) * WEIGHTS.behaviour;

  let ev = 0;
  for (const id of track.linkedEvidence) {
    const e = evidence.get(id);
    if (!e) continue;
    const age = tick - e.tick;
    const fade = clamp01(1 - age / EVIDENCE_DECAY_TICKS);
    ev += e.weight * fade;
  }
  ev *= WEIGHTS.evidence;

  let inc = 0;
  for (const i of incidents) {
    if (!i.open) continue;
    const d = dist(i.pos, subject.pos);
    if (d < 60) inc += clamp01(1 - d / 60) * 14;
    if (i.associated.includes(track.attributedIdentity)) inc += 28;
  }
  inc *= WEIGHTS.incident;

  const anomaly = track.predictionError * WEIGHTS.anomaly * (1 - subject.familiarity);
  const history = subject.priorContacts * WEIGHTS.history;

  /*
   * Watched is not hunted, and the dial says so.
   *
   * Behaviour and the forecast being wrong about you are things an ordinary
   * afternoon produces — the alley, the Channel, standing still in view — and
   * on their own they used to carry the score past the line where the
   * headline reads DRONE_DISPATCH, with no drone. Nothing you can do by
   * moving gets there now. The rest of the ladder is reached the way the
   * dispatcher already required: evidence with your name on it, an incident,
   * a contact on your record.
   */
  const conduct = Math.min(behaviour + anomaly, BEHAVIOUR_CEILING);
  const raw = conduct + ev + inc + history;

  // Decay: being unobserved and behaving normally lowers the score.
  const unobservedS = Math.max(0, tick - track.lastObservedTick) / 60;
  const normal = track.flags.has('NORMAL_TRANSIT') && track.flags.size === 1;
  const decayRate =
    (track.confidence < 0.25 ? WEIGHTS.decayPerSecondUnobserved : 0) +
    (normal ? WEIGHTS.decayPerSecondNormal : 0);

  const prev = track.risk.total;
  const target = clamp(raw, 0, 100);
  let total: number;
  if (target > prev) {
    // Rises quickly: the system is eager.
    total = prev + (target - prev) * 0.06;
  } else {
    // Falls only through explicit decay, never instantly.
    const decayStep = decayRate / 60;
    total = Math.max(target, prev - decayStep);
    total = Math.max(0, total);
  }

  // Unobserved for a long time with nothing outstanding: the system forgets.
  if (unobservedS > 25 && track.linkedEvidence.length === 0) {
    total = Math.max(0, total - 0.05);
  }

  return {
    behaviour,
    evidence: ev,
    incident: inc,
    anomaly,
    history,
    decay: decayRate,
    total: clamp(total, 0, 100),
  };
}

export function riskLabel(total: number): string {
  if (total < 25) return 'NOMINAL';
  if (total < 45) return 'ELEVATED';
  if (total < 65) return 'HIGH';
  if (total < 85) return 'CRITICAL';
  return 'INTERVENTION';
}
