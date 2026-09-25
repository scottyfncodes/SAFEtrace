/** Sensor state and observation generation. */
import { angleDelta, clamp01, dist, remap, wrapAngle } from '../../core/math';
import type { World } from '../world';
import type { SensorData } from '../worldTypes';
import type { Observation, Subject } from './types';
import type { Rng } from '../../core/rng';

export type SensorState = 'ONLINE' | 'MISALIGNED' | 'FROZEN' | 'OFFLINE' | 'DEGRADED' | 'LOOPED';

export interface Sensor {
  data: SensorData;
  state: SensorState;
  /** Current facing including sweep and any knock. */
  facing: number;
  /** Offset applied by a slingshot hit to the mount. */
  knockOffset: number;
  stateUntil: number;
  /** When a LOOP was applied; integrity check fires later. */
  loopedAtTick: number;
  loopCheckTick: number;
  /** True while the camera is actively prioritising a track. */
  prioritisedTrackId: string | null;
  /** Local light level 0..1; streetlights knocked out reduce this. */
  light: number;
  /** Ticks the sensor has continuously seen the player, for the "it noticed you" tell. */
  dwell: number;
  /**
   * A sound it has turned to look at, and until when. Only cameras built to
   * turn — the ones on a sweep — do this, and they ease there and back.
   */
  attend: { x: number; y: number } | null;
  attendUntil: number;
  /** 0..1, how far round toward `attend` it currently is. */
  attendBlend: number;
  /**
   * 0..1, how watchful this camera is because of what has been happening
   * near it (see surveillance/disturbance.ts). A camera on a street where a
   * lens was just shot out sweeps wider, hears further and looks harder; a
   * fixed camera on that street starts scanning. Eased, so it never snaps.
   */
  vigilance: number;
}

export function makeSensor(data: SensorData): Sensor {
  return {
    data,
    state: 'ONLINE',
    facing: data.facing,
    knockOffset: 0,
    stateUntil: 0,
    loopedAtTick: -1,
    loopCheckTick: -1,
    prioritisedTrackId: null,
    light: 1,
    dwell: 0,
    attend: null,
    attendUntil: 0,
    attendBlend: 0,
    vigilance: 0,
  };
}

export const sensorActive = (s: Sensor): boolean =>
  s.state === 'ONLINE' || s.state === 'MISALIGNED' || s.state === 'FROZEN' || s.state === 'DEGRADED';

/** Advance sweep and expire temporary states. */
export function updateSensor(s: Sensor, tick: number, time: number): void {
  if (s.stateUntil > 0 && tick >= s.stateUntil) {
    if (s.state === 'MISALIGNED') { s.knockOffset = 0; s.state = 'ONLINE'; }
    else if (s.state === 'FROZEN') s.state = 'ONLINE';
    else if (s.state === 'DEGRADED') s.state = 'ONLINE';
    else if (s.state === 'LOOPED') s.state = 'ONLINE';
    else if (s.state === 'OFFLINE') s.state = 'ONLINE';
    s.stateUntil = 0;
  }

  const d = s.data;
  if (s.state === 'FROZEN') {
    s.facing = wrapAngle(s.facing);
    return;
  }
  let base = d.facing;
  const v = s.vigilance;
  if (d.sweep > 0 && d.sweepPeriod > 0) {
    const phase = ((time / d.sweepPeriod) + d.sweepPhase) % 1;
    // A watchful camera covers more of its street.
    base = d.facing + Math.sin(phase * Math.PI * 2) * d.sweep * (1 + VIGILANT.sweepGain * v);
  } else if (v > 0.01) {
    // A fixed camera that is not usually a turner starts to scan: slowly, and
    // not far, but a player who learned where its edge was must learn it again.
    const phase = ((time / VIGILANT.scanPeriod) + d.sweepPhase + 0.25) % 1;
    base = d.facing + Math.sin(phase * Math.PI * 2) * VIGILANT.scanArc * v;
  }
  // A knocked mount re-homes slowly rather than snapping, so the player can watch it.
  if (s.knockOffset !== 0) {
    const remaining = Math.max(0, s.stateUntil - tick);
    if (remaining < 60) s.knockOffset *= 0.96;
  }
  // Turning to a sound: roughly a second to swing round, and back again.
  const attending = s.attend !== null && tick < s.attendUntil;
  s.attendBlend = clamp01(s.attendBlend + (attending ? 1 / 55 : -1 / 80));
  if (!attending && s.attendBlend === 0) s.attend = null;
  if (s.attend && s.attendBlend > 0) {
    const toward = Math.atan2(s.attend.y - d.pos.y, s.attend.x - d.pos.x);
    const ease = s.attendBlend * s.attendBlend * (3 - 2 * s.attendBlend);
    base = base + angleDelta(base, toward) * ease;
  }
  s.facing = wrapAngle(base + s.knockOffset);
}

/** What watchfulness does to a camera. */
export const VIGILANT = {
  /** Extra sweep amplitude at full vigilance, as a fraction of its own. */
  sweepGain: 0.6,
  /** A fixed camera's scan, radians either side, at full vigilance. */
  scanArc: 0.34,
  scanPeriod: 9,
  /** Observation quality gain at full vigilance. */
  qualityGain: 0.22,
  /** How much further it hears a sound, at full vigilance. */
  hearingGain: 0.5,
};

/** Effective observation cone half-angle. */
export const halfFov = (s: Sensor): number => s.data.fov / 2;

export interface ObservationParams {
  /** Global daylight 0..1. */
  daylight: number;
}

/**
 * Can this sensor see the subject, and how well? Returns null if not observed.
 * Quality falls off with distance, angle off axis, subject speed, and light.
 */
export function observe(
  sensor: Sensor,
  subject: Subject,
  world: World,
  tick: number,
  params: ObservationParams,
  rng: Rng,
): Observation | null {
  if (!sensorActive(sensor)) return null;

  const d = sensor.data;
  const dd = dist(d.pos, subject.pos);
  if (dd > d.range) return null;

  const bearing = Math.atan2(subject.pos.y - d.pos.y, subject.pos.x - d.pos.x);
  const off = Math.abs(angleDelta(sensor.facing, bearing));
  const half = halfFov(sensor);
  if (off > half) return null;

  if (world.blocked(d.pos, subject.pos, d.height)) return null;

  // Quality model. Every term here is something a player can learn.
  const distTerm = remap(dd, d.range * 0.15, d.range, 1, 0.22);
  const angleTerm = remap(off, 0, half, 1, 0.55);
  const speedTerm = remap(subject.speed, 2, 13, 1, 0.42);
  const lightTerm = clamp01(0.35 + 0.65 * sensor.light * params.daylight);
  const degrade = sensor.state === 'DEGRADED' ? 0.45 : 1;
  const watchful = 1 + VIGILANT.qualityGain * sensor.vigilance;
  // Partial cover — a tree crown, a parked car — for the player only; see World.softCover.
  const cover = subject.kind === 'player' ? world.softCover(d.pos, d.height, subject.pos, subject.speed) : 1;

  let quality = clamp01(distTerm * angleTerm * speedTerm * lightTerm * degrade * watchful * cover);
  if (quality < 0.08) return null;

  // Small deterministic jitter so identical geometry does not produce identical numbers.
  quality = clamp01(quality + rng.gauss() * 0.012);

  const identityConfidence = clamp01(
    quality * d.recognitionBias * remap(subject.speed, 0, 12, 1.0, 0.8),
  );

  return {
    sensorId: d.id,
    subjectId: subject.id,
    pos: { x: subject.pos.x, y: subject.pos.y },
    tick,
    quality,
    identityConfidence,
    attributedIdentity: subject.identity,
  };
}
