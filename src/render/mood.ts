/**
 * The mood of the town: how far the system's hand is on it right now, as
 * one number the art reads (docs/41).
 *
 * The brief: the more the surveillance state has control, the darker and
 * more sinister the environment; every bit of sabotage and uncovering
 * brightens the town. So the mood is two things pulled against each other.
 *
 * **Grip** is the system's hold on the player at this moment — their risk
 * score, how far the escalation ladder has climbed, how hard the system is
 * looking at the ground they are standing on, whether a lens has them now,
 * and whether anything has been sent. It rises when the player is noticed
 * and falls back as the town forgets.
 *
 * **Cut** is what the player has taken from the system over the whole
 * afternoon — nodes looped, tampered with or taken down; cameras noticed and
 * so understood; clues written down; VISION unlocked. It only ever grows.
 *
 * Control is where the town starts, plus grip, minus cut, clamped to -1..1:
 * +1 is a town the system owns, -1 a town the kid has lit up. Everything here
 * is read from the simulation and nothing is written to it, so the mood can
 * never change what happens, only how it looks.
 *
 * **The town begins partially owned** (`START`), and the player's job is to
 * peel ownership away. The loop this is drawn for is
 *
 *     pressure → identify → sabotage → relief → deeper infiltration
 *
 * so the numbers are set for it: a fresh afternoon sits at START, the first
 * node looped takes the town most of the way back to an ordinary afternoon
 * (the sqrt below makes the first one count most), and only a sustained run
 * of sabotage and understanding takes it past ordinary into lit.
 */
import type { Sim } from '../sim/sim';
import type { EscalationLevel } from '../sim/surveillance/types';
import { clamp, clamp01 } from '../core/math';

export interface Mood {
  /** The system's hold right now, 0..1. */
  grip: number;
  /** What the player has taken from it, 0..1. */
  cut: number;
  /** grip against cut: -1 (lit) .. 0 (ordinary) .. +1 (owned). */
  control: number;
}

/** Where a fresh afternoon starts: already a little owned. */
export const START = 0.32;

const LADDER: Record<EscalationLevel, number> = {
  PASSIVE: 0, MONITORING: 0.25, DRONE_DISPATCH: 0.5, PATROL_DISPATCH: 0.75, INTERVENTION: 1,
};

/** The pieces, so each can be tested and tuned on its own. */
export interface MoodInputs {
  /** The player's risk score, 0..100. */
  risk: number;
  level: EscalationLevel;
  /** How hard the system is looking where the player is, 0..1. */
  scrutiny: number;
  /** A lens has the player this frame. */
  observed: boolean;
  /** Patrols responding or intervening, and drones off their patrol. */
  unitsActing: number;
  /** Network nodes the player has looped, tampered with or taken down, and all of them. */
  nodesCut: number;
  nodes: number;
  /** Cameras the player has noticed, and all of them. */
  sensorsKnown: number;
  sensors: number;
  /** Clues written down. */
  clues: number;
  vision: boolean;
}

export function moodFrom(i: MoodInputs): Mood {
  const grip = clamp01(
    0.45 * clamp01(i.risk / 100)
    + 0.25 * LADDER[i.level]
    + 0.2 * clamp01(i.scrutiny)
    + (i.observed ? 0.08 : 0)
    + 0.06 * Math.min(2, i.unitsActing),
  );
  // Sabotage is the big lever: a town with half its nodes looped is a town
  // the system has visibly lost. Uncovering is steadier and never spent.
  const sabotage = i.nodes > 0 ? i.nodesCut / i.nodes : 0;
  const noticed = i.sensors > 0 ? i.sensorsKnown / i.sensors : 0;
  const written = 1 - Math.exp(-i.clues / 5);
  const cut = clamp01(0.55 * Math.sqrt(sabotage) + 0.2 * noticed + 0.2 * written + (i.vision ? 0.12 : 0));
  return { grip, cut, control: clamp(START + grip * 1.15 - cut * 1.3, -1, 1) };
}

export function readMood(sim: Sim): MoodInputs {
  let nodes = 0, nodesCut = 0;
  for (const n of sim.network.nodes.values()) {
    nodes++;
    if (n.state !== 'NOMINAL') nodesCut++;
  }
  let unitsActing = 0;
  for (const p of sim.patrols) if (p.state === 'RESPONDING' || p.state === 'INTERVENING') unitsActing++;
  for (const d of sim.drones) if (d.state !== 'PATROL' && d.state !== 'DESTABILISED') unitsActing++;
  return {
    risk: sim.playerRisk,
    level: sim.playerLevel,
    scrutiny: sim.disturbance.scrutinyAt(sim.player.pos, sim.tick),
    observed: sim.playerObserved,
    unitsActing,
    nodesCut, nodes,
    sensorsKnown: sim.knownSensors.size, sensors: sim.sensors.length,
    clues: sim.casefile.clues.size,
    vision: sim.visionUnlocked,
  };
}

export function moodOf(sim: Sim): Mood { return moodFrom(readMood(sim)); }

export const NEUTRAL: MoodInputs = {
  risk: 0, level: 'PASSIVE', scrutiny: 0, observed: false, unitsActing: 0,
  nodesCut: 0, nodes: 10, sensorsKnown: 0, sensors: 40, clues: 0, vision: false,
};
