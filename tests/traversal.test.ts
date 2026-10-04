/**
 * Grinds, ramps, and the second floor of the town.
 *
 * The skating model's tuning is not touched by any of this, so these tests
 * are about what was laid on top of it: the town's rails, ledges, benches
 * and walls can be ground; GRIND pops on the ground and catches in the air;
 * a grind rides to the end, can be popped out of, and pays out; a kicker is
 * a slope you ride up and leave with air that grows with speed; roofs can
 * be landed on and rolled off; a rider above a camera is not in its picture;
 * and nobody is ever left inside a wall.
 */
import { describe, expect, it } from 'vitest';
import { makeSim, place, step } from './harness';
import { emptyIntent, type Intent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { buildBellhaven } from '../src/content/bellhaven';
import { grindsFor, type GrindLine } from '../src/sim/traversal/grinds';
import { ABOVE_LENS, makeSensor, observe } from '../src/sim/surveillance/sensors';
import type { Sim } from '../src/sim/sim';
import type { Subject } from '../src/sim/surveillance/types';

const grindPress = (held = true): Intent => { const i = emptyIntent(); i.grind = held; i.grindPressed = true; return i; };

/** Roll at a line along its length, `lead` metres before it starts, on the ground. */
function approach(sim: Sim, l: GrindLine, lead = 5, speed = 9): void {
  const ux = (l.b.x - l.a.x) / l.len, uy = (l.b.y - l.a.y) / l.len;
  place(sim, { x: l.a.x - ux * lead, y: l.a.y - uy * lead }, { x: ux * speed, y: uy * speed });
}

/** A long, free rail in the lot, to grind in tests. */
const lotRail = (sim: Sim) => sim.grinds.find((g) => g.kind === 'rail' && Math.abs(g.a.y - 215) < 0.1)!;

/** Ride `frames`, pressing GRIND at `at`, and say what happened. */
function ride(sim: Sim, at: number, frames = 200, intent: (i: number) => Intent | null = () => null) {
  const names: string[] = [];
  let ended = -1, seconds = 0;
  sim.bus.on('player:grind', (e) => names.push(e.name));
  sim.bus.on('player:grindEnd', (e) => { ended = sim.tick; seconds = e.seconds; });
  for (let i = 0; i < frames; i++) {
    const it = intent(i) ?? (i === at ? grindPress() : emptyIntent());
    sim.step(TICK_DT, it, null);
  }
  return { names, ended, seconds };
}

describe('the town can be ground', () => {
  const data = buildBellhaven();
  const lines = grindsFor(data);

  it('finds rails, ledges, benches and the Channel walls', () => {
    const kinds = new Set(lines.map((l) => l.kind));
    for (const k of ['rail', 'ledge', 'bench', 'wall'] as const) expect(kinds.has(k)).toBe(true);
    expect(lines.length).toBeGreaterThan(40);
  });

  it('keeps every line at a height a board can get to', () => {
    for (const l of lines) {
      expect(l.z).toBeGreaterThan(0.3);
      expect(l.z).toBeLessThanOrEqual(2.6);
      expect(l.len).toBeGreaterThanOrEqual(1.2);
    }
  });

  it('builds the lot: rails, a ledge and four kickers off the road', () => {
    const lot = (p: { x: number; y: number }) => p.x > 296 && p.x < 404 && p.y > 182 && p.y < 248;
    expect(lines.filter((l) => lot(l.a)).length).toBeGreaterThanOrEqual(5);
    expect(data.features.filter((f) => f.kind === 'kicker' && lot(f.poly[0])).length).toBe(4);
  });
});

describe('grinding', () => {
  it('pops on the ground and catches the rail on the way up', () => {
    const sim = makeSim();
    const l = lotRail(sim);
    approach(sim, l, 1.5);
    const r = ride(sim, 0, 40, (i) => (i === 0 ? grindPress() : (() => { const x = emptyIntent(); x.grind = true; return x; })()));
    expect(r.names.length).toBe(1);
    expect(sim.grind?.line.id ?? null).toBe(r.ended < 0 ? l.id : null);
  });

  it('rides the line at its height, going its way', () => {
    const sim = makeSim();
    const l = lotRail(sim);
    approach(sim, l, 1.5);
    ride(sim, 0, 30);
    expect(sim.grind).not.toBeNull();
    expect(sim.player.z).toBeCloseTo(l.z, 5);
    const ux = (l.b.x - l.a.x) / l.len;
    expect(Math.sign(sim.player.vel.x)).toBe(Math.sign(ux));
  });

  it('rides to the end, hops off, and says how long it was on', () => {
    const sim = makeSim();
    const l = lotRail(sim);
    approach(sim, l, 1.5);
    const r = ride(sim, 0, 60 * 6);
    expect(r.ended).toBeGreaterThan(0);
    expect(r.seconds).toBeGreaterThan(l.len / 16);
    expect(sim.grind).toBeNull();
  });

  it('lets an ollie pop you out early', () => {
    const sim = makeSim();
    const l = lotRail(sim);
    approach(sim, l, 1.5);
    ride(sim, 0, 25);
    expect(sim.grind).not.toBeNull();
    const o = emptyIntent(); o.olliePressed = true;
    sim.step(TICK_DT, o, null);
    expect(sim.grind).toBeNull();
    expect(sim.player.stance).toBe('AIR');
    expect(sim.player.vz).toBeGreaterThan(4);
  });

  it('does not catch a line the board is going across', () => {
    const sim = makeSim();
    const l = lotRail(sim);
    const mid = { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
    place(sim, { x: mid.x, y: mid.y - 3 }, { x: 0, y: 9 });
    const r = ride(sim, 0, 40, () => grindPress());
    expect(r.names.length).toBe(0);
  });

  it('cannot be done on foot', () => {
    const sim = makeSim();
    const l = lotRail(sim);
    approach(sim, l, 1.5, 4);
    sim.player.onBoard = false;
    sim.player.stance = 'FOOT';
    const r = ride(sim, 0, 30, () => grindPress());
    expect(r.names.length).toBe(0);
  });

  it('lights the line the board is heading for', () => {
    const sim = makeSim();
    const l = lotRail(sim);
    approach(sim, l, 4);
    step(sim, 0.05);
    expect(sim.grindNear?.id).toBe(l.id);
  });

  it('leaves the skating alone when nobody presses it', () => {
    const a = makeSim(), b = makeSim();
    const l = lotRail(a);
    approach(a, l, 1.5); approach(b, l, 1.5);
    step(a, 2); step(b, 2);
    expect(a.player.pos).toEqual(b.player.pos);
    expect(a.grind).toBeNull();
  });
});

describe('ramps', () => {
  const kickerRun = (speed: number) => {
    const sim = makeSim();
    // The lot's west kicker faces east; ride at it from the west.
    place(sim, { x: 300, y: 215 }, { x: speed, y: 0 });
    let maxZ = 0, airborne = 0, bailed = false;
    for (let i = 0; i < 120; i++) {
      sim.step(TICK_DT, emptyIntent(), null);
      maxZ = Math.max(maxZ, sim.player.z);
      if (sim.player.stance === 'AIR') airborne += TICK_DT;
      if (sim.player.bailedThisTick) bailed = true;
    }
    return { maxZ, airborne, bailed };
  };

  it('is a slope you ride up and leave with air', () => {
    const r = kickerRun(10);
    expect(r.maxZ).toBeGreaterThan(2);
    expect(r.airborne).toBeGreaterThan(0.6);
    expect(r.bailed).toBe(false);
  });

  it('gives more air for more speed', () => {
    expect(kickerRun(11).maxZ).toBeGreaterThan(kickerRun(6).maxZ);
  });

  it('is tall enough to be worth riding at', () => {
    const data = buildBellhaven();
    for (const f of data.features.filter((x) => x.kind === 'kicker')) {
      expect(f.rise).toBeGreaterThan(0.5);
    }
  });
});

describe('roofs are part of the town', () => {
  const flatRoof = (sim: Sim, min = 5) => {
    const b = sim.world.data.buildings
      .filter((x) => x.kind === 'shop' && x.height >= min && x.poly.length === 4)
      .sort((p, q) => area(p.poly) - area(q.poly))[0];
    return b;
  };

  it('lands a board on a flat roof and rolls it there', () => {
    const sim = makeSim();
    const b = flatRoof(sim);
    const c = centroid(b.poly);
    place(sim, c, { x: 2, y: 0 });
    sim.player.z = b.height + 2;
    sim.player.stance = 'AIR';
    sim.player.vz = 0;
    let roof = 0;
    sim.bus.on('player:roof', (e) => { roof = e.height; });
    step(sim, 1);
    expect(roof).toBeCloseTo(b.height);
    expect(sim.player.stance).toBe('ROLL');
    expect(sim.player.z).toBeCloseTo(b.height);
    expect(sim.player.ground).toBeCloseTo(b.height);
  });

  it('rolls off the edge and comes down in the street', () => {
    const sim = makeSim();
    const b = flatRoof(sim);
    const c = centroid(b.poly);
    place(sim, c, { x: 9, y: 0 });
    sim.player.z = b.height;
    sim.player.ground = b.height;
    let wentAir = false;
    for (let i = 0; i < 60 * 8; i++) {
      sim.step(TICK_DT, emptyIntent(), null);
      if (sim.player.stance === 'AIR') wentAir = true;
      if (wentAir && sim.player.stance !== 'AIR') break;
    }
    expect(wentAir).toBe(true);
    expect(sim.player.ground).toBe(0);
    expect(sim.player.z).toBe(0);
  });

  it('never makes a ledge or a kerb into a roof', () => {
    const sim = makeSim();
    const ledge = sim.world.data.buildings.find((x) => x.height < 1)!;
    expect(sim.world.supportAt(centroid(ledge.poly), 3)).toBe(0);
  });

});

describe('over the top of a camera', () => {
  it('cannot see a rider above its own mount', () => {
    const data = buildBellhaven();
    const sd = data.sensors.find((s) => s.kind === 'street')!;
    const sensor = makeSensor(sd);
    const sim = makeSim();
    const ahead = { x: sd.pos.x + Math.cos(sd.facing) * 6, y: sd.pos.y + Math.sin(sd.facing) * 6 };
    const subj: Subject = { ...sim.playerSubject, pos: ahead, vel: { x: 0, y: 0 }, speed: 1, z: 0 };
    const seen = observe(sensor, subj, sim.world, 1, { daylight: 1 }, sim.rng);
    // Only meaningful if the street position is in its view to begin with.
    if (seen) {
      const over = observe(sensor, { ...subj, z: sd.height + ABOVE_LENS + 0.2 }, sim.world, 1, { daylight: 1 }, sim.rng);
      expect(over).toBeNull();
    }
    const low = observe(sensor, { ...subj, z: 0.8 }, sim.world, 1, { daylight: 1 }, sim.rng);
    expect(!!low).toBe(!!seen);
  });
});

function centroid(poly: Array<{ x: number; y: number }>) {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / poly.length, y: y / poly.length };
}
function area(poly: Array<{ x: number; y: number }>) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(a / 2);
}

describe('nobody is ever stuck inside a building', () => {
  it('pushes a rider found deep inside a building out to the nearest edge', () => {
    // The reported bug: a launch came down through a house roof, the wall
    // refused to move the rider more than six metres, and they stayed in it.
    const sim = makeSim();
    const big = sim.world.data.buildings
      .filter((b) => b.height > 3 && b.kind !== 'house')
      .sort((a, b) => area(b.poly) - area(a.poly))[0];
    place(sim, centroid(big.poly), { x: 0, y: 0 });
    sim.player.z = 0;
    step(sim, 0.1);
    expect(sim.world.insideSolid(sim.player.pos, sim.player.z + 0.14)).toBeNull();
  });

  it('survives a spread of random jumps and grinds without leaving anyone in a wall', () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    const lines = makeSim().grinds;
    for (let k = 0; k < 50; k++) {
      const sim = makeSim();
      const l = lines[Math.floor(rnd() * lines.length)];
      approach(sim, l, 1 + rnd() * 4, 6 + rnd() * 6);
      if (sim.world.insideSolid(sim.player.pos, 0.2)) continue;
      const hold = Math.floor(rnd() * 90);
      for (let i = 0; i < 240; i++) {
        const it = emptyIntent();
        it.grind = i < hold; it.grindPressed = i === 0;
        it.olliePressed = i === hold + 20;
        sim.step(TICK_DT, it, null);
        expect(sim.world.insideSolid(sim.player.pos, sim.player.z + 0.2)).toBeNull();
      }
    }
  });
});

