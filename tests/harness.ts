/**
 * Headless simulation harness. The sim is pure, so it steps without a canvas,
 * which is what makes emergent surveillance behaviour testable at all.
 */
import { buildBellhaven } from '../src/content/bellhaven';
import { Sim } from '../src/sim/sim';
import { emptyIntent, type Intent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import type { Vec2 } from '../src/core/math';
import { LAUNCH_Z } from '../src/sim/slingshot';

export function makeSim(seed = 0x5afe7ace): Sim {
  return new Sim(buildBellhaven(), { seed });
}

/**
 * A sim in the state the investigation actually happens in.
 *
 * Nothing reaches into the network until VISION is unlocked — before that the
 * town is just a town, which is what the opening is for. Tests that exercise
 * hacking are testing the back half of the game and have to say so.
 */
export function makeUnlockedSim(seed = 0x5afe7ace): Sim {
  const sim = makeSim(seed);
  sim.unlockVision();
  return sim;
}

export function step(sim: Sim, seconds: number, intent: Intent = emptyIntent(), pointer: Vec2 | null = null): void {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) sim.step(TICK_DT, intent, pointer);
}

export function place(sim: Sim, p: Vec2, vel: Vec2 = { x: 0, y: 0 }): void {
  sim.player.pos = { x: p.x, y: p.y };
  sim.player.vel = { x: vel.x, y: vel.y };
  sim.player.speed = Math.hypot(vel.x, vel.y);
  // Point the board where it is travelling. Without this the next landing is a
  // bail, because the board is sideways to the direction of travel.
  if (sim.player.speed > 0.1) sim.player.heading = Math.atan2(vel.y, vel.x);
  sim.playerSubject.pos = sim.player.pos;
  sim.playerSubject.vel = sim.player.vel;
  sim.playerSubject.speed = sim.player.speed;
}

/** A fixed point, or a live one: a drone does not wait to be aimed at. */
type Aim = Vec2 | (() => Vec2);
type Height = number | (() => number);

/**
 * Put the sight on a point in the world.
 *
 * Aiming is entirely manual: the sim bends nothing toward anything. A bearing
 * goes where the player is looking, and where they are looking is a direction
 * *and* an elevation — so a test that only names an XY on the ground is not
 * aiming at a camera four metres up, it is aiming at the pavement below it.
 * This sets the elevation and returns the point the pointer path wants.
 */
export function look(sim: Sim, at: Aim, z: Height = 0, offsetDeg = 0): Vec2 {
  const p = typeof at === 'function' ? at() : at;
  const h = typeof z === 'function' ? z() : z;
  const rel = { x: p.x - sim.player.pos.x, y: p.y - sim.player.pos.y };
  const flat = Math.max(Math.hypot(rel.x, rel.y), 0.5);
  const yaw = Math.atan2(rel.y, rel.x) + (offsetDeg * Math.PI) / 180;
  sim.lookPitch = Math.atan2(h - LAUNCH_Z, flat);
  return { x: sim.player.pos.x + Math.cos(yaw) * flat, y: sim.player.pos.y + Math.sin(yaw) * flat };
}

/** Aim at a point at a given height, draw fully, release, and let it land. */
export function shootAt(sim: Sim, at: Aim, z: Height = 0, offsetDeg = 0, draw = 1): void {
  for (let i = 0; i < 40; i++) {
    const it = emptyIntent();
    it.aim = true;
    if (draw < 1) it.drawAmount = draw;
    sim.step(TICK_DT, it, look(sim, at, z, offsetDeg));
  }
  const f = emptyIntent();
  f.aim = true;
  f.fire = true;
  f.firePressed = true;
  if (draw < 1) f.drawAmount = draw;
  sim.step(TICK_DT, f, look(sim, at, z, offsetDeg));
  for (let i = 0; i < 300 && sim.projectiles.length > 0; i++) {
    sim.step(TICK_DT, emptyIntent(), null);
  }
  sim.lookPitch = 0.06;
}

/**
 * Reach for whatever is in range, the way a player does.
 *
 * Nothing opens on proximity any more, so a test that wants a node on screen
 * has to press the same button a person would. Returns whether anything was
 * actually in reach to take.
 */
export function interact(sim: Sim): boolean {
  const it = emptyIntent();
  it.interactPressed = true;
  sim.step(TICK_DT, it, null);
  return sim.focusNode !== null;
}

/** Drive the player straight, as if holding push. */
export function skate(sim: Sim, seconds: number, steer = 0): void {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    const intent = emptyIntent();
    intent.steer = steer;
    intent.push = true;
    intent.pushPressed = i % 26 === 0;
    sim.step(TICK_DT, intent, null);
  }
}

/** A state hash for determinism checks. */
export function hashState(sim: Sim): string {
  const parts: number[] = [
    sim.tick,
    r(sim.player.pos.x), r(sim.player.pos.y),
    r(sim.player.vel.x), r(sim.player.vel.y),
    r(sim.player.heading), r(sim.player.flow),
    r(sim.playerTrack.risk.total), r(sim.playerTrack.confidence),
    r(sim.playerTrack.predictionError),
    sim.evidence.size, sim.projectiles.length,
  ];
  for (const d of sim.drones) parts.push(r(d.pos.x), r(d.pos.y), r(d.z));
  for (const p of sim.patrols) parts.push(r(p.pos.x), r(p.pos.y));
  for (const n of sim.npcs) parts.push(r(n.pos.x), r(n.pos.y));
  for (const t of sim.allTracks) parts.push(r(t.estimate.x), r(t.estimate.y), r(t.risk.total));
  return parts.join('|');
}

const r = (v: number): number => Math.round(v * 1e6) / 1e6;
