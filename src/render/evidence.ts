/**
 * Evidence, as the street shows it.
 *
 * The world should become more legible as the player understands it, without
 * the screen filling with HUD. So the street itself carries the player's
 * investigation, in the player's own amber and the player's own hand:
 *
 * - **A numbered evidence marker** — the folding tent a scene examiner puts
 *   down — stands beside every place the player has stopped and looked at,
 *   numbered in the order they found them. A pencil ring is drawn round it on
 *   the ground. A place that would read differently now (a second look) gets
 *   the ring twice: the hand went round it again.
 * - **A sightline** is ruled on the ground in front of every camera the
 *   player has noticed: a short dashed ink line the way it is looking, with a
 *   tick at the end. Cameras nobody has noticed have none. The town looks
 *   more mapped the more of it you have worked out.
 *
 * None of this is UNDERWATCH's. The machine's picture is the plan, in cyan;
 * this is the kid's, on the street, in pencil.
 */
import type { Vec2 } from '../core/math';

export interface Marker {
  id: string;
  pos: Vec2;
  /** 1-based, in the order the player found them. */
  n: number;
  /** A place that would read differently now. */
  again: boolean;
}

/**
 * The markers to stand in the street. `seen` is in the order the player found
 * things (a Set iterates in insertion order), so the numbers never reshuffle.
 */
export function markersFor(
  places: ReadonlyArray<{ id: string; pos: Vec2; visible: boolean }>,
  seen: Iterable<string>,
  fresh: ReadonlySet<string>,
): Marker[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  const out: Marker[] = [];
  let n = 0;
  for (const id of seen) {
    const p = byId.get(id);
    if (!p) continue;
    n++;
    if (!p.visible) continue;
    out.push({ id, pos: p.pos, n, again: fresh.has(id) });
  }
  return out;
}

export interface Sightline { from: Vec2; to: Vec2 }

/** How far a noticed camera's sightline is ruled, as a share of its range. */
export const SIGHTLINE_SHARE = 0.35;
export const SIGHTLINE_MAX = 11;

export function sightlinesFor(
  sensors: ReadonlyArray<{ id: string; pos: Vec2; facing: number; range: number }>,
  known: ReadonlySet<string>,
): Sightline[] {
  const out: Sightline[] = [];
  for (const s of sensors) {
    if (!known.has(s.id)) continue;
    const l = Math.min(SIGHTLINE_MAX, s.range * SIGHTLINE_SHARE);
    out.push({ from: s.pos, to: { x: s.pos.x + Math.cos(s.facing) * l, y: s.pos.y + Math.sin(s.facing) * l } });
  }
  return out;
}
