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
  | 'drone' | 'light' | 'junction' | 'prop' | 'ground' | 'building';

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
  kind: 'camera' | 'drone' | 'light' | 'junction' | 'prop' | 'person';
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

  p.vz -= PROJ_GRAVITY * dt;
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;
  p.z += p.vz * dt;
  p.life -= dt;

  p.trail.push({ x: p.pos.x, y: p.pos.y, z: p.z });
  if (p.trail.length > 14) p.trail.shift();

  // Target hits, tested against the swept segment so fast shots do not tunnel.
  for (const t of ctx.targets) {
    const d = segmentPointDistance3(prev, { x: p.pos.x, y: p.pos.y, z: p.z }, t);
    if (d <= t.radius + PROJ_RADIUS) {
      return {
        projectile: p,
        kind: t.kind === 'camera' ? 'cameraLens' : (t.kind as ImpactKind),
        pos: { x: t.pos.x, y: t.pos.y },
        z: t.z,
        vel: { x: p.vel.x, y: p.vel.y },
        vz: p.vz,
        targetId: t.id,
      };
    }
  }

  if (p.z <= 0) {
    return { projectile: p, kind: 'ground', pos: { x: p.pos.x, y: p.pos.y }, z: 0, vel: { x: p.vel.x, y: p.vel.y }, vz: p.vz };
  }

  const bh = ctx.heightAt(p.pos);
  if (bh > 0 && p.z < bh) {
    return { projectile: p, kind: 'building', pos: { x: p.pos.x, y: p.pos.y }, z: p.z, vel: { x: p.vel.x, y: p.vel.y }, vz: p.vz };
  }

  return null;
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
