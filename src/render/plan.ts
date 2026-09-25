/**
 * What the plan knows: the player's mental model of the surveillance, as data.
 *
 * The plan used to answer one question — where am I going — and before VISION
 * it drew a town with no cameras in it, which is the one thing a kid who has
 * skated these streets all afternoon does know. It now answers the questions
 * a person planning a route past a camera actually asks:
 *
 *  - Where am I visible, and which cameras cover my way?     (cameras, seen)
 *  - Where are the gaps, and which way does each one swing?  (cones, sweep)
 *  - If I make a noise over there, what turns to look?        (earshot)
 *  - Have I been too loud around here?                        (marks, areas)
 *
 * Before VISION it is the player's own knowledge — only cameras they have
 * been near enough to notice, and their own marks where they caused trouble.
 * VISION does not change the questions, only how much of the machine's
 * answer is on the page: every camera, and the areas SAFEtrace itself has
 * flagged. Pure: no canvas, so it can be tested.
 */
import type { Vec2 } from '../core/math';
import type { Sim } from '../sim/sim';
import { sensorActive, VIGILANT } from '../sim/surveillance/sensors';
import { DISTURBANCE_KINDS, levelRank, type DisturbanceLevel } from '../sim/surveillance/disturbance';
import { PLAN_READ } from '../content/copy';

/** Marks closer than this, in metres, are drawn as one. */
const MARK_MERGE = 6;

export interface PlanCamera {
  id: string;
  pos: Vec2;
  facing: number;
  fov: number;
  range: number;
  /** The arc it swings through, if it swings — as the player has seen it do. */
  sweep: number;
  home: number;
  /** It has the player right now. */
  seeing: boolean;
  live: boolean;
  /** Made watchful by what has happened near it. */
  vigilant: boolean;
}

export interface PlanEarshot {
  at: Vec2;
  /** Cameras a stone landing at the pin would turn. */
  stone: string[];
  /** Something louder beside the pin — a bin, a car — and what it would turn. */
  loud: { kind: string; pos: Vec2; sensors: string[] } | null;
  /** The place has heard too much; cameras would look back up the throw. */
  wary: boolean;
}

export interface PlanReading {
  cameras: PlanCamera[];
  earshot: PlanEarshot | null;
  /** Where trouble was caused, fading as the place forgets. 0..1 strength. */
  marks: Array<{ pos: Vec2; strength: number; heavy: boolean }>;
  /** VISION only: districts SAFEtrace itself has flagged, and where. */
  areas: Array<{ pos: Vec2; level: DisturbanceLevel; district: string }>;
  /** Plain-language readings, most urgent first. */
  lines: string[];
}

export function readPlan(sim: Sim, pin: Vec2 | null): PlanReading {
  const vision = sim.visionUnlocked;
  const knows = (id: string) => vision || sim.knownSensors.has(id);
  const seeing = new Set(sim.sensorsSeeingPlayer().map((s) => s.data.id));

  const cameras: PlanCamera[] = [];
  for (const s of sim.sensors) {
    if (!knows(s.data.id)) continue;
    const d = s.data;
    cameras.push({
      id: d.id, pos: d.pos, facing: s.facing, fov: d.fov, range: d.range,
      sweep: d.sweep > 0 ? d.sweep * (1 + VIGILANT.sweepGain * s.vigilance) : VIGILANT.scanArc * s.vigilance,
      home: d.facing,
      seeing: seeing.has(d.id), live: sensorActive(s), vigilant: s.vigilance > 0.15,
    });
  }

  let earshot: PlanEarshot | null = null;
  if (pin) {
    const e = sim.earshot(pin);
    earshot = {
      at: { x: pin.x, y: pin.y },
      stone: e.stone.filter(knows),
      loud: e.loud ? { kind: e.loud.kind, pos: e.loud.pos, sensors: e.loud.sensors.filter(knows) } : null,
      wary: e.wary,
    };
  }

  // One mark per spot: five stones into the same patch of road are one place
  // you have been loud, not a row of crosses.
  const marks: PlanReading['marks'] = [];
  for (const ev of sim.disturbance.events) {
    const spec = DISTURBANCE_KINDS[ev.kind];
    const strength = sim.disturbance.remaining(ev, sim.tick) / spec.weight;
    if (strength < 0.1) continue;
    const heavy = spec.weight >= 2;
    const near = marks.find((m) => Math.hypot(m.pos.x - ev.pos.x, m.pos.y - ev.pos.y) < MARK_MERGE);
    if (near) {
      near.strength = Math.max(near.strength, strength);
      near.heavy = near.heavy || heavy;
      continue;
    }
    marks.push({ pos: { x: ev.pos.x, y: ev.pos.y }, strength, heavy });
  }

  const areas: PlanReading['areas'] = [];
  if (vision) {
    for (const d of sim.world.data.districts) {
      const level = sim.disturbance.districtLevel(d.id);
      if (level === 'QUIET') continue;
      const hot = sim.disturbance.hottest(d.id, sim.tick);
      if (hot) areas.push({ pos: hot.at, level, district: d.name });
    }
  }

  const lines: string[] = [];
  if (sim.playerObserved) {
    const ids = [...seeing].filter(knows);
    lines.push(vision && ids.length ? PLAN_READ.seenBy(ids) : PLAN_READ.inView);
  }
  const here = sim.disturbance.levelAt(sim.player.pos, sim.tick);
  if (levelRank(here) >= levelRank('NOTICED')) lines.push(PLAN_READ.area(here, vision));
  if (earshot) lines.push(PLAN_READ.earshot(earshot, vision));

  return { cameras, earshot, marks, areas, lines };
}
