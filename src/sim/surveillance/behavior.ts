/**
 * Track history -> behaviour classification.
 * These flags are shown to the player verbatim; learning them is learning the game.
 */
import { dist } from '../../core/math';
import type { World } from '../world';
import type { BehaviourFlag, Evidence, Subject, Track } from './types';

export const THRESHOLDS = {
  loiterWindowTicks: 420,      // 7 s
  loiterDisplacement: 6,       // metres
  offRoadDistance: 13,         // metres from any road centreline
  offRoadSustainTicks: 90,     // 1.5 s
  recklessSpeed: 8.5,          // m/s in a pedestrian zone
  recklessSustainTicks: 60,
  evasiveObservationGapTicks: 120,
  evidenceProximity: 22,       // metres
  evidenceWindowTicks: 900,    // 15 s
};

interface BehaviourMemory {
  offRoadTicks: number;
  recklessTicks: number;
  lastSeenTick: number;
  duckCount: number;
  lastDuckTick: number;
}

const memory = new Map<string, BehaviourMemory>();

function mem(id: string): BehaviourMemory {
  let m = memory.get(id);
  if (!m) { m = { offRoadTicks: 0, recklessTicks: 0, lastSeenTick: -9999, duckCount: 0, lastDuckTick: -9999 }; memory.set(id, m); }
  return m;
}

export function resetBehaviourMemory(): void { memory.clear(); }

export function classify(
  track: Track,
  subject: Subject,
  world: World,
  tick: number,
  evidence: Evidence[],
  pedestrianZone: boolean,
): void {
  const m = mem(track.id);
  const flags = new Set<BehaviourFlag>();

  const offRoad = world.distanceOffModel(subject.pos);
  if (offRoad > THRESHOLDS.offRoadDistance) m.offRoadTicks++;
  else m.offRoadTicks = Math.max(0, m.offRoadTicks - 3);

  if (subject.speed > THRESHOLDS.recklessSpeed && pedestrianZone) m.recklessTicks++;
  else m.recklessTicks = Math.max(0, m.recklessTicks - 2);

  // Evasion: the track was held, then lost quickly, repeatedly.
  const wasHeld = m.lastSeenTick > 0 && tick - m.lastSeenTick < 8;
  if (track.confidence > 0.4) m.lastSeenTick = tick;
  else if (wasHeld && tick - m.lastDuckTick > THRESHOLDS.evasiveObservationGapTicks) {
    m.duckCount++;
    m.lastDuckTick = tick;
  }
  if (tick - m.lastDuckTick > 1800) m.duckCount = Math.max(0, m.duckCount - 1);

  // Classification.
  if (m.offRoadTicks > THRESHOLDS.offRoadSustainTicks) flags.add('UNUSUAL_ROUTE');
  if (m.recklessTicks > THRESHOLDS.recklessSustainTicks) flags.add('RECKLESS_VELOCITY');
  if (m.duckCount >= 2) flags.add('EVASIVE');

  const disp = displacement(track, THRESHOLDS.loiterWindowTicks, tick);
  if (disp < THRESHOLDS.loiterDisplacement && track.history.length > 40) flags.add('LOITERING');

  for (const e of evidence) {
    if (tick - e.tick > THRESHOLDS.evidenceWindowTicks) continue;
    if (dist(e.pos, subject.pos) < THRESHOLDS.evidenceProximity) {
      flags.add('PROXIMITY_TO_EVIDENCE');
      break;
    }
  }

  if (flags.size === 0) flags.add('NORMAL_TRANSIT');
  track.flags = flags;
}

function displacement(track: Track, ticks: number, tick: number): number {
  const cutoff = tick - ticks;
  let oldest = null as null | { x: number; y: number };
  for (const s of track.history) if (s.tick >= cutoff) { oldest = s.pos; break; }
  const latest = track.history[track.history.length - 1];
  if (!oldest || !latest) return Infinity;
  return dist(oldest, latest.pos);
}

export const FLAG_WEIGHT: Record<BehaviourFlag, number> = {
  NORMAL_TRANSIT: 0,
  LOITERING: 6,
  UNUSUAL_ROUTE: 9,
  RECKLESS_VELOCITY: 9,
  EVASIVE: 22,
  PROXIMITY_TO_EVIDENCE: 18,
};

export function behaviourScore(track: Track): number {
  let s = 0;
  for (const f of track.flags) s += FLAG_WEIGHT[f];
  return s;
}
