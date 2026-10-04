/**
 * Jobs: the loop the reshape is built round.
 *
 * GET A JOB → FIND A ROUTE → SKATE IT → MANAGE SURVEILLANCE → IMPROVISE →
 * COMPLETE/ESCAPE → SCORE → TRY A BETTER ROUTE.
 *
 * These pin the parts of that loop that are logic: attention rises and falls
 * the way the HUD says it does and never ends a run; a chase is sent and
 * called off; every job on the board is possible in the town as built; and a
 * run is scored on four separate axes.
 */
import { describe, expect, it } from 'vitest';
import { makeSim, place, step } from './harness';
import { TICK_DT } from '../src/core/loop';
import { buildBellhaven } from '../src/content/bellhaven';
import { JOBS, jobUnlocked } from '../src/content/jobs';
import { JOB } from '../src/content/copy';
import { grindsFor } from '../src/sim/traversal/grinds';
import { EXPOSURE, makeExposure, stepExposure } from '../src/sim/jobs/exposure';
import { STYLE, bailChain, gradeFor, makeTally, scoreMove, stepTally, styleTotal, totalFor } from '../src/sim/jobs/score';
import { JobRun } from '../src/sim/jobs/run';
import type { JobDef } from '../src/sim/jobs/types';
import { pointInPoly } from '../src/core/math';

const run = (sim: ReturnType<typeof makeSim>, def: JobDef) => new JobRun(sim, def, JOB.run);
const job = (kind: JobDef['kind']) => JOBS.find((j) => j.kind === kind)!;
function tick(sim: ReturnType<typeof makeSim>, r: JobRun, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) { sim.step(TICK_DT, emptyish(), null); r.step(TICK_DT); }
}
import { emptyIntent } from '../src/core/input';
const emptyish = () => emptyIntent();

describe('exposure', () => {
  it('climbs SPOTTED, TRACKED, UNDERWATCH while something has a good picture', () => {
    const e = makeExposure();
    const seen: string[] = [];
    for (let i = 0; i < 60 * 6; i++) seen.push(...stepExposure(e, 0.8, TICK_DT));
    expect(seen).toEqual(['spotted', 'tracked', 'underwatch']);
    expect(e.level).toBe('UNDERWATCH');
  });

  it('lets a glance fade on its own', () => {
    const e = makeExposure();
    for (let i = 0; i < 30; i++) stepExposure(e, 0.5, TICK_DT);
    expect(e.level).toBe('SPOTTED');
    for (let i = 0; i < 60 * 4; i++) stepExposure(e, 0, TICK_DT);
    expect(e.level).toBe('UNSEEN');
  });

  it('holds a track for a few seconds out of sight, then drops it all at once', () => {
    const e = makeExposure(60);
    expect(e.level).toBe('TRACKED');
    const changes: string[] = [];
    for (let i = 0; i < 60 * (EXPOSURE.holdTracked - 0.5); i++) changes.push(...stepExposure(e, 0, TICK_DT));
    expect(e.level).toBe('TRACKED');
    for (let i = 0; i < 60; i++) changes.push(...stepExposure(e, 0, TICK_DT));
    expect(changes).toContain('lost');
    expect(e.value).toBeLessThan(EXPOSURE.tracked);
    expect(e.losses).toBe(1);
  });

  it('counts the share of the run spent in somebody\'s picture', () => {
    const e = makeExposure();
    for (let i = 0; i < 60; i++) stepExposure(e, 0.4, TICK_DT);
    for (let i = 0; i < 180; i++) stepExposure(e, 0, TICK_DT);
    expect(e.seenTime / e.totalTime).toBeCloseTo(0.25, 2);
  });
});

describe('style', () => {
  it('chains moves inside the window and multiplies them', () => {
    const t = makeTally();
    scoreMove(t, 100);
    stepTally(t, 1, 8, false);
    scoreMove(t, 100);
    stepTally(t, 1, 8, false);
    scoreMove(t, 100);
    expect(t.multiplier).toBe(3);
    expect(styleTotal(t)).toBe(100 + 200 + 300);
  });

  it('banks a chain once things go quiet, and a bail loses only what was not banked', () => {
    const t = makeTally();
    scoreMove(t, 500);
    stepTally(t, STYLE.chainWindow + 0.1, 8, false);
    expect(t.banked).toBe(500);
    scoreMove(t, 300);
    expect(bailChain(t)).toBe(300);
    expect(styleTotal(t)).toBe(500);
  });

  it('never holds the bank while the board is in the air', () => {
    const t = makeTally();
    scoreMove(t, 500);
    stepTally(t, STYLE.chainWindow + 1, 12, true);
    expect(t.pending).toBe(500);
  });

  it('can be won loud or quiet', () => {
    // A stylish, fast, seen run and a slow, unseen, smooth one both clear a B.
    const loud = totalFor(5000, 50, 60, 0.6, 0.9);
    const quiet = totalFor(600, 80, 60, 0, 0.8);
    expect(gradeFor(loud)).not.toBe('C');
    expect(gradeFor(quiet)).not.toBe('C');
  });
});

describe('the board', () => {
  const data = buildBellhaven();
  const lines = grindsFor(data);
  const kickers = data.features.filter((f) => f.kind === 'kicker');
  const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
  };

  it('offers every kind of job', () => {
    const kinds = new Set(JOBS.map((j) => j.kind));
    for (const k of ['COURIER', 'TAG', 'EXTRACTION', 'PHOTOGRAPH', 'SABOTAGE', 'GHOST', 'SPEEDRUN', 'GETAWAY'] as const) {
      expect(kinds.has(k)).toBe(true);
    }
  });

  it('numbers jobs in order and opens them a few at a time', () => {
    JOBS.forEach((j, i) => expect(j.number).toBe(i + 1));
    expect(JOBS.filter((j) => jobUnlocked(j, 0)).length).toBe(3);
    expect(JOBS.every((j) => jobUnlocked(j, JOBS.length))).toBe(true);
  });

  it('starts every job on open ground', () => {
    for (const j of JOBS) {
      const b = data.buildings.find((x) => x.height > 0.5 && pointInPoly(x.poly, j.start.pos));
      expect({ job: j.id, inside: b?.id ?? null }).toEqual({ job: j.id, inside: null });
    }
  });

  it('puts every point somewhere it can be done: the street, a line to grind, a ramp to air', () => {
    for (const j of JOBS) {
      for (const st of j.stages) {
        for (const p of st.points) {
          if (p.sensorId) { expect(data.sensors.some((s) => s.id === p.sensorId)).toBe(true); continue; }
          const b = data.buildings.find((x) => pointInPoly(x.poly, p.pos));
          if (p.minZ === undefined) {
            expect({ job: j.id, point: p.id, building: b && b.height > 0.5 ? b.id : null })
              .toEqual({ job: j.id, point: p.id, building: null });
          } else {
            expect({ job: j.id, point: p.id, roof: !!b }).toEqual({ job: j.id, point: p.id, roof: true });
            expect(b!.height).toBeGreaterThanOrEqual(p.minZ - 0.01);
            expect(b!.kind).not.toBe('house');
          }
          // A grind point has a line inside its reach; an air point has a ramp.
          if (p.grind) expect({ point: p.id, line: lines.some((l) => segDist(p.pos, l.a, l.b) <= p.radius) }).toEqual({ point: p.id, line: true });
          if (p.air !== undefined) {
            expect({ point: p.id, ramp: kickers.some((k) => k.poly.some((q) => Math.hypot(q.x - p.pos.x, q.y - p.pos.y) <= p.radius + 2)) })
              .toEqual({ point: p.id, ramp: true });
          }
        }
      }
    }
  });

  it('says what to do in a line each', () => {
    for (const j of JOBS) {
      expect(j.title.length).toBeLessThanOrEqual(40);
      expect(j.brief.split('. ').length).toBeLessThanOrEqual(3);
      expect(j.target).toBeGreaterThan(20);
    }
  });
});

describe('a run', () => {
  it('starts the rider where the job says, on a clean street', () => {
    const sim = makeSim();
    step(sim, 2);
    sim.sensors[0].state = 'OFFLINE';
    const j = job('COURIER');
    const r = run(sim, j);
    expect(sim.player.pos).toEqual(j.start.pos);
    expect(sim.player.heading).toBe(j.start.heading);
    expect(sim.sensors[0].state).toBe('ONLINE');
    expect(r.takeCallouts().map((c) => c.text)).toContain(JOB.run.go);
  });

  it('finishes a courier job on arrival, and scores it on four axes', () => {
    const sim = makeSim();
    const j = job('COURIER');
    const r = run(sim, j);
    tick(sim, r, 1);
    place(sim, j.stages[0].points[0].pos);
    tick(sim, r, 0.1);
    expect(r.status).toBe('complete');
    const res = r.result!;
    expect(res.time).toBeGreaterThan(1);
    for (const k of ['style', 'time', 'exposure', 'flow', 'total'] as const) expect(Number.isFinite(res[k])).toBe(true);
    expect(['S', 'A', 'B', 'C']).toContain(res.grade);
  });

  it('only counts a grind point while grinding, and an air point in the air', () => {
    const sim = makeSim();
    const j = job('TAG');
    const r = run(sim, j);
    const pt = j.stages[0].points[0];
    place(sim, pt.pos);
    tick(sim, r, 0.2);
    expect(r.done.has(pt.id)).toBe(false);
    // On a line there: the plaza ledge.
    const l = sim.grinds.find((g) => Math.hypot((g.a.x + g.b.x) / 2 - pt.pos.x, (g.a.y + g.b.y) / 2 - pt.pos.y) < pt.radius)!;
    sim.grind = { line: l, t: l.len / 2, dir: 1, speed: 8, time: 0, name: '50-50' };
    r.step(TICK_DT);
    expect(r.done.has(pt.id)).toBe(true);

    const sim2 = makeSim();
    const air = job('PHOTOGRAPH');
    const r2 = run(sim2, air);
    const ap = air.stages[0].points[0];
    place(sim2, ap.pos);
    tick(sim2, r2, 0.1);
    expect(r2.status).toBe('running');
    sim2.player.stance = 'AIR'; sim2.player.z = ap.air! + 0.2;
    r2.step(TICK_DT);
    expect(r2.status).toBe('complete');
  });

  it('takes a sabotage camera out by stone, or by cutting its line in passing', () => {
    const sim = makeSim();
    const j = job('SABOTAGE');
    const r = run(sim, j);
    const [a, b, c] = j.stages[0].points;
    sim.sensorById.get(a.sensorId!)!.state = 'OFFLINE';          // a stone
    sim.sensorById.get(b.sensorId!)!.state = 'MISALIGNED';       // a knocked mount
    tick(sim, r, 0.1);
    expect(r.done.has(a.id)).toBe(true);
    expect(r.done.has(b.id)).toBe(true);
    expect(r.status).toBe('running');
    const pole = sim.sensorById.get(c.sensorId!)!.data.pos;
    place(sim, { x: pole.x + 1.5, y: pole.y }, { x: 6, y: 0 });
    tick(sim, r, 0.05);
    expect(sim.sensorById.get(c.sensorId!)!.state).toBe('OFFLINE');
    expect(r.status).toBe('complete');
  });

  it('never ends a run for being seen', () => {
    const sim = makeSim();
    const j = job('COURIER');
    const r = run(sim, j);
    r.exposure.value = 100;
    for (let i = 0; i < 60 * 20; i++) {
      r.exposure.unseenFor = 0;
      sim.step(TICK_DT, emptyIntent(), null);
      r.step(TICK_DT);
    }
    expect(r.status).toBe('running');
  });

  it('sends drones after a tracked rider and calls them off when the signal is lost', () => {
    const sim = makeSim();
    const j = job('GETAWAY');
    const r = run(sim, j);
    expect(r.exposure.level).toBe('UNDERWATCH');
    tick(sim, r, 0.2);
    expect(r.hunters.length).toBe(2);
    for (const id of r.hunters) expect(sim.drones.find((d) => d.id === id)!.task?.id).toBe(`HUNT-${id}`);
    // Somewhere nothing can see: under the Channel tunnel.
    let lost = false;
    for (let i = 0; i < 60 * 30 && !lost; i++) {
      place(sim, { x: 400, y: 450 });
      sim.step(TICK_DT, emptyIntent(), null);
      r.step(TICK_DT);
      if (r.takeCallouts().some((c) => c.text === JOB.run.lost)) lost = true;
    }
    expect(lost).toBe(true);
    expect(r.stageIndex).toBe(1);
    tick(sim, r, 8);
    expect(r.hunters.length).toBe(0);
  });

  it('makes lifting the drive loud', () => {
    const sim = makeSim();
    const j = job('EXTRACTION');
    const r = run(sim, j);
    const pt = j.stages[0].points[0];
    place(sim, pt.pos);
    tick(sim, r, 0.05);
    expect(r.stageIndex).toBe(1);
    expect(r.exposure.value).toBeGreaterThanOrEqual(EXPOSURE.tracked);
  });

  it('pays the board\'s moves into style', () => {
    const sim = makeSim();
    const r = run(sim, job('COURIER'));
    sim.bus.emit('player:trick', { pos: sim.player.pos, name: 'KICKFLIP' });
    sim.bus.emit('player:grind', { pos: sim.player.pos, name: 'CROOKED', kind: 'ledge' });
    sim.bus.emit('player:grindEnd', { pos: sim.player.pos, name: 'CROOKED', seconds: 2 });
    sim.bus.flush();
    expect(styleTotal(r.tally)).toBe(STYLE.trick + STYLE.grind * 2 + STYLE.grindPerSecond * 2 * 3);
    expect(r.lastMove?.label).toBe('CROOKED 2.0s');
    expect(r.tally.grinds).toBe(1);
  });

  it('lets go of everything when it is put away', () => {
    const sim = makeSim();
    const r = run(sim, job('GETAWAY'));
    tick(sim, r, 0.2);
    r.dispose();
    expect(sim.drones.every((d) => !d.task || !d.task.id.startsWith('HUNT-'))).toBe(true);
  });
});
