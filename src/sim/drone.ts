/**
 * Drones. The mobile expression of the same system as the cameras, running on
 * the same observation pipeline. Three of them cover the district: their
 * scarcity is the design.
 */
import {
  type Vec2, angleToward, clamp01, dist, fromAngle, remap, wrapAngle,
} from '../core/math';
import type { World } from './world';
import type { Task } from './surveillance/types';

export type DroneState =
  | 'DOCK' | 'PATROL' | 'INVESTIGATE' | 'TRACK' | 'RETURN' | 'DESTABILISED' | 'RELAY';

export const DRONE = {
  patrolAltitude: 14,
  investigateAltitude: 11,
  trackAltitude: 13,
  speed: 16,
  turnRate: 1.35,
  climbRate: 4.5,
  coneHalf: 0.62,
  investigateDwell: 60 * 12,
  rebootMin: 60 * 20,
  rebootMax: 60 * 45,
  hitRadius: 0.9,
};

export interface Drone {
  id: string;
  pos: Vec2;
  z: number;
  heading: number;
  state: DroneState;
  route: Vec2[];
  routeIndex: number;
  pad: Vec2;
  task: Task | null;
  dwellTicks: number;
  rebootTicks: number;
  /** Set while the drone's cone actually contains the player, for the shadow tell. */
  spotlight: boolean;
  reason: string;
}

export function makeDrone(id: string, route: Vec2[], pad: Vec2): Drone {
  return {
    id,
    pos: { x: pad.x, y: pad.y },
    z: DRONE.patrolAltitude,
    heading: 0,
    state: 'PATROL',
    route,
    routeIndex: 0,
    pad: { x: pad.x, y: pad.y },
    task: null,
    dwellTicks: 0,
    rebootTicks: 0,
    spotlight: false,
    reason: 'ROUTINE PATROL',
  };
}

export function destabilise(d: Drone, rebootTicks: number): void {
  d.state = 'DESTABILISED';
  d.rebootTicks = rebootTicks;
  d.task = null;
  d.reason = 'UNIT FAULT — DIAGNOSTIC';
}

export function assignTask(d: Drone, task: Task | null): void {
  d.task = task;
  if (!task) { d.state = 'PATROL'; d.reason = 'ROUTINE PATROL'; return; }
  d.state = task.kind === 'TRACK' ? 'TRACK' : 'INVESTIGATE';
  d.dwellTicks = 0;
  d.reason = task.reason;
}

export function updateDrone(d: Drone, dt: number, targetOverride: Vec2 | null): void {
  if (d.state === 'DESTABILISED') {
    d.rebootTicks--;
    d.z = Math.max(0.6, d.z - 6 * dt);
    d.heading = wrapAngle(d.heading + 7 * dt);
    if (d.rebootTicks <= 0) { d.state = 'RETURN'; d.reason = 'RETURNING TO PAD'; }
    return;
  }

  let target: Vec2;
  let altitude = DRONE.patrolAltitude;

  switch (d.state) {
    case 'TRACK':
      target = targetOverride ?? d.task?.target ?? d.pad;
      altitude = DRONE.trackAltitude;
      break;
    case 'INVESTIGATE': {
      target = d.task?.target ?? d.pad;
      altitude = DRONE.investigateAltitude;
      if (dist(d.pos, target) < 6) {
        d.dwellTicks++;
        // Orbit while scanning, so the player can watch it work.
        const t = d.dwellTicks / 60;
        target = { x: target.x + Math.cos(t * 1.4) * 7, y: target.y + Math.sin(t * 1.4) * 7 };
        if (d.dwellTicks > DRONE.investigateDwell) {
          d.state = 'PATROL';
          d.task = null;
          d.reason = 'ROUTINE PATROL';
        }
      }
      break;
    }
    case 'RETURN':
      target = d.pad;
      if (dist(d.pos, d.pad) < 3) { d.state = 'PATROL'; d.reason = 'ROUTINE PATROL'; }
      break;
    case 'RELAY':
      target = d.task?.target ?? d.pad;
      altitude = 18;
      break;
    case 'DOCK':
      target = d.pad;
      altitude = 0.4;
      break;
    default: {
      if (d.route.length === 0) { target = d.pad; break; }
      target = d.route[d.routeIndex % d.route.length];
      if (dist(d.pos, target) < 7) d.routeIndex = (d.routeIndex + 1) % d.route.length;
      break;
    }
  }

  const want = Math.atan2(target.y - d.pos.y, target.x - d.pos.x);
  d.heading = angleToward(d.heading, want, DRONE.turnRate * dt);

  // Drones prefer straight lines and turn wide, so a flowing skater can
  // out-corner one even though it is faster in a straight line.
  const align = clamp01(Math.cos(wrapAngle(want - d.heading)));
  const speed = DRONE.speed * remap(align, 0, 1, 0.35, 1);
  const dir = fromAngle(d.heading);
  const step = Math.min(speed * dt, dist(d.pos, target));
  d.pos.x += dir.x * step;
  d.pos.y += dir.y * step;

  const dz = altitude - d.z;
  d.z += Math.sign(dz) * Math.min(Math.abs(dz), DRONE.climbRate * dt);
}

/** Ground radius of the drone's downward cone. */
export const coneRadius = (d: Drone): number => Math.tan(DRONE.coneHalf) * Math.max(1, d.z);

/**
 * Can the drone see this point? Overhead cover defeats it absolutely, which is
 * why the parking decks and tree canopy are the most valuable geometry in town.
 */
export function droneSees(d: Drone, world: World, p: Vec2): boolean {
  if (d.state === 'DESTABILISED' || d.state === 'DOCK') return false;
  if (dist(d.pos, p) > coneRadius(d)) return false;
  return world.underCover(p) === null;
}
