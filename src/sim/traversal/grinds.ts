/**
 * Grinds.
 *
 * Everything in Bellhaven with a straight hard edge at the right height is a
 * line: the rails, the plaza ledges, the benches, the tops of the Channel
 * walls. Press GRIND near one — on the ground it pops you, in the air it
 * catches — and the board locks onto it and rides it to the end. Ollie or
 * flip out to leave early.
 *
 * Kept forgiving on purpose. A catch needs the board roughly over the line,
 * roughly at its height and roughly going its way; it never needs a frame.
 * The skill is in getting to the line with speed and height, not in the
 * button press.
 */
import { type Vec2, angleOf, clamp01, dot, fromAngle, len, wrapAngle } from '../../core/math';
import type { WorldData } from '../worldTypes';
import type { PlayerState } from '../player';

export type GrindKind = 'rail' | 'ledge' | 'bench' | 'wall';

export interface GrindLine {
  id: string;
  kind: GrindKind;
  a: Vec2;
  b: Vec2;
  /** Height of the top, metres. */
  z: number;
  len: number;
}

export interface Grind {
  line: GrindLine;
  /** Metres along a→b. */
  t: number;
  dir: 1 | -1;
  speed: number;
  /** Seconds on it. */
  time: number;
  name: string;
}

export const GRIND = {
  /** How far off the line, horizontally, a catch still counts. */
  snap: 1.2,
  /** How far below the top the board may be and still be lifted onto it. */
  below: 0.5,
  /** ...and how far above it the board may be coming down from. */
  above: 1.8,
  /** The board must be going at least this fast along the line, m/s. */
  minAlong: 1.2,
  /** ...and no more than this far off its direction, radians (~60°). */
  maxAngle: 1.05,
  /** Speed lost per second on the line, m/s². */
  friction: 0.7,
  /** A grind slower than this falls off, m/s. */
  minSpeed: 2.0,
  /** Never ground slower than this after the catch: a catch is committal. */
  catchSpeed: 4.5,
  /** The hop off the end of a line, vz. */
  endPop: 2.4,
  /** A press is remembered this long, seconds. */
  buffer: 0.4,
  /** How far ahead the GRIND button looks for something to light up. */
  near: 7,
};

export const GRIND_NAMES: Record<GrindKind, readonly string[]> = {
  rail: ['50-50', '5-0', 'NOSEGRIND', 'FEEBLE', 'SMITH', 'CROOKED', 'BOARDSLIDE'],
  ledge: ['50-50', 'CROOKED', 'NOSESLIDE', 'TAILSLIDE', 'BLUNTSLIDE', 'SMITH', '5-0'],
  bench: ['50-50', 'NOSESLIDE', 'TAILSLIDE', '5-0', 'CROOKED'],
  wall: ['50-50', 'FEEBLE', 'TAILSLIDE', 'SMITH'],
};

const cache = new WeakMap<object, GrindLine[]>();

/** The town's grindable lines, worked out once. */
export function grindsFor(data: WorldData): GrindLine[] {
  const hit = cache.get(data);
  if (hit) return hit;
  const out: GrindLine[] = [];
  const add = (id: string, kind: GrindKind, a: Vec2, b: Vec2, z: number) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1.2) return;
    out.push({ id, kind, a: { ...a }, b: { ...b }, z, len: l });
  };
  for (const f of data.features) {
    if (!f.line) continue;
    add(`G-${f.id}`, f.kind === 'rail' ? 'rail' : 'ledge', f.line.a, f.line.b, f.rise);
  }
  for (const p of data.props) {
    if (p.kind !== 'bench') continue;
    const d = fromAngle(p.rot, 0.9 * p.scale);
    add(`G-${p.id}`, 'bench', { x: p.pos.x - d.x, y: p.pos.y - d.y }, { x: p.pos.x + d.x, y: p.pos.y + d.y }, 0.48);
  }
  // The Channel's walls: long, thin, chest high, and the best line in town
  // for anybody who can get up there.
  for (const b of data.buildings) {
    if (b.label !== 'CHANNEL WALL' || b.poly.length !== 4) continue;
    const [p0, p1, p2, p3] = b.poly;
    const e0 = Math.hypot(p1.x - p0.x, p1.y - p0.y), e1 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const mid = (u: Vec2, v: Vec2) => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 });
    const [a, c] = e0 >= e1 ? [mid(p3, p0), mid(p1, p2)] : [mid(p0, p1), mid(p2, p3)];
    add(`G-${b.id}`, 'wall', a, c, b.height);
  }
  cache.set(data, out);
  return out;
}

/** Where on the line the board is nearest, clamped to it, in metres from a. */
function along(l: GrindLine, p: Vec2): number {
  const ux = (l.b.x - l.a.x) / l.len, uy = (l.b.y - l.a.y) / l.len;
  return Math.max(0, Math.min(l.len, (p.x - l.a.x) * ux + (p.y - l.a.y) * uy));
}
const pointAt = (l: GrindLine, t: number): Vec2 => ({
  x: l.a.x + ((l.b.x - l.a.x) / l.len) * t, y: l.a.y + ((l.b.y - l.a.y) / l.len) * t,
});

export interface GrindCatch { line: GrindLine; t: number; dir: 1 | -1; along: number }

/**
 * A line the board could be put on right now, or null. `reach` widens the
 * snap for the button's "something is there" light.
 */
export function findGrind(p: PlayerState, lines: readonly GrindLine[], reach = GRIND.snap, anyHeight = false): GrindCatch | null {
  const sp = len(p.vel);
  if (sp < GRIND.minAlong) return null;
  let best: GrindCatch | null = null;
  let bestD = Infinity;
  for (const l of lines) {
    // Cheap reject on the bounding box.
    if (p.pos.x < Math.min(l.a.x, l.b.x) - reach || p.pos.x > Math.max(l.a.x, l.b.x) + reach) continue;
    if (p.pos.y < Math.min(l.a.y, l.b.y) - reach || p.pos.y > Math.max(l.a.y, l.b.y) + reach) continue;
    if (!anyHeight && (p.z < l.z - GRIND.below || p.z > l.z + GRIND.above)) continue;
    const t = along(l, p.pos);
    // Not off the very end of it: there has to be some line left to ride.
    const q = pointAt(l, t);
    const d = Math.hypot(q.x - p.pos.x, q.y - p.pos.y);
    if (d > reach) continue;
    const u = { x: (l.b.x - l.a.x) / l.len, y: (l.b.y - l.a.y) / l.len };
    const v = dot(p.vel, u);
    if (Math.abs(v) < GRIND.minAlong) continue;
    const off = Math.abs(wrapAngle(angleOf(p.vel) - (v >= 0 ? angleOf(u) : angleOf(u) + Math.PI)));
    if (off > GRIND.maxAngle) continue;
    const dir: 1 | -1 = v >= 0 ? 1 : -1;
    const left = dir > 0 ? l.len - t : t;
    if (left < 0.8) continue;
    if (d < bestD) { bestD = d; best = { line: l, t, dir, along: Math.abs(v) }; }
  }
  return best;
}

/** Lock on. The board snaps onto the line, going its way. */
export function startGrind(p: PlayerState, c: GrindCatch, name: string): Grind {
  const g: Grind = {
    line: c.line, t: c.t, dir: c.dir,
    speed: Math.max(GRIND.catchSpeed, Math.min(len(p.vel), 16)),
    time: 0, name,
  };
  placeOn(p, g);
  p.trick = null;
  p.grab = null;
  p.vz = 0;
  return g;
}

function placeOn(p: PlayerState, g: Grind): void {
  const l = g.line;
  const q = pointAt(l, g.t);
  const h = angleOf({ x: (l.b.x - l.a.x) * g.dir, y: (l.b.y - l.a.y) * g.dir });
  p.pos = q;
  p.z = l.z;
  p.ground = l.z;
  p.heading = h;
  p.turnRate = 0;
  p.vel = fromAngle(h, g.speed);
  p.speed = g.speed;
  p.stance = 'ROLL';
  p.slip = 0;
  p.lean = 0;
}

/** Ride it. Returns 'end' off the end, 'slow' when there is no speed left. */
export function stepGrind(p: PlayerState, g: Grind, dt: number, friction = GRIND.friction): 'hold' | 'end' | 'slow' {
  g.time += dt;
  g.speed = Math.max(0, g.speed - friction * dt);
  g.t += g.dir * g.speed * dt;
  const off = g.t < 0 || g.t > g.line.len;
  g.t = Math.max(0, Math.min(g.line.len, g.t));
  placeOn(p, g);
  p.crouch = -0.35;
  p.flow = clamp01(p.flow + 0.3 * dt);
  if (off) return 'end';
  if (g.speed < GRIND.minSpeed) return 'slow';
  return 'hold';
}

/** Off the line, with `vz` of pop: the hop off the end, or an ollie out. */
export function leaveGrind(p: PlayerState, g: Grind, vz: number): void {
  placeOn(p, g);
  p.stance = 'AIR';
  p.z = g.line.z + 0.01;
  p.vz = vz;
  p.ollieLoad = -1;
}
