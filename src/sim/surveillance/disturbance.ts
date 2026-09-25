/**
 * Disturbance: what a place remembers.
 *
 * Evidence is about a *person* — it back-projects, it searches, it links to a
 * name or it does not. Disturbance is about a *place*. Every stone that
 * clatters into a road, every bin that goes over, every camera that suddenly
 * points at a wall or goes dark, every node that fails an integrity check
 * leaves a little heat where it happened, whether or not anybody is ever
 * blamed for it. The heat fades. Enough of it in one area and SAFEtrace stops
 * treating each event as an accident and starts treating the area as a
 * pattern.
 *
 * That is the whole of the consequence model, and it is deliberately not a
 * morality meter and not a number on the screen. It surfaces through the
 * world: cameras that stop turning toward a noise and look back along where
 * it came from, fixed cameras that start scanning, a drone sent to look at a
 * street, residents who look up at a skater, a forensic search that runs
 * faster and tighter. Routing round a camera leaves nothing. A stone leaves a
 * little. Breaking the camera leaves a lot.
 *
 * Nothing in here can start a pursuit. Being hunted still needs something
 * that links to a name (see `Sim.reportOffence`); disturbance only decides how
 * hard the town is looking, and where.
 */
import { type Vec2, clamp01, dist } from '../../core/math';

export type DisturbanceKind =
  /** A stone landing in a road or a lawn. */
  | 'noise'
  /** Something knocked over: a bin, a cone, a sign swinging. */
  | 'clatter'
  /** A car alarm. Loud, long, and the whole street hears it. */
  | 'alarm'
  /** Birds out of a tree. */
  | 'birds'
  /** A camera suddenly pointing the wrong way, or stuck: unusual behaviour. */
  | 'fault'
  /** Something broken: a lens, a junction, a drone out of the air. */
  | 'sabotage'
  /** A digital trace: a failed integrity check, a masked identity. */
  | 'tamper'
  /** A track that went strange in the middle of being held. */
  | 'glitch'
  /** An anomaly flagged that turned out to be nothing. */
  | 'falseflag'
  /** Something thrown at a person. */
  | 'person';

export type DisturbanceLevel = 'QUIET' | 'NOTICED' | 'PATTERN' | 'REVIEW';

const ORDER: DisturbanceLevel[] = ['QUIET', 'NOTICED', 'PATTERN', 'REVIEW'];
export const levelRank = (l: DisturbanceLevel): number => ORDER.indexOf(l);

/**
 * How much each kind of thing weighs, and how long a place remembers it.
 *
 * The ladder is the design. Going round leaves nothing; a stone in the road is
 * the lightest thing you can do on purpose; a knocked bin is louder; a hack is
 * clean at the time and leaves its trace later; a camera doing something odd
 * is noticed; breaking one is the heaviest thing short of throwing something
 * at a person. Half-lives are in seconds.
 */
export const DISTURBANCE_KINDS: Record<DisturbanceKind, { weight: number; halfLife: number; radius: number }> = {
  noise:     { weight: 0.75, halfLife: 75, radius: 36 },
  birds:     { weight: 0.5, halfLife: 60, radius: 36 },
  clatter:   { weight: 1.0, halfLife: 90, radius: 36 },
  falseflag: { weight: 0.8, halfLife: 90, radius: 36 },
  glitch:    { weight: 1.2, halfLife: 120, radius: 36 },
  alarm:     { weight: 2.0, halfLife: 120, radius: 48 },
  fault:     { weight: 2.2, halfLife: 150, radius: 48 },
  tamper:    { weight: 2.5, halfLife: 200, radius: 48 },
  // Breaking things carries: the whole street hears about a dead camera.
  sabotage:  { weight: 4.5, halfLife: 240, radius: 64 },
  person:    { weight: 5.0, halfLife: 240, radius: 64 },
};

export const DISTURBANCE = {
  /** Thresholds on heat. */
  noticed: 1.6,
  pattern: 3.5,
  review: 7,
  /** A level is only let go of once heat is this far below it, so it does not flicker. */
  hysteresis: 0.8,
  /** Contributions smaller than this are forgotten entirely. */
  forget: 0.03,
};

export interface DisturbanceEvent {
  id: number;
  kind: DisturbanceKind;
  pos: Vec2;
  tick: number;
  district: string;
  label: string;
}

export interface LevelChange {
  district: string;
  from: DisturbanceLevel;
  to: DisturbanceLevel;
  /** Where the heat in that district is centred. */
  at: Vec2;
}

export function levelForHeat(heat: number): DisturbanceLevel {
  if (heat >= DISTURBANCE.review) return 'REVIEW';
  if (heat >= DISTURBANCE.pattern) return 'PATTERN';
  if (heat >= DISTURBANCE.noticed) return 'NOTICED';
  return 'QUIET';
}

const THRESHOLD: Record<DisturbanceLevel, number> = {
  QUIET: 0, NOTICED: DISTURBANCE.noticed, PATTERN: DISTURBANCE.pattern, REVIEW: DISTURBANCE.review,
};

export class Disturbance {
  events: DisturbanceEvent[] = [];
  private nextId = 1;
  /** The level last announced for each district, for transitions. */
  private announced = new Map<string, DisturbanceLevel>();

  reset(): void { this.events.length = 0; this.announced.clear(); this.nextId = 1; }

  record(kind: DisturbanceKind, pos: Vec2, tick: number, district: string, label = ''): DisturbanceEvent {
    const e: DisturbanceEvent = { id: this.nextId++, kind, pos: { x: pos.x, y: pos.y }, tick, district, label };
    this.events.push(e);
    return e;
  }

  /** One event's heat at a point, now. */
  contribution(e: DisturbanceEvent, p: Vec2, tick: number): number {
    const spec = DISTURBANCE_KINDS[e.kind];
    const d = dist(e.pos, p);
    if (d >= spec.radius) return 0;
    return this.remaining(e, tick) * (1 - d / spec.radius);
  }

  /** How much of an event is left, wherever you stand. */
  remaining(e: DisturbanceEvent, tick: number): number {
    const spec = DISTURBANCE_KINDS[e.kind];
    return spec.weight * Math.pow(0.5, Math.max(0, tick - e.tick) / 60 / spec.halfLife);
  }

  /** How disturbed this spot is. */
  heatAt(p: Vec2, tick: number): number {
    let h = 0;
    for (const e of this.events) h += this.contribution(e, p, tick);
    return h;
  }

  levelAt(p: Vec2, tick: number): DisturbanceLevel { return levelForHeat(this.heatAt(p, tick)); }

  /**
   * 0..1, how hard the system is looking here: nothing below NOTICED, all of
   * it at REVIEW. The one number the rest of the simulation reads.
   */
  scrutinyAt(p: Vec2, tick: number): number {
    return clamp01((this.heatAt(p, tick) - DISTURBANCE.noticed) / (DISTURBANCE.review - DISTURBANCE.noticed));
  }

  /** The hottest point in a district: where its heat is centred, and how much. */
  hottest(district: string, tick: number): { at: Vec2; heat: number } | null {
    let best: { at: Vec2; heat: number } | null = null;
    for (const e of this.events) {
      if (e.district !== district) continue;
      const h = this.heatAt(e.pos, tick);
      if (!best || h > best.heat) best = { at: e.pos, heat: h };
    }
    return best;
  }

  /** The level a district is currently announced at. */
  districtLevel(district: string): DisturbanceLevel { return this.announced.get(district) ?? 'QUIET'; }

  /**
   * What kind of trouble a district has mostly had, for the town to talk
   * about: breaking things, or making noise. Null when it has had none.
   */
  dominant(district: string, tick: number): 'noise' | 'broken' | 'tamper' | null {
    let noise = 0, broken = 0, tamper = 0;
    for (const e of this.events) {
      if (e.district !== district) continue;
      const w = this.contribution(e, e.pos, tick);
      if (e.kind === 'sabotage' || e.kind === 'fault' || e.kind === 'person') broken += w;
      else if (e.kind === 'tamper' || e.kind === 'glitch' || e.kind === 'falseflag') tamper += w;
      else noise += w;
    }
    if (noise + broken + tamper < DISTURBANCE.forget) return null;
    if (broken >= noise && broken >= tamper) return 'broken';
    return tamper > noise ? 'tamper' : 'noise';
  }

  /**
   * Forget what has faded, and say which districts have changed level.
   * Called about once a second; cheap either way.
   */
  update(tick: number): LevelChange[] {
    this.events = this.events.filter((e) => this.remaining(e, tick) >= DISTURBANCE.forget);
    const out: LevelChange[] = [];
    const districts = new Set<string>([...this.announced.keys(), ...this.events.map((e) => e.district)]);
    for (const d of districts) {
      const hot = this.hottest(d, tick);
      const heat = hot?.heat ?? 0;
      const was = this.announced.get(d) ?? 'QUIET';
      let now = levelForHeat(heat);
      // Going down needs to clear the threshold by a margin.
      if (levelRank(now) < levelRank(was) && heat > THRESHOLD[was] * DISTURBANCE.hysteresis) now = was;
      if (now !== was) {
        out.push({ district: d, from: was, to: now, at: hot?.at ?? { x: 0, y: 0 } });
        if (now === 'QUIET') this.announced.delete(d); else this.announced.set(d, now);
      }
    }
    return out;
  }
}
