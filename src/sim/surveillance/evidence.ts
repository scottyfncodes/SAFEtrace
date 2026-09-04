/**
 * Physical traces and trajectory analysis.
 *
 * The analysis delay is deliberate: it gives the player a window in which to
 * leave the estimated origin, which turns every shot into a small route problem.
 */
import { type Vec2, dist, norm } from '../../core/math';
import { LAUNCH_Z } from '../slingshot';
import type { Rng } from '../../core/rng';
import type { Evidence, EvidenceKind, Track } from './types';

export const ANALYSIS_TICKS = 168; // 2.8 s of "TRAJECTORY ANALYSIS IN PROGRESS"

export const EVIDENCE_WEIGHT: Record<EvidenceKind, number> = {
  PROJECTILE_IMPACT: 16,
  NODE_OFFLINE: 30,
  NODE_TAMPER: 24,
  NOISE: 3,
  DRONE_INTERFERENCE: 38,
  // The heaviest thing in the list, and it does no damage at all.
  PERSON_STRUCK: 46,
};

let counter = 0;
export function resetEvidenceIds(): void { counter = 0; }

export function makeEvidence(
  kind: EvidenceKind,
  pos: Vec2,
  tick: number,
  label: string,
  opts: { impactVel?: Vec2; impactVz?: number; impactZ?: number; observedBy?: string[] } = {},
): Evidence {
  return {
    id: `EV-${(++counter).toString().padStart(4, '0')}`,
    kind,
    pos: { x: pos.x, y: pos.y },
    tick,
    impactVel: opts.impactVel,
    impactVz: opts.impactVz,
    impactZ: opts.impactZ,
    observedBy: opts.observedBy ?? [],
    stage: 'NEW',
    analysisCompleteTick: tick + ANALYSIS_TICKS,
    originUncertainty: 0,
    weight: EVIDENCE_WEIGHT[kind],
    label,
  };
}

export interface AnalysisOutcome {
  evidence: Evidence;
  linked: boolean;
  candidateCount: number;
}

/**
 * Back-project the impact to an estimated firing position, then search for
 * tracks that were inside the uncertainty disc at the impact tick.
 *
 * Beating this is a skill: shoot from cover, at an oblique angle, from a
 * crowd, or from somewhere you can leave before the search runs.
 */
export function analyse(
  e: Evidence,
  tracks: Track[],
  rng: Rng,
): AnalysisOutcome {
  e.stage = 'RESOLVED';

  if (!e.impactVel) {
    // Noise and tamper events have no ballistics; only direct observation links them.
    const nearby = tracks.filter(
      (t) => t.confidence > 0.35 && dist(t.estimate, e.pos) < 18,
    );
    if (e.observedBy.length > 0 && nearby.length === 1) {
      e.linkedTrackId = nearby[0].id;
      e.linkedIdentity = nearby[0].attributedIdentity;
      return { evidence: e, linked: true, candidateCount: 1 };
    }
    e.originEstimate = { x: e.pos.x, y: e.pos.y };
    e.originUncertainty = 30;
    return { evidence: e, linked: false, candidateCount: nearby.length };
  }

  const dir = norm(e.impactVel);
  const estRange = solveRange(e);

  const origin: Vec2 = { x: e.pos.x - dir.x * estRange, y: e.pos.y - dir.y * estRange };

  // Uncertainty grows with range and shrinks when a sensor actually saw the
  // impact. An unobserved shot from cover back-projects into a disc wide
  // enough to hold half a street, which is exactly the skill the player learns.
  const observedBonus = e.observedBy.length > 0 ? 0.42 : 0.95;
  const uncertainty = (5 + estRange * 0.34) * observedBonus + rng.range(-1, 2);

  e.originEstimate = origin;
  e.originUncertainty = Math.max(6, uncertainty);

  const candidates = tracks.filter((t) => {
    if (t.confidence < 0.22) return false;
    const at = positionAtTick(t, e.tick);
    return dist(at, origin) <= e.originUncertainty;
  });

  if (candidates.length === 1) {
    e.linkedTrackId = candidates[0].id;
    e.linkedIdentity = candidates[0].attributedIdentity;
    return { evidence: e, linked: true, candidateCount: 1 };
  }

  return { evidence: e, linked: false, candidateCount: candidates.length };
}

/**
 * Reconstruct how far the projectile flew, from the ballistics of the impact.
 *
 * Horizontal speed is constant in flight, so range cannot be read from speed
 * alone. It comes from the drop: given the launch height, the impact height and
 * the vertical velocity at impact, the time of flight is determined, and range
 * is that time times the horizontal speed. The system is competent at this.
 * The player beats it with geometry and cover, not because its arithmetic is bad.
 */
export function solveRange(e: Evidence): number {
  if (!e.impactVel) return 0;
  const vh = Math.hypot(e.impactVel.x, e.impactVel.y);
  if (vh < 0.5) return 0;
  const vz1 = e.impactVz ?? 0;
  const dz = (e.impactZ ?? 0) - LAUNCH_Z;
  const g = 9.81;
  // (g/2) t^2 + vz1 t - dz = 0, taking the positive root.
  const disc = vz1 * vz1 + 2 * g * dz;
  let t: number;
  if (disc < 0) {
    // Geometry the model cannot reconcile; fall back to a flat-arc assumption.
    t = Math.abs(vz1) / g * 2;
  } else {
    t = (-vz1 + Math.sqrt(disc)) / g;
  }
  if (!Number.isFinite(t) || t <= 0) t = Math.max(0.2, Math.abs(vz1) / g);
  return Math.min(90, Math.max(2, vh * t));
}

/** Where the system believed this track was at a past tick. */
function positionAtTick(t: Track, tick: number): Vec2 {
  let best = t.estimate;
  let bestDt = Infinity;
  for (const s of t.history) {
    const dt = Math.abs(s.tick - tick);
    if (dt < bestDt) { bestDt = dt; best = s.pos; }
  }
  return best;
}
