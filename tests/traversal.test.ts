/**
 * The sling line and the second floor of the town.
 *
 * The skating model is not touched by any of this, so these tests are about
 * what was added on top: anchors exist where a player would look for them,
 * a hook catches and a swing charges, a full swing launches higher and faster
 * than any ollie, the extra speed bleeds away once the wheels are down, flat
 * roofs can be landed on and rolled off, and a rider above a camera is not
 * in its picture.
 */
import { describe, expect, it } from 'vitest';
import { makeSim, place, step } from './harness';
import { emptyIntent, type Intent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { buildBellhaven } from '../src/content/bellhaven';
import { poleLineFor, POLE_H } from '../src/sim/traversal/poleLine';
import { anchorsFor, MAST_MIN_ROOF, type Anchor } from '../src/sim/traversal/anchors';
import { LINE } from '../src/sim/traversal/slingline';
import { TUNE } from '../src/sim/player';
import { ABOVE_LENS, makeSensor, observe } from '../src/sim/surveillance/sensors';
import type { Sim } from '../src/sim/sim';
import type { Subject } from '../src/sim/surveillance/types';

const hookIntent = (pressed: boolean): Intent => {
  const i = emptyIntent();
  i.hook = true;
  i.hookPressed = pressed;
  return i;
};

/** A pole, and a line along the road past it, a few metres off on the road side. */
function passPole(sim: Sim, index: number, offset = 5, lead = 16, speed = 10): Anchor {
  const pole = poleLineFor(sim.world.data).poles[index];
  const a = sim.anchors.find((x) => x.kind === 'pole' && Math.hypot(x.pos.x - pole.at.x, x.pos.y - pole.at.y) < 0.01)!;
  const dir = { x: Math.cos(pole.rot), y: Math.sin(pole.rot) };
  let n = { x: -dir.y, y: dir.x };
  if (sim.world.surfaceAt({ x: a.pos.x + n.x * offset, y: a.pos.y + n.y * offset }) !== 'asphalt') n = { x: -n.x, y: -n.y };
  place(sim, { x: a.pos.x + n.x * offset - dir.x * lead, y: a.pos.y + n.y * offset - dir.y * lead }, { x: dir.x * speed, y: dir.y * speed });
  return a;
}

/** Ride, hook on frame `at`, hold for `hold` frames, then coast. Returns what happened. */
function swing(sim: Sim, at: number, hold: number, total = 260) {
  let maxZ = 0, maxSpeed = 0, charge = -1, hooked: string | null = null, landedOn = -1, bailed = false;
  sim.bus.on('line:hook', (e) => { hooked = e.anchorId; });
  sim.bus.on('line:release', (e) => { charge = e.charge; });
  for (let i = 0; i < total; i++) {
    const it = i >= at && i < at + hold ? hookIntent(i === at) : emptyIntent();
    sim.step(TICK_DT, it, null);
    maxZ = Math.max(maxZ, sim.player.z);
    maxSpeed = Math.max(maxSpeed, sim.player.speed);
    if (sim.player.landedThisTick && landedOn < 0) landedOn = sim.player.ground;
    if (sim.player.bailedThisTick) bailed = true;
  }
  return { maxZ, maxSpeed, charge, hooked: hooked as string | null, landedOn, bailed };
}

describe('anchors are the town the player can already see', () => {
  const data = buildBellhaven();
  const anchors = anchorsFor(data);

  it('makes every pole in the pole line hookable, at the crossarm', () => {
    const poles = poleLineFor(data).poles;
    expect(poles.length).toBeGreaterThan(30);
    for (const p of poles) {
      const a = anchors.find((x) => Math.hypot(x.pos.x - p.at.x, x.pos.y - p.at.y) < 1.5);
      expect(a).toBeDefined();
    }
    for (const a of anchors.filter((x) => x.kind === 'pole')) expect(a.z).toBeCloseTo(POLE_H - 0.6);
  });

  it('puts masts only on flat roofs worth getting onto', () => {
    const masts = anchors.filter((a) => a.kind === 'mast');
    expect(masts.length).toBeGreaterThan(5);
    for (const m of masts) {
      const b = data.buildings.find((x) => x.id === m.buildingId)!;
      expect(b.kind).not.toBe('house');
      expect(b.height).toBeGreaterThanOrEqual(MAST_MIN_ROOF);
      expect(m.z).toBeGreaterThan(b.height);
    }
  });

  it('hangs a line off the cameras on poles, not the ones on porches', () => {
    const cams = anchors.filter((a) => a.kind === 'camera');
    expect(cams.length).toBeGreaterThan(10);
    for (const c of cams) {
      const s = data.sensors.find((x) => x.id === c.sensorId)!;
      expect(['porch', 'doorbell', 'reader']).not.toContain(s.kind);
    }
  });

  it('leaves no stretch of street without something to hook', () => {
    // Every road node within a hook of an anchor, or nearly every one: the
    // city is the skatepark, and a skatepark has no dead ends.
    let covered = 0;
    for (const n of data.roadNodes) {
      if (anchors.some((a) => Math.hypot(a.pos.x - n.pos.x, a.pos.y - n.pos.y) <= LINE.range + 6)) covered++;
    }
    expect(covered / data.roadNodes.length).toBeGreaterThan(0.85);
  });
});

describe('the sling line', () => {
  it('brackets an anchor ahead, and a press hooks it', () => {
    const sim = makeSim();
    const a = passPole(sim, 10);
    step(sim, 0.1);
    expect(sim.anchorTarget?.id).toBe(a.id);
    sim.step(TICK_DT, hookIntent(true), null);
    expect(sim.line?.anchor.id).toBe(a.id);
  });

  it('honours a press made a moment before anything was in reach', () => {
    const sim = makeSim();
    passPole(sim, 10, 5, 30);
    sim.step(TICK_DT, hookIntent(true), null);
    for (let i = 0; i < 40 && !sim.line; i++) sim.step(TICK_DT, hookIntent(false), null);
    // Either it was in reach already, or the buffer caught it when it came in.
    expect(sim.line).not.toBeNull();
  });

  it('turns a committed arc into a launch no ollie can match', () => {
    const sim = makeSim();
    passPole(sim, 10);
    const r = swing(sim, 10, 80);
    expect(r.hooked).not.toBeNull();
    expect(r.charge).toBeGreaterThan(0.9);
    // An ollie tops out under a metre. A full swing is a storey or two.
    expect(r.maxZ).toBeGreaterThan(4);
    expect(r.maxSpeed).toBeGreaterThan(TUNE.maxSpeed + TUNE.flowSpeedBonus);
    expect(r.bailed).toBe(false);
  });

  it('makes a flick past a pole a hop, not a launch', () => {
    const sim = makeSim();
    passPole(sim, 10);
    const r = swing(sim, 10, 12);
    expect(r.charge).toBeLessThan(0.25);
    expect(r.maxZ).toBeLessThan(1.6);
  });

  it('charges with the arc and nothing else', () => {
    const short = makeSim(); passPole(short, 10);
    const long = makeSim(); passPole(long, 10);
    const a = swing(short, 10, 40), b = swing(long, 10, 70);
    expect(b.charge).toBeGreaterThan(a.charge);
    expect(b.maxZ).toBeGreaterThan(a.maxZ);
  });

  it('lets go on its own if held round and round', () => {
    const sim = makeSim();
    passPole(sim, 10);
    let released = false;
    sim.bus.on('line:release', (e) => { released = e.snapped; });
    for (let i = 0; i < 60 * (LINE.maxHold + 0.5); i++) sim.step(TICK_DT, hookIntent(i === 10), null);
    expect(released).toBe(true);
    expect(sim.line).toBeNull();
  });

  it('will not catch the anchor it has just let go of', () => {
    const sim = makeSim();
    const a = passPole(sim, 10);
    swing(sim, 10, 30, 45);
    expect(sim.anchorTarget?.id ?? null).not.toBe(a.id);
  });

  it('cannot be used on foot', () => {
    const sim = makeSim();
    passPole(sim, 10, 5, 10, 3);
    sim.player.onBoard = false;
    sim.player.stance = 'FOOT';
    sim.step(TICK_DT, hookIntent(true), null);
    expect(sim.anchorTarget).toBeNull();
    expect(sim.line).toBeNull();
  });

  it('bleeds the extra speed away once the wheels are down', () => {
    const sim = makeSim();
    passPole(sim, 10);
    swing(sim, 10, 80, 200);
    step(sim, 4);
    expect(sim.player.capBoost).toBeLessThan(0.5);
    expect(sim.player.speed).toBeLessThanOrEqual(TUNE.maxSpeed + TUNE.flowSpeedBonus + 0.6);
  });

  it('leaves the skating alone when nobody touches it', () => {
    // Same seed, same inputs, no hook: nothing about the line may have moved
    // the board. (Determinism over the whole sim is tested elsewhere.)
    const a = makeSim(), b = makeSim();
    passPole(a, 10); passPole(b, 10);
    step(a, 2); step(b, 2);
    expect(a.player.pos).toEqual(b.player.pos);
    expect(a.player.capBoost).toBe(0);
    expect(a.line).toBeNull();
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

  it('gets a rider from the street onto a roof with a mast', () => {
    /*
     * The moment the game is built round: a mast on a roof, hooked from the
     * street, swung round, and let go — and the board comes down on top of
     * the building. Searched rather than hand-placed, so it holds whatever
     * the town's layout does, as long as it is possible somewhere.
     */
    const data = buildBellhaven();
    const masts = anchorsFor(data).filter((a) => a.kind === 'mast');
    let made: string | null = null;
    search: for (const m of masts) {
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        for (const r of [14, 18, 22]) {
          const sim = makeSim();
          const start = { x: m.pos.x + Math.cos(ang) * r, y: m.pos.y + Math.sin(ang) * r };
          if (sim.world.buildingAt(start) || sim.world.surfaceAt(start) === 'grass') continue;
          // Riding across the line to the mast, so the swing is round it.
          const tang = ang + Math.PI / 2;
          place(sim, start, { x: Math.cos(tang) * 10, y: Math.sin(tang) * 10 });
          step(sim, 1 / 60);
          if (sim.anchorTarget?.id !== m.id) continue;
          for (const hold of [40, 55, 70]) {
            const s2 = makeSim();
            place(s2, start, { x: Math.cos(tang) * 10, y: Math.sin(tang) * 10 });
            const res = swing(s2, 1, hold, 240);
            if (res.hooked === m.id && res.landedOn > 0 && !res.bailed) { made = m.id; break search; }
          }
        }
      }
    }
    expect(made).not.toBeNull();
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
