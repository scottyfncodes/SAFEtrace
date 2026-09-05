/**
 * Ground units. They route along the road graph, which means they are fast on
 * the streets and useless off them. That asymmetry is the point.
 */
import { type Vec2, angleToward, dist, fromAngle } from '../core/math';
import type { World } from './world';
import type { Task } from './surveillance/types';

export type PatrolState = 'ROUTINE' | 'RESPONDING' | 'INTERVENING' | 'RETURNING';

export const PATROL = {
  /*
   * A person, running.
   *
   * These were 6.5 and 12.5 metres per second, which are a 23 km/h stroll and
   * a 45 km/h sprint. At that speed a responding unit was faster than the
   * player's top speed on a board, so once one was sent there was no escaping
   * it by skating — the only outcomes were being caught or the task timing
   * out, and both of those feel like the game deciding rather than the player.
   *
   * The hierarchy the chase needs is: a board beats running, running beats a
   * copper. So a routine beat is a walk and a response is a hard run, and both
   * are numbers a human body produces. The danger is not the speed. It is that
   * they take the roads, they cut the corners, they arrive from where you were
   * not looking, and they are still coming when you make a mistake.
   */
  routineSpeed: 2.9,
  respondSpeed: 4.6,
  turnRate: 2.2,
  contactRadius: 3.2,
  observeRadius: 26,
  observeHalfFov: 0.85,
};

export interface Patrol {
  id: string;
  pos: Vec2;
  heading: number;
  state: PatrolState;
  route: Vec2[];
  routeIndex: number;
  path: Vec2[];
  pathIndex: number;
  home: Vec2;
  task: Task | null;
  reason: string;
  /** Ticks spent within contact radius of the player; drives INTERVENTION. */
  contactTicks: number;
}

export function makePatrol(id: string, route: Vec2[], home: Vec2): Patrol {
  return {
    id,
    pos: { x: home.x, y: home.y },
    heading: 0,
    state: 'ROUTINE',
    route,
    routeIndex: 0,
    path: [],
    pathIndex: 0,
    home: { x: home.x, y: home.y },
    task: null,
    reason: 'ROUTINE PATROL',
    contactTicks: 0,
  };
}

export function assignPatrolTask(p: Patrol, task: Task | null, world: World): void {
  p.task = task;
  if (!task) {
    p.state = 'ROUTINE';
    p.path = [];
    p.reason = 'ROUTINE PATROL';
    return;
  }
  p.state = task.kind === 'TRACK' ? 'INTERVENING' : 'RESPONDING';
  p.reason = task.reason;
  routeTo(p, task.target, world);
}

export function routeTo(p: Patrol, target: Vec2, world: World): void {
  const from = world.nearestRoadNode(p.pos, 80);
  const to = world.nearestRoadNode(target, 80);
  if (from && to) {
    const pts = world.pathPoints(from.id, to.id);
    p.path = pts.length ? [...pts, target] : [target];
  } else {
    p.path = [target];
  }
  p.pathIndex = 0;
}

export function updatePatrol(p: Patrol, dt: number, world: World, liveTarget: Vec2 | null): void {
  // A tracking unit re-routes toward its target's current forecast.
  if (p.state === 'INTERVENING' && liveTarget) {
    if (p.path.length === 0 || dist(p.path[p.path.length - 1], liveTarget) > 18) {
      routeTo(p, liveTarget, world);
    }
  }

  let target: Vec2 | null = null;
  if (p.path.length > 0) {
    target = p.path[Math.min(p.pathIndex, p.path.length - 1)];
    if (dist(p.pos, target) < 3.5) {
      p.pathIndex++;
      if (p.pathIndex >= p.path.length) {
        p.path = [];
        if (p.state === 'RESPONDING') { p.state = 'ROUTINE'; p.task = null; p.reason = 'ROUTINE PATROL'; }
      }
    }
  } else if (p.route.length > 0) {
    target = p.route[p.routeIndex % p.route.length];
    if (dist(p.pos, target) < 4) p.routeIndex = (p.routeIndex + 1) % p.route.length;
  }

  if (!target) return;

  const want = Math.atan2(target.y - p.pos.y, target.x - p.pos.x);
  p.heading = angleToward(p.heading, want, PATROL.turnRate * dt);
  const speed = p.state === 'ROUTINE' ? PATROL.routineSpeed : PATROL.respondSpeed;
  const dir = fromAngle(p.heading);
  const step = Math.min(speed * dt, dist(p.pos, target));
  const to = { x: p.pos.x + dir.x * step, y: p.pos.y + dir.y * step };
  p.pos = world.resolveCollision(p.pos, to, 0.5);
}
