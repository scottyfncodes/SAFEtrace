/**
 * Recon, and the plan it turns into.
 *
 * BARRIER → RECON → INTEL → PLAN → EXECUTE.
 *
 * The plan view is the recon layer. While it is open the town keeps running,
 * and whatever the player holds in the middle of the map long enough is
 * learned: a camera they had not noticed is spotted, and one they keep
 * looking at gives up its timing — how far it swings, how often, and how
 * long it leaves the way clear. A pin dropped by something loud records what
 * a stone there would turn. That is intel, and it is kept.
 *
 * Pressing PLAN to leave is the commitment. The route from the rider to the
 * target is checked against every camera that could ever see any of it (the
 * barrier), and each one gets the answer the intel supports: a stone that
 * turns it, a gap in its sweep, or the warning that it never looks away — or nothing,
 * because it was never scouted. That chain is the plan, and it is carried
 * out into the street.
 *
 * Execution is judged by the town, not by a script. The plan holds if the
 * rider reaches the target without anything getting a picture of them. It
 * is blown the moment something does, and the reason is always a thing the
 * recon could have told them: a camera nobody scouted, a gap mistimed, a
 * stone that was never thrown, a place that had stopped believing in
 * stones. Being seen does not end anything else; the plan is just over.
 *
 * Pure simulation: no canvas, no DOM. The host tells it where the map is
 * looking (`Sim.reconFocus`), because the sim does not know cameras exist.
 */
import { type Vec2, angleDelta, dist } from '../core/math';
import type { Sim } from './sim';
import { type Sensor, sensorActive, VIGILANT, ABOVE_LENS } from './surveillance/sensors';

export const RECON = {
  /** Seconds a camera has to sit in the middle of the map to be spotted. */
  spot: 0.5,
  /** Seconds more to learn its timing. */
  study: 1.6,
  /** The middle of the map, as a share of the view's radius. */
  focusShare: 0.6,
  /** Route sample spacing, metres: finer than a rider covers in a tick or two. */
  sample: 1,
  /** Radians added to every cone when planning, so a gap is not a guess at its edge. */
  margin: 0.06,
  /** Arriving this close to the target finishes the plan. */
  arrive: 4,
  /** Seconds sampled across one sweep to find its gap. */
  phaseSamples: 96,
  /** A gap shorter than this is not one anyone could use, seconds. */
  minGap: 0.8,
  /** The speed a gap is worked out for: rolling, pushing now and then, m/s. */
  cruise: 8,
  /** Seconds a camera stays turned to a stone (Sim.makeNoise for a stone). */
  stoneTurn: 4.5,
  /** How far round to a stone a camera has to be before the way is open, 0..1. */
  turned: 0.95,
};

export interface CameraIntel {
  id: string;
  /** Seconds of recon spent on it. */
  studied: number;
  /** Spotted: it is on the map. */
  spotted: boolean;
  /** Timing learned: sweep, period, its gaps. */
  timed: boolean;
}

/** A stone dropped here turns these cameras. Learned by pinning the spot. */
export interface NoiseIntel { at: Vec2; sensors: string[]; wary: boolean; }

/**
 * - distract: a stone the recon found turns this camera off the way.
 * - gap:      it sweeps, and there is a moment to go that slips past it.
 * - covered:  timed, and it never looks away from the line: no gap, no
 *             stone found that would help. Committed anyway, it will be seen.
 * - unknown:  on the way, never timed. A hole in the plan.
 */
export type StepKind = 'distract' | 'gap' | 'covered' | 'unknown' | 'target';

export interface PlanStep {
  kind: StepKind;
  /** The camera this step is about. */
  sensorId?: string;
  /** distract: where the stone goes. */
  at?: Vec2;
  /** gap: seconds of each sweep it is right to go; distract: seconds a stone buys. */
  gap?: number;
  /** Where along the route (0..1) this camera can see, nearest the rider. */
  along: number;
  /** gap: the stretch of the way it covers, kept for live timing. */
  exposed?: Exposed[];
  done: boolean;
}

export type PlanStatus = 'executing' | 'held' | 'blown';

export interface CommittedPlan {
  from: Vec2;
  target: Vec2;
  /** The way the plan goes: straight, or round by the streets. */
  route: Vec2[];
  /** Its length, metres. */
  length: number;
  label: string | null;
  steps: PlanStep[];
  status: PlanStatus;
  /** Why it was blown — always something the recon could have shown. */
  failure: { sensorId: string; reason: FailReason } | null;
  /** Seconds since the commitment. */
  elapsed: number;
}

/**
 * - unscouted:  a camera (or a drone) the recon never timed.
 * - mistimed:   a camera with a gap, met outside it.
 * - unturned:   the stone was the plan, and the camera was never turned.
 * - turning:    the stone landed, but they went before the camera had turned.
 * - woreOff:    the stone turned it, and it turned back before they were past.
 * - lookedBack: the place had stopped believing in stones.
 * - inCone:     the recon said it never looks away from this line.
 * - offRoute:   a camera nowhere near the way that was planned.
 */
export type FailReason = 'unscouted' | 'mistimed' | 'unturned' | 'turning' | 'woreOff' | 'lookedBack' | 'inCone' | 'offRoute';

/** A point on the route a camera can ever see, and how far along the route it is, metres. */
export interface Exposed { p: Vec2; s: number; }

/** One camera's relationship to a route. */
export interface Barrier {
  sensorId: string;
  /** Route samples it can ever see. */
  exposed: Exposed[];
  /** Earliest of them along the route, 0..1. */
  along: number;
  sweeps: boolean;
}

/** What the recon has found, kept until the run is reset. */
export class Recon {
  readonly cameras = new Map<string, CameraIntel>();
  readonly noise: NoiseIntel[] = [];

  reset(): void {
    this.cameras.clear();
    this.noise.length = 0;
  }

  intelOn(id: string): CameraIntel | undefined { return this.cameras.get(id); }
  timed(id: string): boolean { return !!this.cameras.get(id)?.timed; }

  /** A count of what has been found, for the screen. */
  count(): number {
    let n = this.noise.length;
    for (const c of this.cameras.values()) n += (c.spotted ? 1 : 0) + (c.timed ? 1 : 0);
    return n;
  }

  /**
   * One tick of looking. Every camera near the middle of the map gets a
   * little more studied; returns the ids that crossed a threshold.
   */
  observe(sim: Sim, centre: Vec2, radius: number, dt: number): { spotted: string[]; timed: string[] } {
    const out = { spotted: [] as string[], timed: [] as string[] };
    const reach = radius * RECON.focusShare;
    for (const s of sim.sensors) {
      if (dist(s.data.pos, centre) > reach) continue;
      let c = this.cameras.get(s.data.id);
      if (!c) { c = { id: s.data.id, studied: 0, spotted: false, timed: false }; this.cameras.set(c.id, c); }
      c.studied += dt;
      if (!c.spotted && (c.studied >= RECON.spot || sim.knownSensors.has(c.id))) {
        c.spotted = true;
        out.spotted.push(c.id);
      }
      if (!c.timed && c.studied >= RECON.study) {
        c.timed = true;
        out.timed.push(c.id);
      }
    }
    return out;
  }

  /** Remember what a stone at this spot would turn. Replaces a reading at the same spot. */
  noteNoise(at: Vec2, sensors: string[], wary: boolean): void {
    const i = this.noise.findIndex((n) => dist(n.at, at) < 4);
    const entry = { at: { x: at.x, y: at.y }, sensors: [...sensors], wary };
    if (i >= 0) this.noise[i] = entry; else this.noise.push(entry);
  }
}

/** Is this world point inside the camera's cone at time t (its own sweep, no stones)? */
export function coversAt(s: Sensor, p: Vec2, time: number): boolean {
  const d = s.data;
  let facing = d.facing;
  if (d.sweep > 0 && d.sweepPeriod > 0) {
    const phase = ((time / d.sweepPeriod) + d.sweepPhase) % 1;
    facing = d.facing + Math.sin(phase * Math.PI * 2) * d.sweep * (1 + VIGILANT.sweepGain * s.vigilance);
  }
  const bearing = Math.atan2(p.y - d.pos.y, p.x - d.pos.x);
  return Math.abs(angleDelta(facing + s.knockOffset, bearing)) <= d.fov / 2 + RECON.margin;
}

/** The furthest a camera ever looks either side of home, radians. */
function swing(s: Sensor): number {
  return s.data.sweep > 0 ? s.data.sweep * (1 + VIGILANT.sweepGain * s.vigilance) : 0;
}

/**
 * The way from here to there, as the plan draws it: straight, if nothing
 * solid is in the way; otherwise along the streets, the way a rider goes
 * round a block.
 */
export function planRoute(sim: Sim, from: Vec2, to: Vec2): Vec2[] {
  if (!sim.world.blocked(from, to, 0)) return [{ ...from }, { ...to }];
  const a = sim.world.nearestRoadNode(from, 60), b = sim.world.nearestRoadNode(to, 60);
  const via = a && b ? sim.world.pathPoints(a.id, b.id) : [];
  if (!via.length) return [{ ...from }, { ...to }];
  return [{ ...from }, ...via.map((p) => ({ ...p })), { ...to }];
}

/** The first `metres` of a route. */
export function routeHead(route: Vec2[], metres: number): Vec2[] {
  const out: Vec2[] = [{ ...route[0] }];
  let left = metres;
  for (let i = 1; i < route.length && left > 0; i++) {
    const a = route[i - 1], b = route[i];
    const l = dist(a, b);
    if (l <= left) { out.push({ ...b }); left -= l; continue; }
    const t = left / l;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    left = 0;
  }
  return out;
}

/** Length of a route, metres. */
export function routeLength(route: Vec2[]): number {
  let l = 0;
  for (let i = 1; i < route.length; i++) l += dist(route[i - 1], route[i]);
  return l;
}

/** Points every `RECON.sample` metres along a route, with how far along each is. */
export function routeSamples(route: Vec2[]): Exposed[] {
  const out: Exposed[] = [{ p: { ...route[0] }, s: 0 }];
  let s0 = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const l = dist(a, b);
    const n = Math.max(1, Math.ceil(l / RECON.sample));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, s: s0 + l * t });
    }
    s0 += l;
  }
  return out;
}

/** How far along a route a point is, metres: its nearest point on the line. */
export function distanceAlong(route: Vec2[], p: Vec2): number {
  let best = Infinity, at = 0, s0 = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const vx = b.x - a.x, vy = b.y - a.y;
    const l2 = vx * vx + vy * vy;
    const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    const d = Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y);
    if (d < best) { best = d; at = s0 + Math.sqrt(l2) * t; }
    s0 += Math.sqrt(l2);
  }
  return at;
}

/**
 * Every live camera that could ever see some part of the way: in range, a
 * clear line, and inside the arc it swings through.
 */
export function barriers(sim: Sim, route: Vec2[]): Barrier[] {
  const pts = routeSamples(route);
  const total = Math.max(1e-6, pts[pts.length - 1].s);
  const out: Barrier[] = [];
  for (const s of sim.sensors) {
    if (!sensorActive(s) || s.state === 'MISALIGNED') continue;
    const d = s.data;
    const reach = swing(s) + d.fov / 2 + RECON.margin;
    const exposed: Exposed[] = [];
    for (const e of pts) {
      if (dist(d.pos, e.p) > d.range) continue;
      const bearing = Math.atan2(e.p.y - d.pos.y, e.p.x - d.pos.x);
      if (Math.abs(angleDelta(d.facing, bearing)) > reach) continue;
      if (sim.world.blocked(d.pos, e.p, d.height)) continue;
      exposed.push(e);
    }
    if (!exposed.length) continue;
    out.push({ sensorId: d.id, exposed, along: exposed[0].s / total, sweeps: d.sweep > 0 && d.sweepPeriod > 0 });
  }
  return out.sort((a, b) => a.along - b.along);
}

/**
 * Setting off at time `t0` from `sAt` metres along the route at cruising
 * speed, does the rider cross every stretch this camera covers while it is
 * looking somewhere else?
 */
function slipsPast(s: Sensor, exposed: Exposed[], t0: number, sAt: number): boolean {
  for (const e of exposed) {
    if (e.s < sAt) continue;
    if (coversAt(s, e.p, t0 + (e.s - sAt) / RECON.cruise)) return false;
  }
  return true;
}

/**
 * The gap: of each sweep, how many seconds of setting off get a rider
 * past this camera unseen. Zero for a fixed camera on the route, and for a
 * sweeping one that never looks away from some part of the line.
 */
export function gapSeconds(s: Sensor, exposed: Exposed[], sAt = 0): number {
  const d = s.data;
  if (!(d.sweep > 0 && d.sweepPeriod > 0)) return 0;
  const n = RECON.phaseSamples;
  const ok: boolean[] = [];
  for (let i = 0; i < n; i++) ok.push(slipsPast(s, exposed, ((i / n) - d.sweepPhase) * d.sweepPeriod, sAt));
  if (ok.every(Boolean)) return d.sweepPeriod;
  let best = 0, run = 0;
  for (let i = 0; i < n * 2; i++) {
    if (ok[i % n]) { run++; best = Math.max(best, Math.min(run, n)); } else run = 0;
  }
  return (best / n) * d.sweepPeriod;
}

/**
 * Right now, from `sAt` metres along: is it a good moment to go, and how
 * long until that changes? Live timing for the step being executed.
 */
export function gapNow(s: Sensor, exposed: Exposed[], time: number, sAt = 0): { go: boolean; flipsIn: number } {
  const now = slipsPast(s, exposed, time, sAt);
  const period = s.data.sweepPeriod > 0 ? s.data.sweepPeriod : 1;
  for (let k = 1; k <= 120; k++) {
    const dt = (k / 120) * period;
    if (slipsPast(s, exposed, time + dt, sAt) !== now) return { go: now, flipsIn: dt };
  }
  return { go: now, flipsIn: Infinity };
}

/** Turned to look at a stone here, would this camera see none of the way? */
export function turnClears(s: Sensor, at: Vec2, exposed: Exposed[]): boolean {
  const d = s.data;
  const facing = Math.atan2(at.y - d.pos.y, at.x - d.pos.x);
  return exposed.every((e) => Math.abs(angleDelta(facing, Math.atan2(e.p.y - d.pos.y, e.p.x - d.pos.x))) > d.fov / 2 + RECON.margin);
}

/** The height above which a camera cannot see a rider at all: over it is a route. */
export const overHeight = (s: Sensor): number => s.data.height + ABOVE_LENS;

/**
 * Turn the intel into an approach.
 *
 * Each camera on the way, in the order the rider meets it, gets the best
 * answer the recon supports: a stone the player has found that turns it off
 * the way; failing that, a gap they have timed; failing that, the
 * warning that it never looks away (`covered`). A camera on
 * the way that was never timed is an `unknown` step — the plan is committed
 * with a hole in it, and the screen said so before PLAN was pressed.
 */
export function draftPlan(sim: Sim, recon: Recon, from: Vec2, to: Vec2, label: string | null = null): CommittedPlan {
  const route = planRoute(sim, from, to);
  const steps: PlanStep[] = [];
  for (const b of barriers(sim, route)) {
    const s = sim.sensorById.get(b.sensorId)!;
    const base = { sensorId: b.sensorId, along: b.along, done: false };
    if (!recon.timed(b.sensorId)) { steps.push({ kind: 'unknown', ...base }); continue; }
    const stone = recon.noise.find((n) => !n.wary && n.sensors.includes(b.sensorId) && turnClears(s, n.at, b.exposed));
    if (stone) { steps.push({ kind: 'distract', at: { ...stone.at }, gap: RECON.stoneTurn, ...base }); continue; }
    const gap = gapSeconds(s, b.exposed);
    if (b.sweeps && gap >= RECON.minGap) { steps.push({ kind: 'gap', gap, exposed: b.exposed, ...base }); continue; }
    steps.push({ kind: 'covered', ...base });
  }
  steps.push({ kind: 'target', along: 1, done: false });
  return {
    from: { ...from }, target: { ...to }, route, length: routeLength(route), label, steps,
    status: 'executing', failure: null, elapsed: 0,
  };
}

/** How far along the planned way a point sits, 0..1. */
function progress(plan: CommittedPlan, p: Vec2): number {
  return plan.length < 1e-6 ? 1 : Math.min(1, distanceAlong(plan.route, p) / plan.length);
}

/**
 * One tick of execution. Returns the new status if it changed this tick.
 *
 * `seenBy` is everything that has the rider in its picture right now.
 */
export function stepPlan(sim: Sim, plan: CommittedPlan, seenBy: string[], dt: number): PlanStatus | null {
  if (plan.status !== 'executing') return null;
  plan.elapsed += dt;
  const me = sim.player.pos;
  const along = progress(plan, me);

  // Steps tick off as they happen: a stone has turned its camera, the rider
  // is past the stretch a camera covers.
  for (const st of plan.steps) {
    if (st.done || st.kind === 'target') continue;
    const s = st.sensorId ? sim.sensorById.get(st.sensorId) : undefined;
    if (st.kind === 'distract' && s && s.attend && s.attendBlend >= RECON.turned) st.done = true;
    else if (st.kind !== 'distract' && along > st.along + 0.08) st.done = true;
  }

  if (seenBy.length) {
    const id = seenBy[0];
    plan.status = 'blown';
    plan.failure = { sensorId: id, reason: failReason(sim, plan, id) };
    return 'blown';
  }
  if (dist(me, plan.target) <= RECON.arrive) {
    for (const st of plan.steps) st.done = true;
    plan.status = 'held';
    return 'held';
  }
  return null;
}

/** Why the camera that saw the rider saw them. */
function failReason(sim: Sim, plan: CommittedPlan, id: string): FailReason {
  const st = plan.steps.find((x) => x.sensorId === id);
  if (!st) return sim.sensorById.has(id) ? 'offRoute' : 'unscouted';
  if (st.kind === 'unknown') return 'unscouted';
  if (st.kind === 'gap') return 'mistimed';
  if (st.kind === 'covered') return 'inCone';
  // A distraction: either the stone never turned it, or the place had heard
  // too many stones and it looked back up the throw instead.
  const s = sim.sensorById.get(id);
  const attending = !!s?.attend && s.attendBlend > 0;
  if (attending && dist(s!.attend!, st.at ?? s!.attend!) > 3) return 'lookedBack';
  // It had turned (the step ticked off), and it came back round.
  if (st.done) return 'woreOff';
  return attending ? 'turning' : 'unturned';
}

/** The step the rider is on: the first not yet done. */
export function currentStep(plan: CommittedPlan): PlanStep | null {
  return plan.steps.find((s) => !s.done) ?? null;
}
