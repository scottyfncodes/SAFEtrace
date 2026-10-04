/**
 * The town's pole line: timber utility poles on one verge of every asphalt
 * street, about thirty metres apart, wired in runs.
 *
 * This used to live in the renderer as street dressing. It moved here when the
 * poles became something a rider can hook a sling line over: the pole you can
 * see has to be exactly the pole you can use, so both sides read one list.
 * Deterministic from the world data alone, and computed once per town.
 */
import { type Vec2, pointInPoly } from '../../core/math';
import type { WorldData } from '../worldTypes';

/** Height of a utility pole's top, metres. */
export const POLE_H = 8.6;

export interface UtilityPole { at: Vec2; rot: number; can: boolean }
export interface PoleWire { a: Vec2; b: Vec2; z: number; sag: number }
export interface PoleLine { poles: UtilityPole[]; wires: PoleWire[] }

const cache = new WeakMap<object, PoleLine>();

export function poleLineFor(data: WorldData): PoleLine {
  const hit = cache.get(data);
  if (hit) return hit;
  const out: PoleLine = { poles: [], wires: [] };
  const nodes = new Map(data.roadNodes.map((r) => [r.id, r.pos]));
  const edges = data.roadEdges
    .map((e) => ({ e, a: nodes.get(e.a), b: nodes.get(e.b) }))
    .filter((x): x is { e: typeof data.roadEdges[number]; a: Vec2; b: Vec2 } => !!x.a && !!x.b);
  const inBuilding = (q: Vec2, pad: number) => data.buildings.some((b) => pointInPoly(b.poly, q) || polyDist(q, b.poly) < pad);
  const onRoad = (q: Vec2, pad: number) => edges.some(({ e, a, b }) => segDist(q.x, q.y, a, b) < e.width / 2 + pad);
  const nearThing = (q: Vec2, r: number) => data.props.some((p) => Math.hypot(p.pos.x - q.x, p.pos.y - q.y) < r + (p.kind === 'fenceGate' ? p.scale / 2 : 0))
    || data.features.some((f) => pointInPoly(f.poly, q) || polyDist(q, f.poly) < r);
  // Footways, plazas, forecourts: anywhere a planner expects people to move.
  const onModelled = (q: Vec2, pad: number) => data.surfaces.some((sf) => sf.modelled && (pointInPoly(sf.poly, q) || polyDist(q, sf.poly) < pad));

  let k = 0;
  let last: Vec2 | null = null;
  let prevB = '';
  for (const { e, a, b } of edges) {
    // A run of wire carries on round a bend in the same street.
    if (e.a !== prevB) last = null;
    prevB = e.b;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 8) continue;
    if (e.surface !== 'asphalt') continue;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const nx = -uy, ny = ux;
    const rot = Math.atan2(uy, ux);
    const off = e.width / 2 + 2.2 + 0.8;
    for (let d = 7; d < len - 4; d += 30) {
      // Nudge along the verge round a driveway's bins or a mailbox, the way a
      // line crew would; failing that, the far verge; give up and break the
      // run only if nothing fits.
      let at: Vec2 | null = null;
      for (const side of [1, -1]) {
        for (const shift of [0, 2.5, -2.5, 5, -5]) {
          const q = { x: a.x + ux * (d + shift) + nx * off * side, y: a.y + uy * (d + shift) + ny * off * side };
          if (!inBuilding(q, 0.8) && !onRoad(q, 2.4) && !onModelled(q, 0.3) && !nearThing(q, 1.0)) { at = q; break; }
        }
        if (at) break;
      }
      if (!at) { last = null; continue; }
      out.poles.push({ at, rot, can: (k++ % 4) === 1 });
      if (last && Math.hypot(at.x - last.x, at.y - last.y) < 42) {
        for (const side of [-0.7, 0.7]) {
          out.wires.push({
            a: { x: last.x + nx * side, y: last.y + ny * side },
            b: { x: at.x + nx * side, y: at.y + ny * side },
            z: POLE_H - 0.5, sag: 0.45,
          });
        }
      }
      last = at;
    }
  }
  cache.set(data, out);
  return out;
}

function polyDist(q: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) best = Math.min(best, segDist(q.x, q.y, poly[j], poly[i]));
  return best;
}

function segDist(x: number, y: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}
