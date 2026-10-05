/**
 * Recon and the plan: BARRIER → RECON → INTEL → PLAN → EXECUTE.
 *
 * These pin the loop as logic. Looking at a camera on the plan long enough
 * learns it; PLAN turns what was learned into a committed approach; and the
 * town, not a script, decides whether the approach was right. A plan that
 * fails always fails for a reason the recon could have shown.
 */
import { describe, expect, it } from 'vitest';
import { makeSim, place, step } from './harness';
import { TICK_DT } from '../src/core/loop';
import { emptyIntent } from '../src/core/input';
import { angleDelta, type Vec2 } from '../src/core/math';
import type { Sim } from '../src/sim/sim';
import { NOISE_REACH } from '../src/sim/sim';
import { RECON, barriers as barriersOn, gapSeconds, planRoute, turnClears, gapNow } from '../src/sim/recon';

const barriers = (sim: Sim, from: Vec2, to: Vec2) => barriersOn(sim, planRoute(sim, from, to));
import { JobRun } from '../src/sim/jobs/run';
import { JOBS } from '../src/content/jobs';
import { JOB } from '../src/content/copy';
import { STYLE } from '../src/sim/jobs/score';

/** A way past the edge of CM-207's sweep on Northgate Lane: open for a few seconds each turn. */
const WINDOW = { cam: 'CM-207', from: { x: 129, y: 86 }, to: { x: 138, y: 73 } };
/**
 * Straight across CM-207's middle: it never looks away from this line. A
 * stone off to the east turns it away; one dropped by the way turns it to
 * look straight down it.
 */
const COVERED = { cam: 'CM-207', from: { x: 112, y: 78 }, to: { x: 145, y: 78 }, stone: { x: 155, y: 88 }, badStone: { x: 145, y: 80 } };

const planning = () => ({ ...emptyIntent(), planView: true });

/** Open the plan, put the middle of the map on a spot, and look at it. */
function recon(sim: Sim, centre: Vec2, seconds: number): void {
  sim.reconFocus = { centre, radius: 40 };
  step(sim, seconds, planning());
}

/** Close the plan. */
function closeRecon(sim: Sim): void {
  sim.reconFocus = null;
  step(sim, 0.05);
}

/** Ride a straight line at cruising speed until the plan resolves or the line ends. */
function ride(sim: Sim, from: Vec2, to: Vec2): void {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ux = (to.x - from.x) / len, uy = (to.y - from.y) / len;
  const v = { x: ux * RECON.cruise, y: uy * RECON.cruise };
  for (let s = 0; s <= len + 2; s += RECON.cruise * TICK_DT) {
    const k = Math.min(s, len);
    place(sim, { x: from.x + ux * k, y: from.y + uy * k }, v);
    sim.step(TICK_DT, emptyIntent(), null);
    if (sim.plan && sim.plan.status !== 'executing') return;
  }
}

/**
 * Stand at the start until the sweep says go — or, for going at the wrong
 * moment, until the camera will be looking square at the middle of the
 * stretch it covers just as the rider gets there.
 */
function waitFor(sim: Sim, cam: string, from: Vec2, to: Vec2, go: boolean): void {
  place(sim, from);
  const b = barriers(sim, from, to).find((x) => x.sensorId === cam)!;
  const s = sim.sensorById.get(cam)!;
  const mid = b.exposed[Math.floor(b.exposed.length / 2)];
  for (let i = 0; i < 60 * 30; i++) {
    if (go) {
      const w = gapNow(s, b.exposed, sim.time);
      if (w.go && w.flipsIn > 1) return;
    } else {
      const t = sim.time + mid.s / RECON.cruise;
      const d = s.data;
      const facing = d.facing + Math.sin((((t / d.sweepPeriod) + d.sweepPhase) % 1) * Math.PI * 2) * d.sweep;
      const off = Math.abs(angleDelta(facing, Math.atan2(mid.p.y - d.pos.y, mid.p.x - d.pos.x)));
      if (off < d.fov / 2 - 0.2) return;
    }
    sim.step(TICK_DT, emptyIntent(), null);
    place(sim, from);
  }
  throw new Error('the moment never came round');
}

function events(sim: Sim) {
  const seen: Array<{ k: string; d: unknown }> = [];
  for (const k of ['recon:intel', 'plan:committed', 'plan:held', 'plan:blown'] as const) {
    sim.bus.on(k, (d) => seen.push({ k, d }));
  }
  return seen;
}

describe('recon: what the plan view learns', () => {
  it('spots a camera held in the middle of the map, then learns its timing', () => {
    const sim = makeSim();
    place(sim, WINDOW.from);
    const ev = events(sim);
    const cam = sim.sensorById.get(WINDOW.cam)!;
    recon(sim, cam.data.pos, 1.2);
    expect(sim.recon.intelOn(WINDOW.cam)?.spotted).toBe(true);
    expect(sim.recon.timed(WINDOW.cam)).toBe(false);
    expect(sim.knownSensors.has(WINDOW.cam)).toBe(true);
    recon(sim, cam.data.pos, 1.5);
    expect(sim.recon.timed(WINDOW.cam)).toBe(true);
    expect(ev.filter((e) => e.k === 'recon:intel').map((e) => (e.d as { kind: string }).kind)).toContain('timed');
  });

  it('learns nothing with the plan closed, or about what is off the edge of the map', () => {
    const sim = makeSim();
    place(sim, WINDOW.from);
    sim.reconFocus = { centre: sim.sensorById.get(WINDOW.cam)!.data.pos, radius: 40 };
    step(sim, 3);
    expect(sim.recon.count()).toBe(0);
    recon(sim, { x: 40, y: 380 }, 3);
    expect(sim.recon.timed(WINDOW.cam)).toBe(false);
  });

  it('writes down what a stone at a pin would turn, and keeps it', () => {
    const sim = makeSim();
    const e = sim.probe(COVERED.stone);
    expect(e.stone).toContain(COVERED.cam);
    expect(sim.recon.noise.some((n) => n.sensors.includes(COVERED.cam))).toBe(true);
    sim.probe({ x: 40, y: 380 });
    expect(sim.recon.noise).toHaveLength(2);
  });

  it('finds the window a sweep leaves, and that a camera across its own middle has none', () => {
    const sim = makeSim();
    const bw = barriers(sim, WINDOW.from, WINDOW.to).find((b) => b.sensorId === WINDOW.cam)!;
    expect(gapSeconds(sim.sensorById.get(WINDOW.cam)!, bw.exposed)).toBeGreaterThan(2);
    const bc = barriers(sim, COVERED.from, COVERED.to).find((b) => b.sensorId === COVERED.cam)!;
    expect(gapSeconds(sim.sensorById.get(COVERED.cam)!, bc.exposed)).toBe(0);
    // Turned toward a stone behind it, it sees none of the way; toward one by the way, it still does.
    const s = sim.sensorById.get(COVERED.cam)!;
    expect(turnClears(s, COVERED.stone, bc.exposed)).toBe(true);
    expect(turnClears(s, COVERED.badStone, bc.exposed)).toBe(false);
  });
});

describe('PLAN: committing to an approach', () => {
  it('commits nothing when nothing watches the way', () => {
    const sim = makeSim();
    place(sim, { x: 40, y: 380 });
    const target = { x: 44, y: 384 };
    expect(barriers(sim, sim.player.pos, target)).toEqual([]);
    expect(sim.commitPlan(target)).toBeNull();
    expect(sim.plan).toBeNull();
  });

  it('commits with a hole in it when the barrier was never scouted', () => {
    const sim = makeSim();
    place(sim, WINDOW.from);
    const plan = sim.commitPlan(WINDOW.to)!;
    const st = plan.steps.find((s) => s.sensorId === WINDOW.cam)!;
    expect(st.kind).toBe('unknown');
    expect(plan.steps.at(-1)!.kind).toBe('target');
  });

  it('turns timed intel into a window step', () => {
    const sim = makeSim();
    place(sim, WINDOW.from);
    recon(sim, sim.sensorById.get(WINDOW.cam)!.data.pos, 2.5);
    closeRecon(sim);
    const plan = sim.commitPlan(WINDOW.to)!;
    const st = plan.steps.find((s) => s.sensorId === WINDOW.cam)!;
    expect(st.kind).toBe('gap');
    expect(st.gap!).toBeGreaterThan(2);
  });

  it('uses a stone only if the recon found one that turns the camera off the way', () => {
    const bad = makeSim();
    place(bad, COVERED.from);
    recon(bad, bad.sensorById.get(COVERED.cam)!.data.pos, 2.5);
    bad.probe(COVERED.badStone);
    closeRecon(bad);
    expect(bad.commitPlan(COVERED.to)!.steps.find((s) => s.sensorId === COVERED.cam)!.kind).toBe('covered');

    const good = makeSim();
    place(good, COVERED.from);
    recon(good, good.sensorById.get(COVERED.cam)!.data.pos, 2.5);
    good.probe(COVERED.stone);
    closeRecon(good);
    const st = good.commitPlan(COVERED.to)!.steps.find((s) => s.sensorId === COVERED.cam)!;
    expect(st.kind).toBe('distract');
    expect(st.at).toEqual(COVERED.stone);
  });

  it('puts the plan down when recon is reopened, and forgets everything on a new run', () => {
    const sim = makeSim();
    place(sim, WINDOW.from);
    recon(sim, sim.sensorById.get(WINDOW.cam)!.data.pos, 2.5);
    closeRecon(sim);
    sim.commitPlan(WINDOW.to);
    expect(sim.plan?.status).toBe('executing');
    recon(sim, WINDOW.from, 0.2);
    expect(sim.plan).toBeNull();
    sim.resetForRun(WINDOW.from, 0);
    expect(sim.recon.count()).toBe(0);
  });
});

describe('EXECUTE: the town decides if the recon was right', () => {
  it('holds when the rider goes in the window the recon found', () => {
    const sim = makeSim();
    place(sim, WINDOW.from);
    recon(sim, sim.sensorById.get(WINDOW.cam)!.data.pos, 2.5);
    closeRecon(sim);
    const ev = events(sim);
    waitFor(sim, WINDOW.cam, WINDOW.from, WINDOW.to, true);
    sim.commitPlan(WINDOW.to);
    ride(sim, WINDOW.from, WINDOW.to);
    expect(sim.plan!.status).toBe('held');
    expect(sim.plan!.steps.every((s) => s.done)).toBe(true);
    expect(ev.some((e) => e.k === 'plan:held')).toBe(true);
  });

  it('is blown as MISTIMED when the same rider goes when the window is shut', () => {
    const sim = makeSim();
    place(sim, WINDOW.from);
    recon(sim, sim.sensorById.get(WINDOW.cam)!.data.pos, 2.5);
    closeRecon(sim);
    waitFor(sim, WINDOW.cam, WINDOW.from, WINDOW.to, false);
    sim.commitPlan(WINDOW.to);
    ride(sim, WINDOW.from, WINDOW.to);
    expect(sim.plan!.status).toBe('blown');
    expect(sim.plan!.failure).toEqual({ sensorId: WINDOW.cam, reason: 'mistimed' });
  });

  it('is blown as UNSCOUTED when the camera that saw them was never timed', () => {
    const sim = makeSim();
    waitFor(sim, WINDOW.cam, WINDOW.from, WINDOW.to, false);
    sim.commitPlan(WINDOW.to);
    ride(sim, WINDOW.from, WINDOW.to);
    expect(sim.plan!.failure).toEqual({ sensorId: WINDOW.cam, reason: 'unscouted' });
  });

  it('holds across a camera that never looks away, once the stone the recon found has turned it', () => {
    const sim = makeSim();
    place(sim, COVERED.from);
    recon(sim, sim.sensorById.get(COVERED.cam)!.data.pos, 2.5);
    sim.probe(COVERED.stone);
    closeRecon(sim);
    sim.commitPlan(COVERED.to);
    // The stone lands where the recon said: the same noise a stone makes.
    sim.drawAttention(COVERED.stone, NOISE_REACH.ground, RECON.stoneTurn);
    step(sim, 1.1);
    expect(sim.plan!.steps.find((s) => s.kind === 'distract')!.done).toBe(true);
    ride(sim, COVERED.from, COVERED.to);
    expect(sim.plan!.failure).toBeNull();
    expect(sim.plan!.status).toBe('held');
  });

  it('is blown as caught MID-TURN when they throw and go in the same breath', () => {
    const sim = makeSim();
    // Square in front of it, heading back west.
    const start = { x: 145, y: 77 };
    place(sim, start);
    recon(sim, sim.sensorById.get(COVERED.cam)!.data.pos, 2.5);
    sim.probe(COVERED.stone);
    closeRecon(sim);
    sim.commitPlan(COVERED.from);
    expect(sim.plan!.steps.find((st) => st.sensorId === COVERED.cam)!.kind).toBe('distract');
    sim.drawAttention(COVERED.stone, NOISE_REACH.ground, RECON.stoneTurn);
    ride(sim, start, COVERED.from);
    expect(sim.plan!.failure).toEqual({ sensorId: COVERED.cam, reason: 'turning' });
  });

  it('is blown as WORE OFF when the stone turned it and they were too slow past it', () => {
    const sim = makeSim();
    place(sim, COVERED.from);
    recon(sim, sim.sensorById.get(COVERED.cam)!.data.pos, 2.5);
    sim.probe(COVERED.stone);
    closeRecon(sim);
    sim.commitPlan(COVERED.to);
    sim.drawAttention(COVERED.stone, NOISE_REACH.ground, RECON.stoneTurn);
    // Dawdle until the turn has run out, then go.
    step(sim, RECON.stoneTurn + 0.3);
    ride(sim, COVERED.from, COVERED.to);
    expect(sim.plan!.failure).toEqual({ sensorId: COVERED.cam, reason: 'woreOff' });
  });

  it('is blown as UNTURNED when the plan was a stone and none was thrown', () => {
    const sim = makeSim();
    place(sim, COVERED.from);
    recon(sim, sim.sensorById.get(COVERED.cam)!.data.pos, 2.5);
    sim.probe(COVERED.stone);
    closeRecon(sim);
    sim.commitPlan(COVERED.to);
    ride(sim, COVERED.from, COVERED.to);
    expect(sim.plan!.failure).toEqual({ sensorId: COVERED.cam, reason: 'unturned' });
  });

  it('is blown as IN CONE when the recon said it never looks away and they went anyway', () => {
    const sim = makeSim();
    place(sim, COVERED.from);
    recon(sim, sim.sensorById.get(COVERED.cam)!.data.pos, 2.5);
    closeRecon(sim);
    sim.commitPlan(COVERED.to);
    ride(sim, COVERED.from, COVERED.to);
    expect(sim.plan!.failure).toEqual({ sensorId: COVERED.cam, reason: 'inCone' });
  });

  it('pays a held plan in a job, as a move', () => {
    const sim = makeSim();
    const def = JOBS.find((j) => j.kind === 'COURIER')!;
    const run = new JobRun(sim, def, JOB.run);
    place(sim, WINDOW.from);
    recon(sim, sim.sensorById.get(WINDOW.cam)!.data.pos, 2.5);
    closeRecon(sim);
    waitFor(sim, WINDOW.cam, WINDOW.from, WINDOW.to, true);
    sim.commitPlan(WINDOW.to);
    ride(sim, WINDOW.from, WINDOW.to);
    run.step(TICK_DT);
    expect(sim.plan!.status).toBe('held');
    expect(run.lastMove?.label).toBe('PLAN HELD');
    expect(run.lastMove!.points).toBeGreaterThanOrEqual(STYLE.plan);
    run.dispose();
  });
});
