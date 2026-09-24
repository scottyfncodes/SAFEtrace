/**
 * Named people, moving.
 *
 * Deliberately simpler than the ambient residents: a person walks their loop,
 * pauses where a person would pause, and stops to face you while you are
 * talking to them. There is no schedule engine — the story decides who is out
 * and where, and this makes them look like they live there in between.
 */
import { type Vec2, angleToward, dist, fromAngle } from '../core/math';
import type { World } from './world';
import type { PersonData } from './worldTypes';

export const PERSON_SPEED = 1.3;

export function updatePerson(p: PersonData, dt: number, world: World, facing: Vec2 | null): void {
  if (!p.visible) return;
  if (facing) {
    // Talking: stop, and look at whoever is talking to you.
    const want = Math.atan2(facing.y - p.pos.y, facing.x - p.pos.x);
    p.heading = angleToward(p.heading, want, 4.0 * dt);
    return;
  }
  const route = p.route;
  if (!route || route.length === 0) return;
  if ((p.waitTicks ?? 0) > 0) { p.waitTicks = (p.waitTicks ?? 0) - 1; return; }
  const idx = (p.routeIndex ?? 0) % route.length;
  const target = route[idx];
  const d = dist(p.pos, target);
  if (d < 0.6) {
    // A single point is somewhere to go and stay.
    if (route.length === 1) return;
    p.routeIndex = (idx + 1) % route.length;
    // Everybody pauses at the ends of their errand, a little differently.
    p.waitTicks = 60 * (2 + ((idx * 7 + p.id.length) % 4));
    return;
  }
  const want = Math.atan2(target.y - p.pos.y, target.x - p.pos.x);
  p.heading = angleToward(p.heading, want, 3.0 * dt);
  const dir = fromAngle(p.heading);
  const step = Math.min(PERSON_SPEED * dt, d);
  p.pos = world.resolveCollision(p.pos, { x: p.pos.x + dir.x * step, y: p.pos.y + dir.y * step }, 0.35);
}

/** Send somebody to a spot, and have them stay there. */
export function sendTo(p: PersonData, to: Vec2): void {
  p.route = [{ x: to.x, y: to.y }];
  p.routeIndex = 0;
  p.waitTicks = 0;
}
