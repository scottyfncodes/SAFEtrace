/**
 * One run of one job: the objective, the attention, the chase, and the score.
 *
 * Laid over an ordinary `Sim` rather than built into it. The street is reset
 * for the run (`Sim.resetForRun`), the runner reads what the simulation
 * already knows — who has the rider in their picture, what the board just
 * did — and the only things it does back to the town are the things a job
 * is about: a camera put out of action, and drones sent after the rider.
 *
 * Detection never ends a run. It turns into a chase, and a chase is something
 * to skate out of.
 */
import { type Vec2, dist } from '../../core/math';
import type { Sim } from '../sim';
import { sensorActive } from '../surveillance/sensors';
import { DRONE } from '../drone';
import { type ExposureState, exposureRank, exposureShare, makeExposure, stepExposure } from './exposure';
import {
  type RunResult, type StyleTally, STYLE, bailChain, bank, flowShare, gradeFor, landed, makeTally, scoreMove,
  stepTally, styleTotal, totalFor,
} from './score';
import type { JobDef, JobPoint, JobStage } from './types';

export type CalloutTone = 'info' | 'good' | 'warn' | 'alarm';
export interface Callout { text: string; tone: CalloutTone; }

/** The words a run says out loud. Content supplies them, so the voice lives with the rest of the copy. */
export interface RunCopy {
  go: string;
  tracked: string;
  underwatch: string;
  lost: string;
  cut: string;
  complete: string;
  chainLost: string;
}

/** Who is looking, for the HUD: "CAM 04 →", "DRONE 02 ↑". */
export interface Watcher { id: string; kind: 'cam' | 'drone' | 'unit'; pos: Vec2; z: number; live: boolean; }

/** Close enough to a camera's pole to cut its line, metres. */
export const CUT_REACH = 2.6;
/** Seconds a lost chase keeps searching where it lost the rider. */
const SEARCH = 6;

export class JobRun {
  readonly def: JobDef;
  status: 'running' | 'complete' = 'running';
  stageIndex = 0;
  /** Points done in the current stage. */
  readonly done = new Set<string>();
  readonly exposure: ExposureState;
  readonly tally: StyleTally = makeTally();
  elapsed = 0;
  result: RunResult | null = null;
  /** Where something last had the rider in its picture. */
  lastKnown: Vec2 | null = null;
  /** Drones sent after the rider, by id. */
  readonly hunters: string[] = [];
  /** What has the rider in its picture this tick. */
  watchers: Watcher[] = [];
  /** The last scoring move, for the HUD's tick-up. */
  lastMove: { points: number; multiplier: number; label: string; at: number } | null = null;
  private callouts: Callout[] = [];
  private searchLeft = 0;
  private off: Array<() => void> = [];
  private signalLost = false;

  constructor(private sim: Sim, def: JobDef, private copy: RunCopy) {
    this.def = def;
    sim.resetForRun(def.start.pos, def.start.heading);
    this.exposure = makeExposure(def.startExposure ?? 0);
    if (def.startExposure) this.lastKnown = { ...def.start.pos };
    this.say(copy.go, 'info');
    if (def.startExposure && def.startExposure >= 80) this.say(copy.underwatch, 'alarm');

    const bus = sim.bus;
    const move = (base: number, label: string) => {
      if (this.status !== 'running') return;
      const pts = scoreMove(this.tally, base);
      this.lastMove = { points: pts, multiplier: this.tally.multiplier, label, at: this.elapsed };
    };
    this.off.push(
      bus.on('player:trick', ({ name }) => { this.tally.tricks++; move(STYLE.trick, name); }),
      bus.on('player:grab', ({ name }) => { this.tally.tricks++; move(STYLE.grab, name); }),
      bus.on('player:grind', ({ name }) => { this.tally.grinds++; move(STYLE.grind, name); }),
      bus.on('player:grindEnd', ({ name, seconds }) => {
        if (seconds > 0.4) move(STYLE.grindPerSecond * seconds, `${name} ${seconds.toFixed(1)}s`);
      }),
      bus.on('player:roof', () => { this.tally.roofs++; move(STYLE.roof, 'ROOFTOP'); }),
      bus.on('plan:held', () => move(STYLE.plan, 'PLAN HELD')),
      bus.on('player:land', () => {
        if (this.status !== 'running') return;
        const air = this.tally.airTime;
        const pts = landed(this.tally);
        if (pts > 0) this.lastMove = { points: pts, multiplier: this.tally.multiplier, label: `AIR ${air.toFixed(1)}s`, at: this.elapsed };
      }),
      bus.on('player:bail', () => {
        if (this.status !== 'running') return;
        this.tally.airTime = 0;
        if (bailChain(this.tally) > 0) this.say(copy.chainLost, 'warn');
      }),
    );
  }

  get stage(): JobStage | null { return this.def.stages[this.stageIndex] ?? null; }

  /** Points still to do in the current stage. */
  remaining(): JobPoint[] {
    const st = this.stage;
    return st ? st.points.filter((p) => !this.done.has(p.id)) : [];
  }

  /** The nearest thing still to do, for the beacon. */
  nextPoint(): JobPoint | null {
    const p = this.sim.player.pos;
    let best: JobPoint | null = null;
    for (const q of this.remaining()) if (!best || dist(q.pos, p) < dist(best.pos, p)) best = q;
    return best;
  }

  /** Callouts since the last time somebody asked. */
  takeCallouts(): Callout[] {
    const out = this.callouts;
    this.callouts = [];
    return out;
  }

  private say(text: string, tone: CalloutTone): void { this.callouts.push({ text, tone }); }

  step(dt: number): void {
    if (this.status !== 'running') return;
    const sim = this.sim;
    const p = sim.player;
    this.elapsed += dt;
    stepTally(this.tally, dt, p.speed, p.stance === 'AIR');

    // --- attention ------------------------------------------------------
    const sight = sim.playerSightings();
    if (sight.quality > 0) this.lastKnown = { x: p.pos.x, y: p.pos.y };
    this.watchers = sight.ids.map((id) => this.watcherFor(id)).filter((w): w is Watcher => !!w);
    for (const ch of stepExposure(this.exposure, sight.quality, dt)) {
      if (ch === 'tracked') this.say(this.copy.tracked, 'warn');
      else if (ch === 'underwatch') this.say(this.copy.underwatch, 'alarm');
      else if (ch === 'lost') { this.say(this.copy.lost, 'good'); this.signalLost = true; this.searchLeft = SEARCH; }
    }
    this.updateChase(dt);

    // --- the objective ------------------------------------------------------
    const st = this.stage;
    if (!st) return;
    for (const pt of st.points) {
      if (this.done.has(pt.id)) continue;
      if (this.reached(pt)) {
        this.done.add(pt.id);
        if (pt.sensorId) this.say(`${this.copy.cut} · ${pt.label}`, 'good');
      }
    }
    const allDone = st.points.length === 0 ? true : st.mode === 'any' ? st.points.some((q) => this.done.has(q.id)) : st.points.every((q) => this.done.has(q.id));
    const signalOk = !st.loseSignal || (this.signalLost && exposureRank(this.exposure.level) < exposureRank('TRACKED'));
    if (allDone && signalOk) this.finishStage(st);
  }

  private reached(pt: JobPoint): boolean {
    const sim = this.sim;
    const p = sim.player;
    if (pt.sensorId) {
      const s = sim.sensorById.get(pt.sensorId);
      if (!s) return false;
      // A stone did it already: the lens is out or the mount is knocked round.
      if (!sensorActive(s) || s.state === 'MISALIGNED') return true;
      if (dist(p.pos, s.data.pos) <= Math.max(pt.radius, CUT_REACH) && p.onBoard) {
        // Riding past the foot of the pole cuts its line: dark for the run.
        s.state = 'OFFLINE';
        s.stateUntil = sim.tick + 60 * 600;
        return true;
      }
      return false;
    }
    if (dist(p.pos, pt.pos) > pt.radius) return false;
    if (pt.minZ !== undefined && p.z < pt.minZ - 0.35) return false;
    if (pt.grind && !sim.grind) return false;
    if (pt.air !== undefined && (p.stance !== 'AIR' || p.z < pt.air)) return false;
    return true;
  }

  private finishStage(st: JobStage): void {
    this.say(st.done, 'good');
    if (st.alarm) {
      this.exposure.value = Math.min(100, this.exposure.value + st.alarm);
      this.exposure.unseenFor = 0;
      this.lastKnown = { ...this.sim.player.pos };
    }
    this.stageIndex++;
    this.done.clear();
    this.signalLost = false;
    if (this.stageIndex >= this.def.stages.length) this.complete();
  }

  private complete(): void {
    this.status = 'complete';
    bank(this.tally);
    const ghostWeight = this.def.kind === 'GHOST' ? 1.6 : 1;
    const exposure = exposureShare(this.exposure);
    const flow = flowShare(this.tally);
    const style = styleTotal(this.tally);
    const total = totalFor(style, this.elapsed, this.def.target, exposure, flow, ghostWeight);
    this.result = {
      style, time: this.elapsed, exposure, flow, total,
      grade: gradeFor(total, ghostWeight),
      ghost: exposureRank(this.exposure.worst) <= exposureRank('SPOTTED'),
      escapes: this.exposure.losses,
    };
    this.say(this.copy.complete, 'good');
    this.releaseHunters();
  }

  /**
   * The chase. TRACKED sends the nearest drone to where the rider was last
   * seen; UNDERWATCH sends a second. Each flies to the last sighting, which
   * while the rider is in sight is where they are — and the moment they are
   * not, is where they were. Lose them, and they search that spot for a few
   * seconds before going back to their rounds.
   */
  private updateChase(dt: number): void {
    const sim = this.sim;
    const level = this.exposure.level;
    const want = level === 'UNDERWATCH' ? 2 : level === 'TRACKED' ? 1 : 0;
    if (want > 0) this.searchLeft = 0;
    while (this.hunters.length < want) {
      const p = this.lastKnown ?? sim.player.pos;
      const free = sim.drones
        .filter((d) => d.state !== 'DESTABILISED' && !this.hunters.includes(d.id))
        .sort((a, b) => dist(a.pos, p) - dist(b.pos, p))[0];
      if (!free) break;
      this.hunters.push(free.id);
    }
    if (want === 0 && this.hunters.length) {
      this.searchLeft -= dt;
      if (this.searchLeft <= 0) { this.releaseHunters(); return; }
    }
    const target = this.lastKnown ?? sim.player.pos;
    const live = this.exposure.seen;
    for (const id of this.hunters) {
      sim.commandDrone(id, target, want > 0 && (live || level === 'UNDERWATCH'), want > 0 ? 'SUBJECT PURSUIT' : 'SEARCHING LAST FIX');
    }
  }

  private releaseHunters(): void {
    for (const id of this.hunters) this.sim.releaseDrone(id);
    this.hunters.length = 0;
  }

  private watcherFor(id: string): Watcher | null {
    const sim = this.sim;
    const s = sim.sensorById.get(id);
    if (s) return { id, kind: 'cam', pos: s.data.pos, z: s.data.height, live: true };
    const d = sim.drones.find((x) => x.id === id);
    if (d) return { id, kind: 'drone', pos: d.pos, z: d.z, live: true };
    const u = sim.patrols.find((x) => x.id === id);
    if (u) return { id, kind: 'unit', pos: u.pos, z: 1.7, live: true };
    return null;
  }

  /** Every drone the chase has, with where it is: the HUD points at them. */
  hunterDrones(): Watcher[] {
    return this.hunters
      .map((id) => this.sim.drones.find((d) => d.id === id))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => ({ id: d.id, kind: 'drone' as const, pos: d.pos, z: d.z || DRONE.trackAltitude, live: d.spotlight }));
  }

  /** Stop listening and call the drones off. */
  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
    this.releaseHunters();
  }
}
