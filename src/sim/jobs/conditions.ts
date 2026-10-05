/**
 * Today's conditions: the same jobs on a different street.
 *
 * Nothing new is built for this. The town already sees worse in poor light
 * (`sensors.ts` scales every picture by daylight) and a camera can already be
 * out of action; a condition is a choice of those two dials, made once per
 * day, so a job run yesterday is a slightly different job today.
 *
 * Pure and deterministic: the host passes in which day it is, so the
 * simulation itself never reads a clock.
 */
import { hashString } from '../../core/rng';
import type { Sim } from '../sim';
import type { JobDef } from './types';

export type ConditionId = 'CLEAR' | 'DUSK' | 'MAINTENANCE';

export interface Condition {
  id: ConditionId;
  /** Global daylight for the run, 0..1. 1 is an ordinary afternoon. */
  daylight: number;
  /** Roughly one camera in this many is down for the day. 0: none. */
  outOf: number;
}

export const CONDITIONS: Record<ConditionId, Condition> = {
  CLEAR: { id: 'CLEAR', daylight: 1, outOf: 0 },
  /** Low light: every camera's picture is worse, and the town is darker. */
  DUSK: { id: 'DUSK', daylight: 0.5, outOf: 0 },
  /** Some of the street's cameras are down for service. Different gaps each day. */
  MAINTENANCE: { id: 'MAINTENANCE', daylight: 1, outOf: 4 },
};

const ROTATION: ConditionId[] = ['CLEAR', 'DUSK', 'MAINTENANCE'];

/** Days since 1970 in the player's own calendar, for the rotation. */
export function dayIndex(year: number, monthIndex: number, day: number): number {
  return Math.floor(Date.UTC(year, monthIndex, day) / 86_400_000);
}

/** Which condition a given day has. Every day of a three-day cycle differs. */
export function conditionFor(day: number): Condition {
  return CONDITIONS[ROTATION[((day % ROTATION.length) + ROTATION.length) % ROTATION.length]];
}

/** The cameras down for maintenance on a given day: never one a job is about. */
export function camerasDown(sim: Sim, c: Condition, day: number, jobs: readonly JobDef[]): string[] {
  if (c.outOf <= 0) return [];
  const targets = new Set(jobs.flatMap((j) => j.stages.flatMap((s) => s.points.map((p) => p.sensorId)).filter(Boolean)));
  return sim.sensors
    .map((s) => s.data.id)
    .filter((id) => !targets.has(id) && hashString(`${day}:${id}`) % c.outOf === 0);
}

/** Apply a condition to a street that has just been reset for a run. */
export function applyCondition(sim: Sim, c: Condition, day: number, jobs: readonly JobDef[]): void {
  sim.daylight = c.daylight;
  const down = new Set(camerasDown(sim, c, day, jobs));
  for (const s of sim.sensors) {
    if (!down.has(s.data.id)) continue;
    s.state = 'OFFLINE';
    // For the whole of the run: a day's maintenance is not a six-minute fault.
    s.stateUntil = Number.MAX_SAFE_INTEGER;
  }
}
