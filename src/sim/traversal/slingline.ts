/**
 * The sling line: the slingshot, the other way round.
 *
 * The sling has always thrown a stone. Hook its band over a pole instead and
 * the rider is the stone. The line goes taut, the board is swung round the
 * anchor on the end of it, the band is reeled in as it goes — and a skater
 * pulled in on a line spins up, exactly as a skater pulling their arms in
 * does, because angular momentum is conserved. Let go and the board leaves
 * along the tangent, faster than it arrived and up into the air, as high as
 * the swing earned.
 *
 * What the swing earns is `charge`, and it is nothing but the arc: a flick
 * past a pole is a small hop and a little speed; a committed quarter-turn
 * round it is a launch that clears the thing you swung round. Nothing about
 * it is a timing minigame — you can see the arc, and the arc is the charge.
 *
 * None of this touches how the board skates. The skating model runs exactly
 * as it always did, and the line is a constraint laid over the top of it:
 * after the board has moved, the line takes away whatever would have
 * stretched it, and gives back whatever reeling in adds.
 */
import { type Vec2, angleOf, clamp01, dist, dot, fromAngle, len, lerp, wrapAngle } from '../../core/math';
import { TUNE, type PlayerState } from '../player';
import type { World } from '../world';
import type { Anchor } from './anchors';

export const LINE = {
  /** How far away an anchor can be hooked, horizontally, metres. */
  range: 19,
  /** Masts stand in the middle of roofs; they are reached for from further off. */
  mastRange: 27,
  /** Closer than this there is nothing to swing round. */
  minRange: 1.8,
  /**
   * How far off the line of travel an anchor may be, either side.
   * Wide on purpose: the best swings are round something beside you.
   */
  coneHalf: 1.95,
  /** Reel-in rate while hooked, metres a second. */
  reel: 2.6,
  /** The line never reels shorter than this. */
  minLen: 3.0,
  /** The band's own pull along the swing, m/s². Gives a slow hook somewhere to go. */
  pump: 4.0,
  /** Never swung faster than this, m/s. */
  maxSwingSpeed: 21,
  /** A rider hooked at walking pace is yanked toward the anchor at this, m/s². */
  yank: 11,
  /** Below this speed the yank applies, m/s. */
  yankBelow: 5,
  /** How much of the rider's weight a line from above takes, in the air. */
  carry: 0.55,
  /** This much arc, radians, is a full charge: a quarter-turn round the anchor. */
  fullCharge: Math.PI * 0.5,
  /** The band lets go on its own past this much arc, or this long held. */
  maxSweep: Math.PI * 2.2,
  maxHold: 3.4,
  /** Extra speed along the tangent at full charge, m/s. */
  launchBoost: 4.6,
  /** How far over the anchor's own height a full-charge launch carries, metres. */
  liftOver: 1.4,
  /** A flick off the line, at no charge at all, is still a hop. vz, m/s. */
  minLift: 4.2,
  /** The same anchor cannot be hooked again for this long, seconds. */
  reuseCooldown: 1.1,
  /** How fast speed over the board's own cap bleeds off once rolling, m/s². */
  boostDecay: 3.2,
  /** A mast reels the rider up the side of its building at this, m/s. */
  zipClimb: 13,
  /** ...and across the roof edge at this once clear of it, m/s. */
  zipAcross: 9,
  /** Seconds of zip that make a full charge. */
  zipCharge: 0.5,
};

export interface SlingLine {
  anchor: Anchor;
  /** Arc that makes a full charge on this line, radians. */
  full: number;
  /** Current rope length, horizontal, metres. */
  len: number;
  /** Arc swept round the anchor so far, radians, unsigned. */
  swept: number;
  /** Seconds hooked. */
  t: number;
  /** Bearing from the anchor to the rider last tick. */
  lastBearing: number;
}

export interface LineRelease {
  anchor: Anchor;
  charge: number;
  speed: number;
  vz: number;
  /** True when the band let go on its own rather than the player letting go. */
  snapped: boolean;
}

/** Which way the rider is going, or facing if they are not going anywhere. */
function travelDir(p: PlayerState): number {
  return p.speed > 1.5 ? angleOf(p.vel) : p.heading;
}

/** Can this anchor be hooked from where the rider is? */
export function canHook(p: PlayerState, a: Anchor, world: World, reach = 1): boolean {
  const d = dist(p.pos, a.pos);
  const range = (a.kind === 'mast' ? LINE.mastRange : LINE.range) * reach;
  if (d < LINE.minRange || d > range) return false;
  // Hooked from above is not hooked: a line has to pull up as well as round.
  if (a.z < p.z + 1.2) return false;
  const off = Math.abs(wrapAngle(angleOf({ x: a.pos.x - p.pos.x, y: a.pos.y - p.pos.y }) - travelDir(p)));
  if (off > LINE.coneHalf) return false;
  if (a.kind === 'mast') {
    // Already on that roof: there is nowhere for it to take you.
    const roof = roofOf(a, world);
    if (!roof || pointInRoof(roof, p.pos)) return false;
    // The band goes up over the parapet: what has to be clear is the way to
    // the foot of the wall, not the way through the building to the mast.
    const edge = nearestOnPoly(roof.poly, p.pos);
    const short = { x: edge.x + (p.pos.x - edge.x) * 0.06, y: edge.y + (p.pos.y - edge.y) * 0.06 };
    return !world.blocked(p.pos, short, p.z + 1.5);
  }
  // The band has to be able to reach it: nothing solid in the way at the
  // height the line runs at.
  return !world.blocked(p.pos, a.pos, Math.min(a.z, p.z + 4));
}

const roofOf = (a: Anchor, world: World) => world.data.buildings.find((b) => b.id === a.buildingId) ?? null;
const pointInRoof = (b: { poly: Vec2[] }, p: Vec2): boolean => {
  let inside = false;
  for (let i = 0, j = b.poly.length - 1; i < b.poly.length; j = i++) {
    const u = b.poly[i], v = b.poly[j];
    if ((u.y > p.y) !== (v.y > p.y) && p.x < u.x + ((p.y - u.y) / (v.y - u.y)) * (v.x - u.x)) inside = !inside;
  }
  return inside;
};
function nearestOnPoly(poly: Vec2[], p: Vec2): Vec2 {
  let best = poly[0], bd = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2);
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = dist(q, p);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/**
 * The anchor a hook would catch right now, if any.
 *
 * Nearest wins, with a lean toward the ones ahead, so the anchor the HUD
 * brackets is the one the player was already looking at. An anchor just let
 * go of is skipped, so a chain goes somewhere new.
 */
export function pickAnchor(
  p: PlayerState, anchors: readonly Anchor[], world: World, skip: string | null = null, reach = 1,
): Anchor | null {
  if (!p.onBoard || p.stance === 'BAIL' || p.stance === 'FOOT') return null;
  const dir = travelDir(p);
  let best: Anchor | null = null;
  let bestScore = Infinity;
  for (const a of anchors) {
    if (a.id === skip) continue;
    const dx = a.pos.x - p.pos.x, dy = a.pos.y - p.pos.y;
    // Cheap reject before the occlusion test.
    if (Math.abs(dx) > LINE.mastRange * reach || Math.abs(dy) > LINE.mastRange * reach) continue;
    const d = Math.hypot(dx, dy);
    const off = Math.abs(wrapAngle(Math.atan2(dy, dx) - dir));
    const score = d * (1 + 0.45 * off);
    if (score >= bestScore) continue;
    if (!canHook(p, a, world, reach)) continue;
    best = a;
    bestScore = score;
  }
  return best;
}

export function hook(p: PlayerState, a: Anchor, chargeArc = 1): SlingLine {
  const d = dist(p.pos, a.pos);
  return {
    anchor: a,
    full: LINE.fullCharge * chargeArc,
    // Taut from the first frame, a touch shorter than the gap, so a hook
    // always takes up the slack at once and is felt.
    len: Math.max(LINE.minLen, d * 0.96),
    swept: 0,
    t: 0,
    lastBearing: Math.atan2(p.pos.y - a.pos.y, p.pos.x - a.pos.x),
  };
}

/** 0..1: how much of a full launch the arc so far has earned. */
export const lineCharge = (l: SlingLine): number => clamp01(l.swept / l.full);

/** The speed over the board's own cap the rider is carrying, kept for the cap. */
function holdBoost(p: PlayerState): void {
  const own = TUNE.maxSpeed + TUNE.flowSpeedBonus * p.flow;
  p.capBoost = Math.max(p.capBoost, len(p.vel) - own + 0.05, 0);
}

/**
 * Lay the line over a step the skating model has already taken.
 *
 * Returns 'snap' when the band lets go on its own — too much arc, too long,
 * or the rider was stopped against something.
 */
export function stepLine(p: PlayerState, l: SlingLine, world: World, dt: number): 'hold' | 'snap' | 'arrive' {
  if (p.stance === 'BAIL' || !p.onBoard) return 'snap';
  const a = l.anchor;
  l.t += dt;
  if (a.kind === 'mast') return zip(p, l, world, dt);

  let rx = p.pos.x - a.pos.x, ry = p.pos.y - a.pos.y;
  let d = Math.hypot(rx, ry);
  // The reel takes up slack as it comes: riding in toward the anchor shortens
  // the line, so it catches at the closest pass and the swing is tight.
  l.len = Math.max(LINE.minLen, Math.min(l.len - LINE.reel * dt, d));
  if (d < 1e-3) { rx = 1; ry = 0; d = 1; }
  const n = { x: rx / d, y: ry / d };
  const t = { x: -n.y, y: n.x };
  let vr = dot(p.vel, n);
  let vt = dot(p.vel, t);

  // A slow hook: the band yanks the rider toward the anchor, and they go past it.
  if (len(p.vel) < LINE.yankBelow) {
    vr -= LINE.yank * dt;
    // Round the side they were already favouring, or the left if nothing.
    vt += (vt >= 0 ? 1 : -1) * LINE.yank * 0.6 * dt;
  }

  if (d >= l.len) {
    // Taut. Nothing outward survives, and the rider is on the circle.
    if (vr > 0) vr = 0;
    // Reeled in: the same angular momentum on a shorter radius is a faster spin.
    vt *= Math.min(1.08, d / l.len);
    const target = { x: a.pos.x + n.x * l.len, y: a.pos.y + n.y * l.len };
    const resolved = world.resolveCollision(p.pos, target, 0.45, p.z + 0.14);
    // Pulled into a wall: the band slips off rather than dragging through it.
    if (dist(resolved, target) > 0.3) return 'snap';
    p.pos = world.clampToBounds(resolved);
  }

  // The band pulls along the swing.
  const s = Math.sign(vt) || 1;
  vt += s * LINE.pump * dt;
  if (Math.abs(vt) > LINE.maxSwingSpeed) vt = s * LINE.maxSwingSpeed;
  p.vel = { x: n.x * vr + t.x * vt, y: n.y * vr + t.y * vt };
  p.speed = len(p.vel);
  // The board points where it is going: carving round the anchor on the line.
  if (p.speed > 0.5) p.heading = angleOf(p.vel);
  p.turnRate = 0;

  // In the air, a line from above takes some of the weight.
  if (p.stance === 'AIR' && a.z > p.z) p.vz += TUNE.gravity * LINE.carry * dt;

  const bearing = Math.atan2(p.pos.y - a.pos.y, p.pos.x - a.pos.x);
  l.swept += Math.abs(wrapAngle(bearing - l.lastBearing));
  l.lastBearing = bearing;

  // Swinging is skating well: flow rises the way it does on a good line.
  p.flow = clamp01(p.flow + TUNE.flowRise * dt);
  holdBoost(p);

  if (l.swept > LINE.maxSweep || l.t > LINE.maxHold) return 'snap';
  return 'hold';
}

/**
 * A mast does not swing you round it — its building is in the way. It reels
 * you up the side instead: straight up the wall until the board is over the
 * parapet, then in across the roof. Arriving over the roof lets go on its own
 * and sets the board down; letting go early is a leap from wherever the band
 * had got you to, which is either a very good line or a wall.
 */
function zip(p: PlayerState, l: SlingLine, world: World, dt: number): 'hold' | 'snap' | 'arrive' {
  const roof = roofOf(l.anchor, world);
  if (!roof) return 'snap';
  const h = roof.height;
  if (p.stance !== 'AIR') { p.stance = 'AIR'; p.z += 0.001; p.ollieLoad = -1; }
  const edge = nearestOnPoly(roof.poly, p.pos);
  const inside = pointInRoof(roof, p.pos);
  const clear = p.z > h + 0.35;
  const toMast = { x: l.anchor.pos.x - p.pos.x, y: l.anchor.pos.y - p.pos.y };
  const dm = Math.hypot(toMast.x, toMast.y) || 1;
  // Up first. Across only once the board is over the parapet, and slowing
  // toward the wall until then so the reel never drags anybody into it.
  const across = clear ? LINE.zipAcross : Math.max(0, dist(edge, p.pos) - 1.2) * 2.5;
  const want = { x: (toMast.x / dm) * across, y: (toMast.y / dm) * across, z: clear ? 1.5 : LINE.zipClimb };
  const k = 1 - Math.exp(-dt * 7);
  p.vel = { x: lerp(p.vel.x, want.x, k), y: lerp(p.vel.y, want.y, k) };
  p.vz = lerp(p.vz, want.z, k) + TUNE.gravity * dt;
  p.speed = len(p.vel);
  if (p.speed > 0.5) p.heading = angleOf(p.vel);
  p.turnRate = 0;
  l.swept = Math.min(l.full, l.swept + (l.full / LINE.zipCharge) * dt);
  p.flow = clamp01(p.flow + TUNE.flowRise * dt);
  holdBoost(p);
  if (inside && clear && dist(edge, p.pos) > 1.0) return 'arrive';
  if (l.t > LINE.maxHold) return 'snap';
  return 'hold';
}

/**
 * Over a roof on the end of a mast's line: the band lets go and the board is
 * set down, rolling the way the reel was carrying it.
 */
export function arrive(p: PlayerState, l: SlingLine): LineRelease {
  const sp = Math.min(len(p.vel), LINE.zipAcross);
  const dir = sp > 0.3 ? angleOf(p.vel) : p.heading;
  p.vel = fromAngle(dir, Math.max(4, sp));
  p.heading = dir;
  p.speed = len(p.vel);
  p.vz = 2.5;
  holdBoost(p);
  return { anchor: l.anchor, charge: 1, speed: p.speed, vz: p.vz, snapped: false };
}

/**
 * Let go. The rider leaves along the tangent, with the arc's charge turned
 * into speed and height. A full charge clears the anchor it was swung round.
 */
export function release(p: PlayerState, l: SlingLine, snapped = false): LineRelease {
  const charge = lineCharge(l);
  const a = l.anchor;
  const sp = len(p.vel);
  const dir = sp > 0.3 ? angleOf(p.vel) : p.heading;
  const out = Math.min(LINE.maxSwingSpeed + LINE.launchBoost, sp + LINE.launchBoost * charge);
  const v = fromAngle(dir, out);
  p.vel = { x: v.x, y: v.y };
  p.heading = dir;
  p.speed = out;

  const rise = Math.max(0, a.z + LINE.liftOver - p.z);
  const vzFull = Math.sqrt(2 * TUNE.gravity * rise);
  const vz = lerp(LINE.minLift, Math.max(LINE.minLift, vzFull), charge);
  p.vz = Math.max(p.vz, vz);
  if (p.stance !== 'AIR') {
    p.z += 0.001;
    p.stance = 'AIR';
    p.poppedThisTick = true;
  }
  p.ollieLoad = -1;
  p.crouch = Math.min(p.crouch, -0.6);
  holdBoost(p);
  return { anchor: a, charge, speed: out, vz: p.vz, snapped };
}

/** Speed over the cap bleeds away once the wheels are down. */
export function bleedBoost(p: PlayerState, dt: number): void {
  if (p.capBoost <= 0 || p.stance === 'AIR') return;
  p.capBoost = Math.max(0, p.capBoost - LINE.boostDecay * dt);
}

/** For the HUD and tests: where the band meets the anchor. */
export const hookPoint = (a: Anchor): { x: number; y: number; z: number } => ({ x: a.pos.x, y: a.pos.y, z: a.z });

export type { Vec2 };
