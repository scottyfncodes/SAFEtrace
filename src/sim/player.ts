/**
 * Skating. The game's primary instrument.
 *
 * Everything here is tuned against one test: a good player should be legible
 * to a spectator as good, purely from how they move down a street.
 */
import {
  type Vec2, angleOf, clamp, clamp01, damp, dot, fromAngle, len,
  norm, remap, wrapAngle,
} from '../core/math';
import type { Intent } from '../core/input';
import type { World } from './world';
import { SURFACE } from './world';

export type Stance = 'FOOT' | 'ROLL' | 'AIR' | 'SLIDE' | 'BAIL';

/**
 * How much this frame wants the board turned, -1..1.
 *
 * Two ways in, and they mean different things. A keyboard says "turn left" — a
 * rudder. A thumb on a stick says "go that way" — a direction. The second is
 * what a person means when they push a stick, and a human who had played twice
 * still called the rudder unintuitive, so a direction is translated into the
 * turn that heads there. Momentum is untouched: the carve curve still decides
 * how fast the board can answer, so at speed you still cannot spin on the spot.
 */
function steerOf(p: PlayerState, intent: Intent): number {
  const mv = intent.moveVector;
  if (!mv) return intent.steer;
  const mag = Math.hypot(mv.x, mv.y);
  if (mag <= TUNE.steerDead) return 0;

  /*
   * How far off the wanted heading we are, and how hard the thumb is asking.
   *
   * The second half of that used to be thrown away: the magnitude was measured
   * and then discarded, so a six-pixel nudge pointing ninety degrees off the
   * nose produced *full* deflection. That is the whole of why the board was
   * twitchy — there was no such thing as a small input.
   *
   * Authority rises as a smoothstep on the stick's own travel: gentle in the
   * first part of the throw, and everything by the time the thumb is out at
   * the edge. It used to carry an extra factor on top of that, a cubic that
   * held back most of the authority for the last third — which made the board
   * feel like it was ignoring you. Getting a board to come round is a wrist,
   * not a negotiation.
   */
  const throwT = clamp01((mag - TUNE.steerDead) / (1 - TUNE.steerDead));
  const authority = throwT * throwT * (3 - 2 * throwT);
  const off = wrapAngle(Math.atan2(mv.y, mv.x) - p.heading);
  return clamp(off / TUNE.headingBand, -1, 1) * authority;
}

export const TUNE = {
  footSpeed: 2.6,
  maxSpeed: 11.0,
  flowSpeedBonus: 2.5,
  pushImpulse: 3.1,
  pushCooldown: 0.42,
  pushDuration: 0.22,
  /**
   * The turn-rate ceiling, at a standstill and at full speed.
   *
   * This is the turning radius, and it was set for a board that felt heavy:
   * 0.82 rad/s at eleven metres a second is an arc thirteen metres across,
   * which is a car's turn, not a skater's. Raised, but not to a pivot — at
   * speed it is now about a nine-metre arc, which is a hard carve you have to
   * commit to and can still hold a line through.
   */
  carveLow: 2.9,
  carveHigh: 1.15,
  /**
   * The board leans into a turn and leans out of it. It does not snap.
   *
   * Setting the heading straight from the stick made a skateboard handle like
   * a radio-controlled car: point, and the whole thing pivots. Steering now
   * drives an angular *velocity* that has to be built up and bled off, which is
   * where the weight of the thing lives.
   */
  /**
   * The board is heavy. It takes a moment to come round and a moment to stop
   * coming round, and both of those moments are the feel of the thing.
   */
  turnAccel: 9.4,
  turnDamp: 6.4,
  /** Thumb travel below this is a resting hand, not a steering input. */
  steerDead: 0.10,
  /**
   * A board at walking pace is redirected by the foot that is pushing it, not
   * by wishing. Redirecting during a push is most of how a skater turns around
   * in a driveway, and it is coupled to an animation the player can see.
   */
  pushSteerBoost: 1.45,
  /** Visible body lean, radians at full carve. */
  leanMax: 0.42,
  /**
   * How far off the desired heading counts as full deflection.
   *
   * A wide band was the other half of the board feeling numb: at 1.30 rad you
   * had to point three quarters of a right angle away from the nose before the
   * stick was asking for a full carve, so ordinary steering lived in the
   * bottom third of the response. Narrower, and a thumb that points somewhere
   * gets a board that goes there — which is what a skateboard does, since the
   * thing turning it is a person's weight and it answers immediately.
   */
  headingBand: 0.80,
  carveAimPenalty: 0.65,
  /**
   * Drawing the sling settles the board.
   *
   * The first human to play could partly see what the slingshot was for but
   * could not land a shot, because aiming, steering and pushing were all being
   * asked of two thumbs at once. Pulling the pouch back now coasts you to a
   * stop over about a second, which separates EXPLORE from AIM without a mode
   * switch, a menu, or taking the board away.
   */
  aimSettleDecel: 7.0,
  /**
   * How fast sideways speed is scrubbed off, per frame at 60 Hz.
   *
   * At 0.86 the velocity snapped onto the heading inside a single frame, so
   * there was no arc to a turn and nothing to carry through it — the other half
   * of why this felt like an RC car. Lower, and the board holds a line through
   * the turn and washes out a little when you ask too much of it.
   */
  lateralGrip: 0.34,
  /**
   * Twice the apex it had: 0.41 m became 0.89 m at a normal tap. That clears a
   * kerb with room to watch it happen, and it still lands inside the same
   * landing-tolerance window, so nothing about bailing changed.
   */
  ollieImpulse: 6.6,
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
  /** How long an early press is remembered. Two thirds of a push cycle. */
  inputBuffer: 0.28,
};

/**
 * Six tricks, and each one is the real thing.
 *
 * A trick on a skateboard is the *board* doing something while the rider stays
 * over it — the deck flips or spins under the feet and is caught on the way
 * down. Spinning the whole character is a different trick entirely (that is a
 * 180, and it is not what any of these are), and it is the shortcut that makes
 * skating games look like they were made by somebody who has never stood on a
 * board. So each spec here is two numbers about the deck and nothing about the
 * rider: `flip` is rotations about the board's long axis, `shove` is rotations
 * about the vertical.
 *
 * Signs follow a regular stance, left foot forward:
 *   kickflip           the deck rolls toward the heel side, one full turn
 *   heelflip           the same turn the other way
 *   pop shove-it       the tail swings behind you, half a turn, deck flat
 *   frontside shove-it the same half turn in front of you
 *   varial flip        a kickflip and a pop shove-it at once
 *   360 shove-it       a full turn of the deck, flat, no flip
 */
export interface TrickSpec {
  name: string;
  /** Turns about the board's long axis. Negative rolls toward the heel edge. */
  flip: number;
  /** Turns about the vertical. Negative swings the tail backside. */
  shove: number;
  /** How long the board takes to come all the way round, in seconds. */
  duration: number;
}

export const TRICKS: readonly TrickSpec[] = [
  { name: 'KICKFLIP', flip: -1, shove: 0, duration: 0.42 },
  { name: 'HEELFLIP', flip: 1, shove: 0, duration: 0.42 },
  { name: 'POP SHOVE-IT', flip: 0, shove: -0.5, duration: 0.38 },
  { name: 'FRONTSIDE SHOVE-IT', flip: 0, shove: 0.5, duration: 0.38 },
  { name: 'VARIAL FLIP', flip: -1, shove: -0.5, duration: 0.46 },
  { name: '360 SHOVE-IT', flip: 0, shove: -1, duration: 0.52 },
];

/** A trick in progress, or the record of the one that just landed. */
export interface TrickState {
  spec: TrickSpec;
  /** Seconds elapsed. */
  t: number;
  /** 0..1 through the rotation; the renderer turns the deck by this. */
  phase: number;
  landed: boolean;
}

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
  /** Angular velocity of the board, radians per second. */
  turnRate: number;
  /** Visible lean, -1..1, following the turn under load. */
  lean: number;
  /** 0..1 through a push stride; drives the pushing leg. */
  pushPhase: number;
  /** Seconds left of absorbing a landing. */
  landTimer: number;
  /**
   * Compression, -1..1. Negative is crouched before a pop and on landing;
   * positive is the extension at the top of it. The renderer reads this rather
   * than guessing from height, so a pop looks like a pop rather than a hop.
   */
  crouch: number;
  bailTimer: number;
  onBoard: boolean;
  aiming: boolean;
  draw: number;
  /** Metres travelled; used only for telemetry and story pacing. */
  odometer: number;
  lastSurface: string;
  /**
   * An ollie asked for slightly too early is remembered, not thrown away.
   * Without this, pressing ollie a few frames before landing does nothing,
   * which reads as the control being broken rather than the player being early.
   */
  ollieBuffer: number;
  pushBuffer: number;
  /**
   * The trick the board is doing, if any. Set by the simulation, read by the
   * renderer, and cleared when the board is caught.
   */
  trick: TrickState | null;
  /** A trick asked for, waiting for a board to be under the feet. */
  trickRequest: TrickSpec | null;
  /** Rendering hooks. */
  landedThisTick: boolean;
  bailedThisTick: boolean;
  pushedThisTick: boolean;
  poppedThisTick: boolean;
  /** The trick that came all the way round this tick, if one did. */
  trickedThisTick: TrickSpec | null;
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
    turnRate: 0,
    lean: 0,
    pushPhase: 0,
    landTimer: 0,
    crouch: 0,
    bailTimer: 0,
    onBoard: true,
    aiming: false,
    draw: 0,
    odometer: 0,
    ollieBuffer: 0,
    pushBuffer: 0,
    lastSurface: 'asphalt',
    trick: null,
    trickRequest: null,
    landedThisTick: false,
    bailedThisTick: false,
    pushedThisTick: false,
    poppedThisTick: false,
    trickedThisTick: null,
  };
}

export const maxSpeedFor = (p: PlayerState): number =>
  TUNE.maxSpeed + TUNE.flowSpeedBonus * p.flow;

export function updatePlayer(p: PlayerState, intent: Intent, world: World, dt: number): void {
  p.landedThisTick = false;
  p.bailedThisTick = false;
  p.pushedThisTick = false;
  p.poppedThisTick = false;
  p.trickedThisTick = null;

  if (p.stance === 'BAIL') {
    p.bailTimer -= dt;
    // Whatever was asked for during a slam is not owed on the way up.
    p.trickRequest = null;
    // A bail costs speed and time, not agency. Leaving the player with no
    // steering at all reads as the game having stopped responding.
    p.heading = wrapAngle(p.heading + steerOf(p, intent) * 1.6 * dt);
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

  p.aiming = intent.aim;
  // A device with a continuous draw axis — a thumb pulling the pouch back —
  // sets the draw directly. Everything else loads it at the character's own
  // rate, which is what a key held down means.
  if (!p.aiming) p.draw = 0;
  else if (intent.drawAmount !== null) p.draw = clamp01(intent.drawAmount);
  else p.draw = clamp01(p.draw + dt / 0.55);

  if (!p.onBoard) { updateFoot(p, intent, world, dt); return; }

  const surf = SURFACE[world.surfaceAt(p.pos) as keyof typeof SURFACE] ?? SURFACE.asphalt;
  const speed = len(p.vel);
  const cap = maxSpeedFor(p);

  // --- steering ---------------------------------------------------------
  /*
   * Two ways in, and they mean different things.
   *
   * A keyboard says "turn left" — a rudder. A thumb says "go that way" — a
   * direction. The second is what a person means when they push a stick, and
   * a human who had played twice still described the rudder as "not intuitive",
   * so the stick now names a heading and the board turns toward it as fast as
   * a board can. Momentum is untouched: at speed you still cannot spin on the
   * spot, and that is the part worth keeping.
   */
  const steerInput = steerOf(p, intent);

  // Turning radius grows with speed. This single curve is the whole feel.
  let carveRate = remap(speed, 1.5, cap, TUNE.carveLow, TUNE.carveHigh);
  // Mid-push, the foot on the ground can point the board somewhere new. It is
  // the only way to turn sharply at walking pace, and you can see it happen.
  if (p.pushTimer > 0) carveRate *= TUNE.pushSteerBoost;
  if (p.aiming) carveRate *= TUNE.carveAimPenalty;
  if (p.stance === 'AIR') carveRate *= 0.28;
  if (p.stance === 'SLIDE') carveRate = TUNE.slideSteer;

  // The board has to be leaned into a turn and let out of it again.
  const wantTurn = steerInput * carveRate;
  const accel = Math.sign(wantTurn - p.turnRate) * TUNE.turnAccel * dt;
  p.turnRate += Math.abs(wantTurn - p.turnRate) < Math.abs(accel) ? wantTurn - p.turnRate : accel;
  if (Math.abs(steerInput) < 0.02) p.turnRate = damp(p.turnRate, 0, 1 / TUNE.turnDamp, dt);
  p.heading = wrapAngle(p.heading + p.turnRate * dt);

  // Lean follows the turn, loaded by speed. This is what the eye reads as carve.
  const loaded = clamp(p.turnRate / Math.max(0.001, TUNE.carveLow), -1, 1) * clamp01(speed / 4);
  p.lean = damp(p.lean, loaded, 0.09, dt);

  // --- slide ------------------------------------------------------------
  const wantSlide = intent.brake && speed > 3.2 && p.stance !== 'AIR';
  if (wantSlide && p.stance !== 'SLIDE') p.stance = 'SLIDE';
  else if (!wantSlide && p.stance === 'SLIDE') p.stance = 'ROLL';

  // --- the board settles under a draw ------------------------------------
  if (p.aiming && p.stance !== 'AIR') {
    const sp = len(p.vel);
    if (sp > 0.01) {
      const drop = Math.min(sp, TUNE.aimSettleDecel * clamp01(p.draw + 0.35) * dt);
      p.vel.x -= (p.vel.x / sp) * drop;
      p.vel.y -= (p.vel.y / sp) * drop;
    }
  }

  // --- push -------------------------------------------------------------
  p.pushCooldown = Math.max(0, p.pushCooldown - dt);
  p.pushTimer = Math.max(0, p.pushTimer - dt);
  // 0 at the start of a stride, 1 at the end. The renderer reads this rather
  // than a looping clock, so the leg only moves when a push is happening.
  p.pushPhase = p.pushTimer > 0 ? 1 - p.pushTimer / TUNE.pushDuration : 0;

  /*
   * The shape of a pop: knees fold as it is loaded, the body extends through
   * the rise, and the landing is absorbed rather than bounced. Driven from the
   * board's actual vertical state, so it cannot drift out of sync with it.
   */
  let wantCrouch = 0;
  if (p.ollieLoad >= 0) wantCrouch = -1;
  else if (p.stance === 'AIR') wantCrouch = p.vz > 0 ? clamp01(p.vz / 3) : -clamp01(-p.vz / 4) * 0.5;
  else if (p.landTimer > 0) wantCrouch = -clamp01(p.landTimer / 0.22);
  p.crouch = damp(p.crouch, wantCrouch, 0.045, dt);
  p.landTimer = Math.max(0, p.landTimer - dt);
  p.pushBuffer = intent.pushPressed ? TUNE.inputBuffer : Math.max(0, p.pushBuffer - dt);
  if (p.pushBuffer > 0 && p.pushCooldown <= 0 && p.stance === 'ROLL' && !p.aiming) {
    // Cannot push past the cap: pushing is rhythm, not a throttle.
    const room = clamp01((cap - speed) / cap);
    const imp = TUNE.pushImpulse * room;
    if (imp > 0.05) {
      const h = fromAngle(p.heading, imp);
      p.vel.x += h.x;
      p.vel.y += h.y;
      p.pushCooldown = TUNE.pushCooldown;
      p.pushTimer = TUNE.pushDuration;
      p.pushBuffer = 0;
      p.pushedThisTick = true;
    }
  }

  // --- ollie ------------------------------------------------------------
  if (intent.olliePressed) p.ollieBuffer = TUNE.inputBuffer;
  else p.ollieBuffer = Math.max(0, p.ollieBuffer - dt);

  if (p.stance !== 'AIR') {
    const pop = (charge: number) => {
      p.vz = TUNE.ollieImpulse * (0.7 + clamp01(charge) * 0.3);
      p.z = 0.001;
      p.stance = 'AIR';
      p.ollieLoad = -1;
      p.ollieBuffer = 0;
      p.poppedThisTick = true;
    };

    // Still holding: load the pop, and let go when they do.
    if (p.ollieBuffer > 0 && p.ollieLoad < 0 && intent.ollieHeld) {
      p.ollieLoad = 0;
      p.ollieBuffer = 0;
    }
    if (p.ollieLoad >= 0 && intent.ollieHeld) {
      p.ollieLoad = Math.min(TUNE.ollieMaxLoad, p.ollieLoad + dt);
    }

    if (p.ollieLoad >= 0 && (intent.ollieReleased || p.ollieLoad >= TUNE.ollieMaxLoad)) {
      pop(p.ollieLoad / TUNE.ollieMaxLoad);
    } else if (p.ollieBuffer > 0 && p.ollieLoad < 0) {
      // Asked for and released while there was no ground to push against.
      // Honour it the instant there is, rather than making them ask twice.
      pop(0.75);
    }
  }

  // --- tricks -----------------------------------------------------------
  /*
   * One button, one motion.
   *
   * A trick needs air under the board, and asking a player to pop and then
   * flick in the right window is asking them to learn two controls to express
   * one intention. So a trick asked for on the ground pops first and starts
   * the rotation on the way up, exactly as it is one movement under a foot.
   * Asked for while already airborne, it starts immediately — which is how a
   * kicker or a drop turns into a trick.
   */
  if (p.trickRequest && p.onBoard && !p.aiming) {
    if (p.stance !== 'AIR') {
      p.vz = TUNE.ollieImpulse * 0.94;
      p.z = 0.001;
      p.stance = 'AIR';
      p.ollieLoad = -1;
      p.ollieBuffer = 0;
      p.poppedThisTick = true;
    }
    if (!p.trick) p.trick = { spec: p.trickRequest, t: 0, phase: 0, landed: false };
  }
  p.trickRequest = null;

  if (p.trick && !p.trick.landed) {
    p.trick.t += dt;
    p.trick.phase = clamp01(p.trick.t / p.trick.spec.duration);
    if (p.trick.phase >= 1) {
      // Caught: the board is back under the feet and the rider rides it down.
      p.trick.landed = true;
      p.trickedThisTick = p.trick.spec;
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
  // On foot there is no momentum to respect, so a stick points and you go.
  p.heading = wrapAngle(p.heading + steerOf(p, intent) * 3.6 * dt);
  p.vel.x = damp(p.vel.x, target.x, 0.06, dt);
  p.vel.y = damp(p.vel.y, target.y, 0.06, dt);
  integrate(p, world, dt);
  p.flow = Math.max(0, p.flow - TUNE.flowFall * dt);
  p.speed = len(p.vel);
  p.stance = 'FOOT';
  p.trickRequest = null;
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
      p.landTimer = 0.22;
      /*
       * Landing on a board that is still turning is landing on your ankle.
       * There is no forgiveness window here because the physics already
       * supplies one: a pop gives about a second and a third of air and the
       * longest trick takes half of it, so this only catches a trick asked
       * for on the way down.
       */
      if (p.trick && !p.trick.landed) {
        p.trick = null;
        bail(p);
      }
      p.trick = null;
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
  // Board deck rides a little above the wheels, so a clean ollie clears a
  // ledge the same height as the pop.
  const resolved = world.resolveCollision(from, to, 0.45, p.z + 0.14);

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
  p.trick = null;
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
  const doing = Math.abs(steerOf(p, intent)) > 0.2 || p.stance === 'AIR' || p.pushTimer > 0;
  if (fast && doing && p.stance !== 'BAIL') {
    p.flow = clamp01(p.flow + TUNE.flowRise * dt);
  } else if (fast) {
    p.flow = clamp01(p.flow + TUNE.flowRise * 0.35 * dt);
  } else {
    p.flow = clamp01(p.flow - TUNE.flowFall * dt);
  }
}

/**
 * Aim sway, in radians.
 *
 * Speed hurts and flow helps, so a player who is skating well is *more*
 * accurate at speed than one who is merely fast. Skill is rewarded twice, and
 * the reward points at the same behaviour the surveillance model finds hardest
 * to predict.
 */
export function aimSway(p: PlayerState): number {
  const speedTerm = remap(p.speed, 0, maxSpeedFor(p), 0, 0.085);
  return clamp(speedTerm * (1 - p.flow * 0.65), 0, 0.09);
}
