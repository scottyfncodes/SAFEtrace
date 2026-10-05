/**
 * The improvements pass (docs/47): today's conditions, the board's first
 * three, and the presentation hooks that teach the sling and land the match.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeSim, place, step } from './harness';
import { JOBS, jobUnlocked } from '../src/content/jobs';
import { JOB } from '../src/content/copy';
import { JobRun } from '../src/sim/jobs/run';
import { CONDITIONS, applyCondition, camerasDown, conditionFor, dayIndex } from '../src/sim/jobs/conditions';
import { wrapAngle } from '../src/core/math';
import { skate } from './harness';

const read = (f: string) => readFileSync(f, 'utf8');

describe("today's conditions", () => {
  it('cycles through every condition, and the same day is always the same condition', () => {
    const d = dayIndex(2026, 9, 5);
    const three = [conditionFor(d), conditionFor(d + 1), conditionFor(d + 2)].map((c) => c.id);
    expect(new Set(three).size).toBe(3);
    expect(conditionFor(d).id).toBe(conditionFor(d + 3).id);
    expect(conditionFor(d)).toBe(conditionFor(d));
  });

  it('takes some cameras down for maintenance, a different set each day, and never one a job is about', () => {
    const sim = makeSim();
    const targets = new Set(JOBS.flatMap((j) => j.stages.flatMap((s) => s.points.map((p) => p.sensorId))).filter(Boolean));
    const a = camerasDown(sim, CONDITIONS.MAINTENANCE, 100, JOBS);
    const b = camerasDown(sim, CONDITIONS.MAINTENANCE, 101, JOBS);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThan(sim.sensors.length / 2);
    expect(a.some((id) => targets.has(id))).toBe(false);
    expect(a.join()).not.toBe(b.join());
    expect(camerasDown(sim, CONDITIONS.CLEAR, 100, JOBS)).toEqual([]);
  });

  it('puts the downed cameras out for the whole run, and they see nothing', () => {
    const sim = makeSim();
    const r = new JobRun(sim, JOBS[0], JOB.run);
    applyCondition(sim, CONDITIONS.MAINTENANCE, 100, JOBS);
    const down = new Set(camerasDown(sim, CONDITIONS.MAINTENANCE, 100, JOBS));
    step(sim, 30);
    r.step(1);
    for (const s of sim.sensors) if (down.has(s.data.id)) expect(s.state).toBe('OFFLINE');
    expect(sim.playerSightings().ids.some((id) => down.has(id))).toBe(false);
  });

  it('makes every picture worse at dusk', () => {
    // Somewhere a camera has the rider, in ordinary light and then at dusk.
    const quality = (daylight: number) => {
      const sim = makeSim();
      sim.daylight = daylight;
      let best = 0;
      for (const s of sim.sensors.slice(0, 40)) {
        const p = { x: s.data.pos.x + Math.cos(s.data.facing) * 6, y: s.data.pos.y + Math.sin(s.data.facing) * 6 };
        place(sim, p);
        step(sim, 0.4);
        best = Math.max(best, sim.playerSightings().quality);
        if (best > 0) return best;
      }
      return best;
    };
    const clear = quality(CONDITIONS.CLEAR.daylight);
    const dusk = quality(CONDITIONS.DUSK.daylight);
    expect(clear).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(clear);
  });
});

describe('the first minute', () => {
  it('opens the board on air, a ride across town, and a stone through a camera', () => {
    const open = JOBS.filter((j) => jobUnlocked(j, 0)).map((j) => j.kind);
    expect(open).toEqual(['PHOTOGRAPH', 'COURIER', 'SABOTAGE']);
  });

  it('can be won by pushing straight ahead from the start, unseen', () => {
    // The first thing a new player does is air off the Lot: hold push and go.
    const sim = makeSim();
    const r = new JobRun(sim, JOBS[0], JOB.run);
    let air = 0;
    for (let i = 0; i < 40 && r.status === 'running'; i++) { skate(sim, 0.25); r.step(0.25); air = Math.max(air, sim.player.z); }
    expect(r.status).toBe('complete');
    expect(air).toBeGreaterThan(1.4);
    expect(r.exposure.level).toBe('UNSEEN');
  });

  it('starts the first job pointed at a kicker, a short skate away', () => {
    const j = JOBS[0];
    const near = j.stages[0].points.map((p) => ({
      d: Math.hypot(p.pos.x - j.start.pos.x, p.pos.y - j.start.pos.y),
      off: Math.abs(wrapAngle(Math.atan2(p.pos.y - j.start.pos.y, p.pos.x - j.start.pos.x) - j.start.heading)),
    })).sort((a, b) => a.d - b.d)[0];
    expect(near.d).toBeLessThan(100);
    expect(near.off).toBeLessThan(Math.PI / 6);
  });
});

describe('the presentation hooks', () => {
  it('lands the false positive on Devon and in the frame, in the system\'s own words', () => {
    const main = read('src/main.ts');
    expect(main).toMatch(/bus\.on\('match:false-positive'[\s\S]{0,200}lockOnDevon\(SYSTEM\.matchSubject[\s\S]{0,120}frame\.hold\(FRAME\.match/);
  });

  it('teaches the sling on the button until a stone has been thrown, once per browser', () => {
    const main = read('src/main.ts');
    expect(main).toMatch(/teachSling = this\.touchPrimary && !slingTaught\(\)/);
    expect(main).toMatch(/player:fire[\s\S]{0,200}teachSling = false/);
    expect(read('src/render/controls.ts')).toMatch(/private drawSlingLesson/);
  });

  it('thins the town and raises the hum while the system is looking, and is silent while it is not', () => {
    const audio = read('src/audio/audio.ts');
    expect(audio).toMatch(/watch \* 0\.035/);
    expect(read('src/ui/frame.ts')).toMatch(/get watchLevel/);
  });
});
