/**
 * Anchors: the things in the town a sling line can be hooked over.
 *
 * Nothing here is new furniture invented for the mechanic. The pole line
 * already ran down every street, the cameras were already on their poles, and
 * the flat roofs already had plant on them. What changes is that the player
 * learns to look at all of it and think "I can use that" — which is the whole
 * of what a traversal game asks of its city.
 *
 * Five kinds, and each one reads differently from the street:
 *   pole    — a timber utility pole. Tall, everywhere, the backbone of a route.
 *   camera  — a street or plaza camera's own pole. Swinging round the thing
 *             that is watching the street is the joke the game is built on.
 *   sign    — a sign post or a hoop. Low: a tight, fast whip round a corner.
 *   mast    — an aerial on a flat roof. High: hooked from the street, it is
 *             how you get on top of a building.
 *   lamp    — a light standard, where a plaza or a court has no pole line:
 *             the pole line stops at the paving, and the lamps carry on.
 */
import { type Vec2, closestOnSegment, dist, pointInPoly } from '../../core/math';
import type { Building, WorldData } from '../worldTypes';
import { POLE_H, poleLineFor } from './poleLine';

export type AnchorKind = 'pole' | 'camera' | 'sign' | 'mast' | 'lamp';

export interface Anchor {
  id: string;
  kind: AnchorKind;
  pos: Vec2;
  /** Height of the hook point, metres above the street. */
  z: number;
  /** For a camera's pole, which camera. */
  sensorId?: string;
  /** For a mast, the roof it stands on. */
  buildingId?: string;
}

/** Flat roofs at least this tall get a mast. Garages and sheds are hopped, not hooked. */
export const MAST_MIN_ROOF = 4.5;
/** How far a mast stands above its roof. */
export const MAST_RISE = 3.2;

/** Height of a light standard's head, metres. */
export const LAMP_H = 6.4;
/** A street node with nothing to hook within this gets a light standard. */
const LAMP_GAP = 22;

/** Building kinds with a flat roof a board can roll on. Houses are pitched. */
export const flatRoofed = (b: Building): boolean => b.kind !== 'house';

const cache = new WeakMap<object, Anchor[]>();

export function anchorsFor(data: WorldData): Anchor[] {
  const hit = cache.get(data);
  if (hit) return hit;
  const out: Anchor[] = [];

  poleLineFor(data).poles.forEach((p, i) => {
    // The hook goes over the crossarm, not the very top.
    out.push({ id: `PL-${i + 1}`, kind: 'pole', pos: { x: p.at.x, y: p.at.y }, z: POLE_H - 0.6 });
  });

  for (const s of data.sensors) {
    // Porch and doorbell cameras are on houses; reader and indoor ones are not
    // up a pole at all. Everything else stands on one.
    if (s.interior) continue;
    if (s.kind !== 'street' && s.kind !== 'plaza' && s.kind !== 'school' && s.kind !== 'facility') continue;
    if (s.height < 3.4) continue;
    out.push({ id: `CM-${s.id}`, kind: 'camera', pos: { x: s.pos.x, y: s.pos.y }, z: s.height, sensorId: s.id });
  }

  for (const p of data.props) {
    if (p.kind !== 'pole' && p.kind !== 'sign' && p.kind !== 'hoop') continue;
    out.push({ id: `SG-${p.id}`, kind: 'sign', pos: { x: p.pos.x, y: p.pos.y }, z: p.kind === 'hoop' ? 3.05 : 3.0 });
  }

  for (const b of data.buildings) {
    if (!flatRoofed(b) || b.height < MAST_MIN_ROOF) continue;
    out.push({ id: `MS-${b.id}`, kind: 'mast', pos: centroid(b.poly), z: b.height + MAST_RISE, buildingId: b.id });
  }

  // Two anchors on top of one another are one anchor to a player.
  const kept: Anchor[] = [];
  for (const a of out) if (!kept.some((k) => dist(k.pos, a.pos) < 1.5)) kept.push(a);

  // Where the pole line has a hole — a plaza, a paved court — a light
  // standard at the side of the way, so no stretch of street is a dead end.
  const solid = (q: Vec2) => data.buildings.some((b) => b.height > 0.3 && (pointInPoly(b.poly, q) || nearPoly(b.poly, q, 1.2)));
  const cluttered = (q: Vec2) => data.props.some((p) => dist(p.pos, q) < 1.4);
  let n = 0;
  for (const node of data.roadNodes) {
    if (kept.some((k) => dist(k.pos, node.pos) <= LAMP_GAP)) continue;
    for (const r of [7, 9, 5, 11]) {
      let placed = false;
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + 0.3;
        const q = { x: node.pos.x + Math.cos(ang) * r, y: node.pos.y + Math.sin(ang) * r };
        if (solid(q) || cluttered(q)) continue;
        kept.push({ id: `LP-${++n}`, kind: 'lamp', pos: q, z: LAMP_H });
        placed = true;
        break;
      }
      if (placed) break;
    }
  }
  cache.set(data, kept);
  return kept;
}

function centroid(poly: Vec2[]): Vec2 {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / poly.length, y: y / poly.length };
}

function nearPoly(poly: Vec2[], p: Vec2, r: number): boolean {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (dist(closestOnSegment(poly[j], poly[i], p), p) < r) return true;
  }
  return false;
}
