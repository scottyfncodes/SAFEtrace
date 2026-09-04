/**
 * Headless simulation harness. The sim is pure, so it steps without a canvas,
 * which is what makes emergent surveillance behaviour testable at all.
 */
import { buildBellhaven } from '../src/content/bellhaven';
import { Sim } from '../src/sim/sim';
import { emptyIntent, type Intent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import type { Vec2 } from '../src/core/math';

export function makeSim(seed = 0x5afe7ace): Sim {
  return new Sim(buildBellhaven(), { seed });
}

export function step(sim: Sim, seconds: number, intent: Intent = emptyIntent(), pointer: Vec2 | null = null): void {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) sim.step(TICK_DT, intent, pointer);
}

export function place(sim: Sim, p: Vec2, vel: Vec2 = { x: 0, y: 0 }): void {
  sim.player.pos = { x: p.x, y: p.y };
  sim.player.vel = { x: vel.x, y: vel.y };
  sim.player.speed = Math.hypot(vel.x, vel.y);
  sim.playerSubject.pos = sim.player.pos;
  sim.playerSubject.vel = sim.player.vel;
  sim.playerSubject.speed = sim.player.speed;
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
