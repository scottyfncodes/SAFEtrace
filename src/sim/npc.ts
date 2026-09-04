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
    });
  }
  return out;
}

export function updateNpc(n: Npc, dt: number, world: World, rng: Rng): void {
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
