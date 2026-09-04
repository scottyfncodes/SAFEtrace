/**
 * Ambient residents. They are tracked subjects too, which is the quiet point:
 * in machine vision, a person walking a dog has a bracket and a number.
 */
import { type Vec2, angleToward, dist, fromAngle } from '../core/math';
import type { Rng } from '../core/rng';
import type { World } from './world';

export interface Npc {
  id: string;
  name: string;
  pos: Vec2;
  heading: number;
  speed: number;
  route: Vec2[];
  routeIndex: number;
  waitTicks: number;
  tint: string;
  kind: 'adult' | 'child' | 'dogWalker' | 'jogger';
  /**
   * Ticks left of being startled. A person who has just been hit by a ball
   * bearing, or who watched it happen, stops doing what they were doing.
   */
  startled: number;
  /** Where they are looking while startled — at whoever did it. */
  lookAt: Vec2 | null;
  /** Ticks left of walking away from it, fast, once the staring is over. */
  fleeing: number;
}

const NAMES = [
  'HALVORSEN, R.', 'PARK, J.', 'OKONJO, M.', 'DIAZ, C.', 'BRENNAN, T.',
  'SATO, K.', 'WHITFIELD, A.', 'NGUYEN, L.', 'ADEYEMI, F.', 'KOWALSKI, P.',
  'RIVERA, D.', 'HOLT, S.', 'MUKHERJEE, A.', 'FLORES, B.', 'GRANT, E.',
  'IVANOV, N.', 'CHEN, W.', 'ABRAHAM, Y.',
];

const TINTS = ['#D96C5F', '#4E7FA8', '#E0A83D', '#6FA36B', '#8C6BB1', '#C9576F', '#4FA39B'];

export function makeNpcs(routes: Vec2[][], rng: Rng): Npc[] {
  const out: Npc[] = [];
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    if (route.length < 2) continue;
    const kind = rng.pick(['adult', 'adult', 'child', 'dogWalker', 'jogger'] as const);
    out.push({
      id: `NPC-${i.toString().padStart(2, '0')}`,
      name: NAMES[i % NAMES.length],
      pos: { x: route[0].x, y: route[0].y },
      heading: 0,
      speed: kind === 'jogger' ? 3.1 : kind === 'child' ? 1.5 : 1.25,
      route,
      routeIndex: 1,
      waitTicks: rng.int(0, 180),
      tint: TINTS[i % TINTS.length],
      kind,
      startled: 0,
      lookAt: null,
      fleeing: 0,
    });
  }
  return out;
}

/**
 * Somebody has just had a ball bearing bounce off them, or watched it happen
 * to the person next to them. They stop, and they look at whoever did it.
 */
export function startle(n: Npc, at: Vec2, ticks: number): void {
  n.startled = Math.max(n.startled, ticks);
  n.lookAt = { x: at.x, y: at.y };
  n.waitTicks = 0;
}

export function updateNpc(n: Npc, dt: number, world: World, rng: Rng): void {
  if (n.startled > 0) {
    // Rooted to the spot, turned toward it. This is the beat where the player
    // finds out that nothing happened to them and everything happened to you.
    n.startled--;
    if (n.lookAt) {
      const want = Math.atan2(n.lookAt.y - n.pos.y, n.lookAt.x - n.pos.x);
      n.heading = angleToward(n.heading, want, 5.0 * dt);
    }
    if (n.startled === 0) n.fleeing = 60 * 9;
    return;
  }
  if (n.fleeing > 0) {
    // Then they leave, quickly, the way they came.
    n.fleeing--;
    const away = n.lookAt
      ? Math.atan2(n.pos.y - n.lookAt.y, n.pos.x - n.lookAt.x)
      : n.heading;
    n.heading = angleToward(n.heading, away, 3.0 * dt);
    const dir = fromAngle(n.heading);
    const step = n.speed * 1.9 * dt;
    n.pos = world.resolveCollision(n.pos, { x: n.pos.x + dir.x * step, y: n.pos.y + dir.y * step }, 0.35);
    if (n.fleeing === 0) n.lookAt = null;
    return;
  }

  if (n.waitTicks > 0) { n.waitTicks--; return; }
  const target = n.route[n.routeIndex % n.route.length];
  const want = Math.atan2(target.y - n.pos.y, target.x - n.pos.x);
  n.heading = angleToward(n.heading, want, 2.4 * dt);
  const dir = fromAngle(n.heading);
  const step = Math.min(n.speed * dt, dist(n.pos, target));
  n.pos = world.resolveCollision(n.pos, { x: n.pos.x + dir.x * step, y: n.pos.y + dir.y * step }, 0.35);
  if (dist(n.pos, target) < 1.6) {
    n.routeIndex = (n.routeIndex + 1) % n.route.length;
    if (rng.chance(0.25)) n.waitTicks = rng.int(60, 300);
  }
}
