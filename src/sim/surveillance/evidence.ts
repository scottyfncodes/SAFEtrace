/**
 * Physical traces and trajectory analysis.
 *
 * The analysis delay is deliberate: it gives the player a window in which to
 * leave the estimated origin, which turns every shot into a small route problem.
 */
import { type Vec2, clamp01, dist, norm } from '../../core/math';
import type { Rng } from '../../core/rng';
import type { Evidence, EvidenceKind, Track } from './types';

export const ANALYSIS_TICKS = 168; // 2.8 s of "TRAJECTORY ANALYSIS IN PROGRESS"

export const EVIDENCE_WEIGHT: Record<EvidenceKind, number> = {
  PROJECTILE_IMPACT: 16,
  NODE_OFFLINE: 30,
  NODE_TAMPER: 24,
  NOISE: 3,
  DRONE_INTERFERENCE: 38,
};

let counter = 0;
export function resetEvidenceIds(): void { counter = 0; }

export function makeEvidence(
  kind: EvidenceKind,
  pos: Vec2,
  tick: number,
  label: string,
  opts: { impactVel?: Vec2; observedBy?: string[] } = {},
): Evidence {
  return {
    id: `EV-${(++counter).toString().padStart(4, '0')}`,
    kind,
    pos: { x: pos.x, y: pos.y },
    tick,
    impactVel: opts.impactVel,
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
  const speed = Math.hypot(e.impactVel.x, e.impactVel.y);
  // Range estimate from impact energy; the faster it hit, the closer the shooter.
  const estRange = clamp01((speed - 8) / 26) * 34 + 8;

  const origin: Vec2 = { x: e.pos.x - dir.x * estRange, y: e.pos.y - dir.y * estRange };

  // Uncertainty: unobserved impacts back-project badly.
  const observedBonus = e.observedBy.length > 0 ? 0.45 : 1.0;
  const uncertainty = (7 + estRange * 0.42) * observedBonus + rng.range(-1.5, 2.5);

  e.originEstimate = origin;
  e.originUncertainty = Math.max(4, uncertainty);

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
