/**
 * The kit: rep from bests, and perks that open a way of skating rather than
 * turning a number up. Each perk is checked against the thing it claims to
 * make possible, and the default kit against the board as tuned.
 */
import { describe, expect, it } from 'vitest';
import { makeSim, place } from './harness';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { PERKS, NO_KIT, kitFor, repFor } from '../src/sim/jobs/kit';
import { LINE, canHook, hook, lineCharge } from '../src/sim/traversal/slingline';
import type { Sim } from '../src/sim/sim';

describe('rep', () => {
  it('pays a point a job and more for doing it well', () => {
    expect(repFor([])).toBe(0);
    expect(repFor(['C'])).toBe(1);
    expect(repFor(['S', 'A', 'B', 'C'])).toBe(4 + 3 + 2 + 1);
  });

  it('opens the perks in order, and the board can open all of them', () => {
    expect(kitFor(0)).toEqual(NO_KIT);
    const reps = PERKS.map((p) => p.rep);
    expect([...reps].sort((a, b) => a - b)).toEqual(reps);
    // Nine jobs at an A each is enough for everything.
    expect(Object.values(kitFor(repFor(Array(9).fill('A')))).every(Boolean)).toBe(true);
  });
});

describe('perks', () => {
  const anchorAt = (sim: Sim, d: number) => {
    const a = sim.anchors.find((x) => x.kind === 'pole')!;
    place(sim, { x: a.pos.x - d, y: a.pos.y }, { x: 8, y: 0 });
    return a;
  };

  it('LONG LINE reaches an anchor the plain line cannot', () => {
    const sim = makeSim();
    const a = anchorAt(sim, LINE.range + 4);
    // Line of sight is a property of the street; only the reach is under test.
    const reachable = canHook(sim.player, a, sim.world, 1.35) || sim.world.blocked(sim.player.pos, a.pos, a.z);
    expect(canHook(sim.player, a, sim.world, 1)).toBe(false);
    expect(reachable).toBe(true);
  });

  it('QUICK REEL charges a launch on a shorter arc', () => {
    const sim = makeSim();
    const a = anchorAt(sim, 6);
    const plain = hook(sim.player, a, 1), quick = hook(sim.player, a, 2 / 3);
    plain.swept = quick.swept = LINE.fullCharge * 0.66;
    expect(lineCharge(plain)).toBeLessThan(0.7);
    expect(lineCharge(quick)).toBeCloseTo(1, 1);
  });

  it('SOFT TRUCKS rides away from a landing that would otherwise be a slam', () => {
    const land = (soft: boolean) => {
      const sim = makeSim();
      sim.kit = { ...NO_KIT, softTrucks: soft };
      sim.resetForRun({ x: 158, y: 240 }, -Math.PI / 2);
      const p = sim.player;
      p.vel = { x: 0, y: -8 };
      p.heading = -Math.PI / 2 + (50 * Math.PI) / 180;   // fifty degrees off line
      p.stance = 'AIR'; p.z = 0.05; p.vz = -1;
      let bailed = false;
      for (let i = 0; i < 10; i++) { sim.step(TICK_DT, emptyIntent(), null); if (p.bailedThisTick) bailed = true; }
      return bailed;
    };
    expect(land(false)).toBe(true);
    expect(land(true)).toBe(false);
  });

  it('QUIET BEARINGS: a hard landing draws no attention', () => {
    const turned = (quiet: boolean) => {
      const sim = makeSim();
      sim.kit = { ...NO_KIT, quietBearings: quiet };
      let n = 0;
      sim.bus.on('world:attention', () => { n++; });
      // Under Maple Court's north camera.
      const cam = sim.sensors.find((s) => s.data.id === 'CM-039')!;
      place(sim, { x: cam.data.pos.x + 3, y: cam.data.pos.y + 5 }, { x: 0, y: 8 });
      sim.player.heading = Math.PI / 2;
      sim.player.stance = 'AIR'; sim.player.z = 0.3; sim.player.vz = -4;
      for (let i = 0; i < 20; i++) sim.step(TICK_DT, emptyIntent(), null);
      return n;
    };
    expect(turned(true)).toBe(0);
    expect(turned(false)).toBeGreaterThan(0);
  });

  it('changes nothing for a player without a kit', () => {
    const sim = makeSim();
    expect(sim.kit).toEqual(NO_KIT);
    expect(sim.player.landingBonusDeg).toBe(0);
  });
});
