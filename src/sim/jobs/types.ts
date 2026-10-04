/**
 * What a job is, as data. The jobs themselves are content (content/jobs.ts);
 * this is the shape the simulation runs.
 *
 * A job is a start, and a short list of stages done in order. Each stage
 * names a verb and the points it applies to — reach any one of them, or every
 * one of them — and can ask for the rider to be up on something (a roof) or
 * for the signal to have been lost. That covers every kind of job with one
 * runner: the variety lives in where the points are, not in the code.
 */
import type { Vec2 } from '../../core/math';

export type JobKind =
  | 'COURIER' | 'TAG' | 'EXTRACTION' | 'PHOTOGRAPH' | 'SABOTAGE' | 'GHOST' | 'SPEEDRUN' | 'GETAWAY';

export interface JobPoint {
  id: string;
  /** What the HUD calls it: "CINEMA ROOF". */
  label: string;
  pos: Vec2;
  /** How close counts, metres. */
  radius: number;
  /**
   * Height the rider must be at or above: a roof. A point with `minZ` can
   * only be done from up there, which is what makes it a sling-line job.
   */
  minZ?: number;
  /**
   * A camera: done by putting it out of action — a stone in the lens or the
   * motor — or by riding past the foot of its pole and cutting its line.
   */
  sensorId?: string;
}

export interface JobStage {
  /** The verb on the HUD: "GET TO", "TAG", "PICK UP", "HIT", "SHOOT", "LOSE THEM". */
  verb: string;
  points: JobPoint[];
  /** Any one point finishes the stage, or every one of them. */
  mode: 'any' | 'all';
  /** The stage cannot finish until the signal has been lost (a getaway). */
  loseSignal?: boolean;
  /** Said when the stage is done: "PACKAGE SECURED". */
  done: string;
  /** Attention added the moment the stage is done: lifting something is loud. */
  alarm?: number;
}

export interface JobDef {
  id: string;
  number: number;
  kind: JobKind;
  /** One line, no lore: what the job is. */
  title: string;
  /** Where the run begins. */
  start: { label: string; pos: Vec2; heading: number };
  stages: JobStage[];
  /** What is watching, in a few words: "Cameras + drones". */
  threat: string;
  /** Target time, seconds. Not a limit: the clock keeps running. */
  target: number;
  /** Exposure at the start: a getaway begins at the top. */
  startExposure?: number;
  /** One sentence of brief, for the board. */
  brief: string;
}
