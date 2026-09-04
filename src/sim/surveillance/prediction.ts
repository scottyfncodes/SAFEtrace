/**
 * Forecasting a track along the road graph.
 *
 * Two consequences, and they are the game:
 *  - assets are dispatched to the forecast, not to the truth, so a broken
 *    forecast is a real escape;
 *  - a broken forecast is itself scored as BEHAVIORAL ANOMALY, so escaping
 *    makes you more interesting.
 */
import { type Vec2, angleDelta, clamp01, dist, norm } from '../../core/math';
import type { World } from '../world';
import type { Subject, Track } from './types';

export const PREDICT_HORIZON_S = 15;
const MAX_NODES = 7;

export interface PredictionResult { path: Vec2[]; confidence: number; }

export function predict(track: Track, world: World, subject: Subject): PredictionResult {
  const from = track.estimate;
  const start = world.nearestRoadNode(from, 45);
  if (!start) return { path: [], confidence: 0 };

  const heading = norm(track.estimatedVel);
  const hasHeading = Math.hypot(track.estimatedVel.x, track.estimatedVel.y) > 0.8;
  const headingAngle = Math.atan2(heading.y, heading.x);

  const path: Vec2[] = [start.pos];
  let current = start.id;
  let previous: string | null = null;
  let bearing = hasHeading ? headingAngle : 0;
  let confidence = clamp01(track.confidence * 0.9);

  for (let i = 0; i < MAX_NODES; i++) {
    const cur = world.roadNodeById.get(current);
    if (!cur) break;
    const options = world.neighbours(current).filter((n) => n.to !== previous);
    if (options.length === 0) break;

    let best = options[0];
    let bestScore = -Infinity;
    let total = 0;
    const scores: number[] = [];

    for (const o of options) {
      const np = world.roadNodeById.get(o.to);
      if (!np) { scores.push(0); continue; }
      const a = Math.atan2(np.pos.y - cur.pos.y, np.pos.x - cur.pos.x);
      // Straight-ahead bias, edge usage prior, and the identity's district prior.
      const align = Math.cos(angleDelta(bearing, a));
      const districtPrior = subject.districtPriors[np.district] ?? 0.5;
      const score = (0.55 + align * 0.45) * o.edge.prior * (0.6 + districtPrior * 0.6);
      scores.push(Math.max(0, score));
      total += Math.max(0, score);
      if (score > bestScore) { bestScore = score; best = o; }
    }

    // Confidence per step is how dominant the chosen branch is.
    const share = total > 0 ? Math.max(0, bestScore) / total : 0;
    confidence *= clamp01(0.55 + share * 0.45);

    const np = world.roadNodeById.get(best.to);
    if (!np) break;
    bearing = Math.atan2(np.pos.y - cur.pos.y, np.pos.x - cur.pos.x);
    path.push(np.pos);
    previous = current;
    current = best.to;
  }

  return { path, confidence: clamp01(confidence) };
}

/**
 * How wrong the forecast is right now, 0..1.
 * Off-graph movement makes this rise fast, which is the design's whole point:
 * prediction runs on the road graph, and freedom lives off it.
 */
export function measureError(track: Track, subject: Subject, world: World, prevError: number): number {
  if (track.prediction.length < 2) {
    // Nothing forecast: unknown, not necessarily anomalous.
    return prevError * 0.995;
  }
  let best = Infinity;
  for (let i = 1; i < track.prediction.length; i++) {
    const d = distToSeg(track.prediction[i - 1], track.prediction[i], subject.pos);
    if (d < best) best = d;
  }
  const offRoad = world.distanceOffModel(subject.pos);
  const corridor = 12;
  const instant = clamp01(Math.max(best - corridor, 0) / 45 + Math.max(offRoad - 13, 0) / 40);
  // Smooth so a single corner does not read as anomalous.
  return clamp01(prevError * 0.965 + instant * 0.035 * 4);
}

function distToSeg(a: Vec2, b: Vec2, p: Vec2): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 < 1e-9) return dist(a, p);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/** Where the system thinks the subject will be in `seconds`. Dispatch aims here. */
export function forecastPoint(track: Track, seconds: number, speed: number): Vec2 {
  if (track.prediction.length === 0) return track.estimate;
  let budget = Math.max(2, speed) * seconds;
  for (let i = 1; i < track.prediction.length; i++) {
    const a = track.prediction[i - 1], b = track.prediction[i];
    const seg = dist(a, b);
    if (budget <= seg) {
      const t = seg < 1e-6 ? 0 : budget / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    budget -= seg;
  }
  return track.prediction[track.prediction.length - 1];
}
