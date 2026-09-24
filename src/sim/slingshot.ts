/**
 * The slingshot: a precision disruption instrument, not a weapon.
 *
 * Ballistics are simulated in 3D (x, y, z) so a camera on a 4.2 m pole and a
 * drone at 14 m are genuinely different problems.
 */
import { type Vec2, clamp01, fromAngle, lerp } from '../core/math';
import type { Rng } from '../core/rng';

export const MUZZLE_MIN = 18;
export const MUZZLE_MAX = 34;
export const PROJ_GRAVITY = 9.81;
export const PROJ_RADIUS = 0.28;
export const PROJ_LIFETIME = 3.2;
/** Launch height: roughly a teenager's eye line while rolling. */
export const LAUNCH_Z = 1.45;

export type ImpactKind =
  | 'cameraLens' | 'cameraMount' | 'cameraMotor'
  | 'drone' | 'light' | 'junction' | 'prop' | 'ground' | 'building' | 'foliage' | 'person';

/**
 * What makes one rock not the previous rock.
 *
 * A rock is gravel off a driveway and there are no two alike, but they are all
 * obviously rocks — nobody has to work out what they picked up. So the
 * variation is narrow and it is all silhouette: a little bigger or smaller, a
 * little wider than it is tall or the other way round, turned to a different
 * angle, and lumpier or smoother round the edge. No colour, no shape family,
 * nothing that could read as a different kind of ammunition, because there is
 * only one kind and the player must never wonder.
 *
 * Rolled once, from the simulation's own seeded generator, and carried on the
 * projectile — so the rock that leaves the sling is the rock that lands, and a
 * replay throws the same stones.
 */
export interface RockShape {
  /** Multiplier on drawn radius. Kept close to one. */
  size: number;
  /** How much wider than tall, or the reverse. 1 is round. */
  squash: number;
  /** Which way that squash points, in radians. */
  spin: number;
  /** How far the outline wanders in and out, 0..1. */
  jag: number;
  /** Where round the outline the wandering starts. */
  phase: number;
}

/** One rock, rolled. Everything about it stays within "that is a rock". */
export function rollRock(rng: Rng): RockShape {
  return {
    size: 0.82 + rng.next() * 0.36,
    squash: 0.84 + rng.next() * 0.32,
    spin: rng.next() * Math.PI * 2,
    jag: 0.6 + rng.next() * 0.8,
    phase: rng.next() * Math.PI * 2,
  };
}

export interface Projectile {
  id: number;
  pos: Vec2;
  z: number;
  vel: Vec2;
  vz: number;
  life: number;
  /** Where it was fired from; the player's own record, not the system's. */
  origin: Vec2;
  /** This particular stone. */
  shape: RockShape;
  trail: Array<{ x: number; y: number; z: number }>;
  /** Times it has skipped off the ground or glanced off a wall. */
  bounces: number;
  /** On the ground and rolling out, rather than in the air. */
  rolling: boolean;
  /** Whether it has touched anything yet: the first touch is the shot's result. */
  touched: boolean;
}

export interface Impact {
  projectile: Projectile;
  kind: ImpactKind;
  pos: Vec2;
  z: number;
  vel: Vec2;
  /** Vertical velocity at impact. Trajectory analysis needs it to solve range. */
  vz: number;
  targetId?: string;
  /** Where the stone was the step before, so a wall knows which face it met. */
  from: { x: number; y: number; z: number };
}

let idc = 0;
export function resetProjectileIds(): void { idc = 0; }

export function fire(from: Vec2, angle: number, draw: number, pitch: number, rng: Rng): Projectile {
  const speed = lerp(MUZZLE_MIN, MUZZLE_MAX, clamp01(draw));
  const spread = (1 - clamp01(draw)) * 0.02;
  const a = angle + rng.gauss() * spread;
  const dir = fromAngle(a);
  const horiz = Math.cos(pitch);
  return {
    id: ++idc,
    pos: { x: from.x, y: from.y },
    z: LAUNCH_Z,
    vel: { x: dir.x * speed * horiz, y: dir.y * speed * horiz },
    vz: Math.sin(pitch) * speed,
    life: PROJ_LIFETIME,
    origin: { x: from.x, y: from.y },
    // Whatever was under the hand this time.
    shape: rollRock(rng),
    trail: [],
    bounces: 0,
    rolling: false,
    touched: false,
  };
}

/**
 * Launch pitch needed to hit a target at horizontal distance d and height h.
 * Low arc where possible so shots read as flat and snappy rather than lobbed.
 */
export function solvePitch(d: number, h: number, speed: number): number | null {
  const g = PROJ_GRAVITY;
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * d * d + 2 * h * v2);
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const low = Math.atan((v2 - root) / (g * d));
  return low;
}

export interface BallisticTarget {
  id: string;
  pos: Vec2;
  z: number;
  radius: number;
  kind: 'camera' | 'drone' | 'light' | 'junction' | 'prop' | 'person' | 'foliage';
}

export interface StepContext {
  targets: BallisticTarget[];
  /** Building footprint test at ground level. */
  solidAt(p: Vec2): boolean;
  /** Height of the building at p, if any. */
  heightAt(p: Vec2): number;
}

/** Advance one projectile. Returns an impact if it hit something this step. */
export function stepProjectile(p: Projectile, ctx: StepContext, dt: number): Impact | null {
  const prev = { x: p.pos.x, y: p.pos.y, z: p.z };

  if (p.rolling) {
    // Rolling out: friction, no flight. Still able to clip a bin on the way.
    const sp = Math.hypot(p.vel.x, p.vel.y);
    const drop = Math.min(sp, ROLL_FRICTION * dt);
    if (sp > 1e-6) { p.vel.x -= (p.vel.x / sp) * drop; p.vel.y -= (p.vel.y / sp) * drop; }
    p.vz = 0;
    p.z = PROJ_RADIUS * 0.25;
  } else {
    p.vz -= PROJ_GRAVITY * dt;
  }
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;
  p.z += p.vz * dt;
  p.life -= dt;

  p.trail.push({ x: p.pos.x, y: p.pos.y, z: p.z });
  if (p.trail.length > 14) p.trail.shift();

  const at = (kind: ImpactKind, pos: Vec2, z: number, targetId?: string): Impact => ({
    projectile: p, kind, pos, z, vel: { x: p.vel.x, y: p.vel.y }, vz: p.vz, targetId, from: prev,
  });

  // Target hits, tested against the swept segment so fast shots do not tunnel.
  for (const t of ctx.targets) {
    const d = segmentPointDistance3(prev, { x: p.pos.x, y: p.pos.y, z: p.z }, t);
    if (d <= t.radius + PROJ_RADIUS) {
      return at(t.kind === 'camera' ? 'cameraLens' : (t.kind as ImpactKind), { x: t.pos.x, y: t.pos.y }, t.z, t.id);
    }
  }

  if (p.z <= 0) return at('ground', { x: p.pos.x, y: p.pos.y }, 0);

  const bh = ctx.heightAt(p.pos);
  if (bh > 0 && p.z < bh) return at('building', { x: p.pos.x, y: p.pos.y }, p.z);

  return null;
}

/** Rolling out on the ground, in m/s². High enough that a rock stops, not slides. */
export const ROLL_FRICTION = 9;

/**
 * How a surface gives a stone back: [vertical restitution, horizontal keep].
 *
 * Asphalt and concrete skip it; grass and dirt swallow it. The numbers are
 * chosen by ear and eye rather than from a table, and they are chosen so the
 * difference is visible from where the player stands — a stone that lands in a
 * lawn stops, a stone that lands in a road skitters on.
 */
export const BOUNCE: Record<string, [number, number]> = {
  asphalt: [0.42, 0.72],
  smoothConcrete: [0.46, 0.76],
  roughConcrete: [0.38, 0.66],
  tile: [0.44, 0.72],
  gravel: [0.22, 0.45],
  grass: [0.1, 0.36],
  dirt: [0.1, 0.32],
  water: [0, 0],
};

/**
 * Give a stone back to the air after it met the ground or a wall, if it has
 * anything left. Returns what happened, so the caller can make it heard.
 *
 * `solidAt` is used to tell which face of a wall was met: whichever axis of the
 * step, taken alone, would have put the stone inside is the axis that reflects.
 */
export function rebound(
  imp: Impact, surface: string, solidAt: (p: Vec2) => boolean, heightAt: (p: Vec2) => number = () => 0,
): 'bounce' | 'roll' | 'rest' | 'roof' {
  const p = imp.projectile;
  const h = Math.hypot(p.vel.x, p.vel.y);
  if (imp.kind === 'building') {
    // Came down onto the roof rather than into a wall: it stays up there,
    // which is where every rock on every roof in the world came from.
    if (imp.from.z >= heightAt(p.pos) - 0.05) return 'roof';
    const hitX = solidAt({ x: p.pos.x, y: imp.from.y });
    const hitY = solidAt({ x: imp.from.x, y: p.pos.y });
    p.pos.x = imp.from.x; p.pos.y = imp.from.y; p.z = imp.from.z;
    if (hitX || !hitY) p.vel.x *= -0.42;
    if (hitY || !hitX) p.vel.y *= -0.42;
    p.vel.x *= 0.8; p.vel.y *= 0.8;
    p.bounces++;
    return h > 2 ? 'bounce' : 'rest';
  }
  const [rest, keep] = BOUNCE[surface] ?? BOUNCE.asphalt;
  const vz = -p.vz * rest;
  p.z = 0.001;
  p.vel.x *= keep; p.vel.y *= keep;
  p.bounces++;
  if (vz > 1.1 && p.bounces < 6) { p.vz = vz; return 'bounce'; }
  if (h * keep > 0.8 && rest > 0) { p.rolling = true; p.vz = 0; return 'roll'; }
  return 'rest';
}

function segmentPointDistance3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: BallisticTarget,
): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  const px = t.pos.x - a.x, py = t.pos.y - a.y, pz = t.z - a.z;
  let s = l2 < 1e-9 ? 0 : (px * abx + py * aby + pz * abz) / l2;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const cx = a.x + abx * s, cy = a.y + aby * s, cz = a.z + abz * s;
  return Math.hypot(t.pos.x - cx, t.pos.y - cy, t.z - cz);
}

/**
 * Where on a camera did it land? A lens hit takes it offline; a housing hit
 * only rotates it. This is decided by the impact geometry, so aiming precisely
 * is genuinely different from aiming roughly.
 */
export function resolveCameraHit(
  impactVel: Vec2,
  cameraFacing: number,
  rng: Rng,
): 'cameraLens' | 'cameraMount' | 'cameraMotor' {
  const incoming = Math.atan2(-impactVel.y, -impactVel.x);
  const off = Math.abs(Math.atan2(Math.sin(incoming - cameraFacing), Math.cos(incoming - cameraFacing)));
  // Hitting a camera from the front puts the bearing into the lens.
  if (off < 0.55) return 'cameraLens';
  if (off < 1.5) return rng.chance(0.35) ? 'cameraMotor' : 'cameraMount';
  return 'cameraMount';
}

/** Predicted arc for the reticle, in world space. */
export function predictArc(
  from: Vec2, angle: number, pitch: number, speed: number, steps = 26, dt = 0.055,
): Array<{ x: number; y: number; z: number }> {
  const dir = fromAngle(angle);
  const horiz = Math.cos(pitch);
  let x = from.x, y = from.y, z = LAUNCH_Z;
  let vx = dir.x * speed * horiz, vy = dir.y * speed * horiz, vz = Math.sin(pitch) * speed;
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < steps; i++) {
    vz -= PROJ_GRAVITY * dt;
    x += vx * dt; y += vy * dt; z += vz * dt;
    out.push({ x, y, z });
    if (z < 0) break;
  }
  return out;
}

/**
 * Rocks that landed and are lying there.
 *
 * There is no ammunition economy any more: a rock is a rock, the ground is
 * covered in them, and a player who has to think about their supply of gravel
 * is thinking about a menu instead of a town. These are kept only so a shot
 * leaves something behind — the world remembers being hit.
 */
export interface DroppedRock { pos: Vec2; tick: number; shape: RockShape; }
