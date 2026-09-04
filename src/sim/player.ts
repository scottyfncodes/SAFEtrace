/**
 * Skating. The game's primary instrument.
 *
 * Everything here is tuned against one test: a good player should be legible
 * to a spectator as good, purely from how they move down a street.
 */
import {
  type Vec2, TAU, angleOf, clamp, clamp01, damp, dot, fromAngle, len,
  norm, remap, wrapAngle,
} from '../core/math';
import type { Intent } from '../core/input';
import type { World } from './world';
import { SURFACE } from './world';

export type Stance = 'FOOT' | 'ROLL' | 'AIR' | 'SLIDE' | 'BAIL';

export const TUNE = {
  footSpeed: 2.6,
  maxSpeed: 11.0,
  flowSpeedBonus: 2.5,
  pushImpulse: 3.1,
  pushCooldown: 0.42,
  pushDuration: 0.22,
  carveLow: 3.4,
  carveHigh: 1.1,
  carveAimPenalty: 0.65,
  lateralGrip: 0.86,
  ollieImpulse: 3.6,
  ollieMaxLoad: 0.25,
  gravity: 21,
  slideFriction: 6.5,
  slideSteer: 4.6,
  brakeFriction: 7.5,
  bailTime: 1.1,
  curbHeight: 0.15,
  curbBailSpeed: 6.0,
  flowRise: 0.34,
  flowFall: 0.9,
  landingToleranceDeg: 42,
};

export interface PlayerState {
  pos: Vec2;
  vel: Vec2;
  /** Board heading. Not identical to velocity direction: the difference is drift. */
  heading: number;
  z: number;
  vz: number;
  stance: Stance;
  speed: number;
  flow: number;
  pushTimer: number;
  pushCooldown: number;
  ollieLoad: number;
  bailTimer: number;
  onBoard: boolean;
  /** Ammunition. A physical count, not an economy. */
  bearings: number;
  maxBearings: number;
  aiming: boolean;
  draw: number;
  /** Metres travelled; used only for telemetry and story pacing. */
  odometer: number;
  lastSurface: string;
  /** Rendering hooks. */
  landedThisTick: boolean;
  bailedThisTick: boolean;
  pushedThisTick: boolean;
  poppedThisTick: boolean;
}

export function makePlayer(spawn: Vec2): PlayerState {
  return {
    pos: { x: spawn.x, y: spawn.y },
    vel: { x: 0, y: 0 },
    heading: 0,
    z: 0,
    vz: 0,
    stance: 'ROLL',
    speed: 0,
    flow: 0,
    pushTimer: 0,
    pushCooldown: 0,
    ollieLoad: -1,
    bailTimer: 0,
    onBoard: true,
    bearings: 12,
    maxBearings: 12,
    aiming: false,
    draw: 0,
    odometer: 0,
    lastSurface: 'asphalt',
    landedThisTick: false,
    bailedThisTick: false,
    pushedThisTick: false,
    poppedThisTick: false,
  };
}

export const maxSpeedFor = (p: PlayerState): number =>
  TUNE.maxSpeed + TUNE.flowSpeedBonus * p.flow;

export function updatePlayer(p: PlayerState, intent: Intent, world: World, dt: number): void {
  p.landedThisTick = false;
  p.bailedThisTick = false;
  p.pushedThisTick = false;
  p.poppedThisTick = false;

  if (p.stance === 'BAIL') {
    p.bailTimer -= dt;
    p.vel.x = damp(p.vel.x, 0, 0.12, dt);
    p.vel.y = damp(p.vel.y, 0, 0.12, dt);
    integrate(p, world, dt);
    p.flow = Math.max(0, p.flow - TUNE.flowFall * 2 * dt);
    if (p.bailTimer <= 0) p.stance = p.onBoard ? 'ROLL' : 'FOOT';
    p.speed = len(p.vel);
    return;
  }

  if (intent.toggleStance) {
    p.onBoard = !p.onBoard;
    p.stance = p.onBoard ? 'ROLL' : 'FOOT';
    if (!p.onBoard) { p.vel.x *= 0.3; p.vel.y *= 0.3; }
  }

  p.aiming = intent.aim && p.bearings > 0;
  p.draw = p.aiming ? clamp01(p.draw + dt / 0.55) : 0;

  if (!p.onBoard) { updateFoot(p, intent, world, dt); return; }

  const surf = SURFACE[world.surfaceAt(p.pos) as keyof typeof SURFACE] ?? SURFACE.asphalt;
  const speed = len(p.vel);
  const cap = maxSpeedFor(p);

  // --- steering ---------------------------------------------------------
  // Turning radius grows with speed. This single curve is the whole feel.
  let carveRate = remap(speed, 1.5, cap, TUNE.carveLow, TUNE.carveHigh);
  if (p.aiming) carveRate *= TUNE.carveAimPenalty;
  if (p.stance === 'AIR') carveRate *= 0.28;
  if (p.stance === 'SLIDE') carveRate = TUNE.slideSteer;
  p.heading = wrapAngle(p.heading + intent.steer * carveRate * dt);

  // --- slide ------------------------------------------------------------
  const wantSlide = intent.brake && speed > 3.2 && p.stance !== 'AIR';
  if (wantSlide && p.stance !== 'SLIDE') p.stance = 'SLIDE';
  else if (!wantSlide && p.stance === 'SLIDE') p.stance = 'ROLL';

  // --- push -------------------------------------------------------------
  p.pushCooldown = Math.max(0, p.pushCooldown - dt);
  p.pushTimer = Math.max(0, p.pushTimer - dt);
  if (intent.pushPressed && p.pushCooldown <= 0 && p.stance === 'ROLL') {
    // Cannot push past the cap: pushing is rhythm, not a throttle.
    const room = clamp01((cap - speed) / cap);
    const imp = TUNE.pushImpulse * room;
    if (imp > 0.05) {
      const h = fromAngle(p.heading, imp);
      p.vel.x += h.x;
      p.vel.y += h.y;
      p.pushCooldown = TUNE.pushCooldown;
      p.pushTimer = TUNE.pushDuration;
      p.pushedThisTick = true;
    }
  }

  // --- ollie ------------------------------------------------------------
  if (p.stance !== 'AIR') {
    if (intent.olliePressed) p.ollieLoad = 0;
    if (p.ollieLoad >= 0 && intent.ollieHeld) p.ollieLoad = Math.min(TUNE.ollieMaxLoad, p.ollieLoad + dt);
    if (p.ollieLoad >= 0 && (intent.ollieReleased || p.ollieLoad >= TUNE.ollieMaxLoad)) {
      const charge = clamp01(p.ollieLoad / TUNE.ollieMaxLoad);
      p.vz = TUNE.ollieImpulse * (0.7 + charge * 0.3);
      p.z = 0.001;
      p.stance = 'AIR';
      p.ollieLoad = -1;
      p.poppedThisTick = true;
    }
  }

  // --- terrain features -------------------------------------------------
  const feature = world.featureAt(p.pos);
  if (feature && p.stance !== 'AIR') {
    if (feature.kind === 'bank' || feature.kind === 'kicker') {
      const fdir = fromAngle(feature.facing);
      const alignment = clamp01(dot(norm(p.vel), fdir));
      if (alignment > 0.35 && speed > 3) {
        const boost = feature.boost * alignment * dt * 3.2;
        p.vel.x += fdir.x * boost;
        p.vel.y += fdir.y * boost;
        if (feature.kind === 'kicker' && speed > 5.5) {
          p.vz = Math.max(p.vz, 2.4 + speed * 0.17);
          p.z = Math.max(p.z, 0.001);
          p.stance = 'AIR';
        }
      }
    } else if (feature.kind === 'drop' && p.stance === 'ROLL') {
      p.vz = -0.2;
      p.z = Math.max(0.001, feature.rise);
      p.stance = 'AIR';
    }
  }

  // --- friction and grip ------------------------------------------------
  if (p.stance === 'AIR') {
    // No ground friction in the air; horizontal velocity is preserved.
  } else {
    let fric = surf.friction;
    if (p.stance === 'SLIDE') fric += TUNE.slideFriction;
    else if (intent.brake) fric += TUNE.brakeFriction;
    applyFriction(p, fric, dt);

    // Grip: shed lateral velocity rather than clamping it, so hard carves drift.
    const h = fromAngle(p.heading);
    const forward = dot(p.vel, h);
    const lat = { x: p.vel.x - h.x * forward, y: p.vel.y - h.y * forward };
    const grip = p.stance === 'SLIDE' ? 0.42 : TUNE.lateralGrip * surf.grip;
    const keep = Math.pow(1 - clamp01(grip), dt * 60);
    p.vel.x = h.x * forward + lat.x * keep;
    p.vel.y = h.y * forward + lat.y * keep;

    // Rolling backwards is not a thing on a skateboard.
    if (forward < -0.4) {
      p.vel.x = h.x * -0.4;
      p.vel.y = h.y * -0.4;
    }
  }

  // Speed cap.
  const s2 = len(p.vel);
  if (s2 > cap) {
    const k = cap / s2;
    p.vel.x *= k;
    p.vel.y *= k;
  }

  integrate(p, world, dt);
  updateFlow(p, intent, dt, cap);
  p.speed = len(p.vel);
}

function updateFoot(p: PlayerState, intent: Intent, world: World, dt: number): void {
  const target = fromAngle(p.heading, intent.push ? TUNE.footSpeed : 0);
  p.heading = wrapAngle(p.heading + intent.steer * 3.6 * dt);
  p.vel.x = damp(p.vel.x, target.x, 0.06, dt);
  p.vel.y = damp(p.vel.y, target.y, 0.06, dt);
  integrate(p, world, dt);
  p.flow = Math.max(0, p.flow - TUNE.flowFall * dt);
  p.speed = len(p.vel);
  p.stance = 'FOOT';
}

function applyFriction(p: PlayerState, a: number, dt: number): void {
  const s = len(p.vel);
  if (s < 1e-4) { p.vel.x = 0; p.vel.y = 0; return; }
  const ns = Math.max(0, s - a * dt);
  const k = ns / s;
  p.vel.x *= k;
  p.vel.y *= k;
}

function integrate(p: PlayerState, world: World, dt: number): void {
  if (p.stance === 'AIR') {
    p.vz -= TUNE.gravity * dt;
    p.z += p.vz * dt;
    if (p.z <= 0) {
      p.z = 0;
      p.vz = 0;
      p.stance = 'ROLL';
      p.landedThisTick = true;
      // A landing badly out of line with travel is a bail.
      const travel = angleOf(p.vel);
      const off = Math.abs(wrapAngle(travel - p.heading));
      if (len(p.vel) > 4.5 && off > (TUNE.landingToleranceDeg * Math.PI) / 180) {
        bail(p);
      }
    }
  }

  const from = { x: p.pos.x, y: p.pos.y };
  const to = { x: p.pos.x + p.vel.x * dt, y: p.pos.y + p.vel.y * dt };
  const resolved = p.z > 0.9 ? to : world.resolveCollision(from, to, 0.45);

  // If collision pushed us back hard while fast, that is a crash.
  const wanted = Math.hypot(to.x - from.x, to.y - from.y);
  const got = Math.hypot(resolved.x - from.x, resolved.y - from.y);
  if (wanted > 0.02 && got < wanted * 0.35 && len(p.vel) > TUNE.curbBailSpeed && p.stance !== 'BAIL') {
    bail(p);
  }

  p.pos = world.clampToBounds(resolved);
  p.odometer += got;
}

function bail(p: PlayerState): void {
  p.stance = 'BAIL';
  p.bailTimer = TUNE.bailTime;
  p.bailedThisTick = true;
  p.vel.x *= 0.25;
  p.vel.y *= 0.25;
  p.vz = 0;
  p.z = 0;
  p.flow = 0;
}

function updateFlow(p: PlayerState, intent: Intent, dt: number, cap: number): void {
  const fast = p.speed > cap * 0.6;
  const doing = Math.abs(intent.steer) > 0.2 || p.stance === 'AIR' || p.pushTimer > 0;
  if (fast && doing && p.stance !== 'BAIL') {
    p.flow = clamp01(p.flow + TUNE.flowRise * dt);
  } else if (fast) {
    p.flow = clamp01(p.flow + TUNE.flowRise * 0.35 * dt);
  } else {
    p.flow = clamp01(p.flow - TUNE.flowFall * dt);
  }
}

/** Heading of travel, falling back to board heading when stationary. */
export function travelAngle(p: PlayerState): number {
  return p.speed > 0.4 ? angleOf(p.vel) : p.heading;
}

/** Aim sway: high speed hurts, high flow helps. Skill is rewarded twice. */
export function aimSway(p: PlayerState): number {
  const speedTerm = remap(p.speed, 0, maxSpeedFor(p), 0, 0.085);
  return clamp(speedTerm * (1 - p.flow * 0.65), 0, 0.09);
}

export const TAU_CONST = TAU;
