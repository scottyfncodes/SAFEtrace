/**
 * Trouble: stones have consequences, and the consequences escalate.
 *
 * Heat climbs with what is done and who saw it; the police respond by
 * level, from nobody to everybody; out of sight it cools; caught, the
 * board and the sling are taken away for longer each time, and given back.
 */
import { describe, expect, it } from 'vitest';
import { makeSim, place, step } from './harness';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { HEAT, HOME, Trouble, heatLevel } from '../src/sim/trouble';
import type { Sim } from '../src/sim/sim';

const hit = (sim: Sim, kind: string, targetId?: string) => {
  sim.bus.emit('projectile:impact', { kind: kind as never, pos: { ...sim.player.pos }, targetId, z: 1, speed: 20, vel: { x: 1, y: 0 } });
  sim.bus.flush();
};
const npcNear = (sim: Sim) => sim.npcs[0];
const tick = (sim: Sim, t: Trouble, seconds: number, intent = emptyIntent) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) { sim.step(TICK_DT, intent(), null); t.step(TICK_DT); }
};

describe('heat', () => {
  it('climbs a long way for hitting a person, who always saw you', () => {
    const sim = makeSim();
    const t = new Trouble(sim);
    hit(sim, 'person', npcNear(sim).id);
    expect(t.heat).toBeCloseTo(HEAT.person, 5);
    hit(sim, 'person', npcNear(sim).id);
    expect(t.level).toBe(3);
  });

  it('counts an unseen bin for very little', () => {
    const sim = makeSim();
    // Out in the far corner of town, where nobody is looking.
    place(sim, { x: 552, y: 492 });
    step(sim, 0.1);
    const t = new Trouble(sim);
    const bin = sim.world.data.props.find((p) => p.kind === 'bin')!;
    hit(sim, 'prop', bin.id);
    expect(t.heat).toBeLessThan(HEAT.prop);
    expect(t.heat).toBeGreaterThan(0);
  });

  it('is worst of all for hitting an officer', () => {
    const sim = makeSim();
    const t = new Trouble(sim);
    hit(sim, 'person', sim.patrols[0].id);
    expect(t.level).toBeGreaterThanOrEqual(2);
    expect(HEAT.officer).toBeGreaterThan(HEAT.person);
  });

  it('names five levels', () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(2.5)).toBe(2);
    expect(heatLevel(9)).toBe(5);
  });
});

describe('the police respond by level', () => {
  it('sends one officer, running, at WANTED — and two and a drone at PURSUIT', () => {
    const sim = makeSim();
    const t = new Trouble(sim);
    t.heat = 3.2;
    tick(sim, t, 0.1);
    expect(t.units.length).toBe(1);
    expect(sim.orderedPatrols).toEqual(t.units);
    t.heat = 4.2;
    tick(sim, t, 0.1);
    expect(t.units.length).toBe(Math.min(2, sim.patrols.length));
    expect(t.drones.length).toBe(1);
  });

  it('moves the officer toward the rider', () => {
    const sim = makeSim();
    const t = new Trouble(sim);
    t.heat = 3.5;
    tick(sim, t, 0.05);
    const cop = sim.patrols.find((p) => p.id === t.units[0])!;
    const d0 = Math.hypot(cop.pos.x - sim.player.pos.x, cop.pos.y - sim.player.pos.y);
    tick(sim, t, 3);
    const d1 = Math.hypot(cop.pos.x - sim.player.pos.x, cop.pos.y - sim.player.pos.y);
    expect(d1).toBeLessThan(d0);
  });

  it('cools out of sight and stands everybody down', () => {
    const sim = makeSim();
    place(sim, { x: 552, y: 492 });
    const t = new Trouble(sim);
    t.heat = 3.1;
    tick(sim, t, 0.1);
    expect(t.units.length).toBe(1);
    // Keep the officer away and the rider unseen: cooling is the rule under test.
    for (let i = 0; i < 60 * 40; i++) {
      for (const id of t.units) { const c = sim.patrols.find((p) => p.id === id)!; c.pos = { x: 20, y: 20 }; }
      sim.step(TICK_DT, emptyIntent(), null); t.step(TICK_DT);
    }
    expect(t.level).toBeLessThan(2);
    expect(t.units.length).toBe(0);
    expect(sim.orderedPatrols.length).toBe(0);
  });
});

describe('busted', () => {
  const catchRider = (sim: Sim, t: Trouble) => {
    t.heat = 3.5;
    tick(sim, t, 0.05);
    const cop = sim.patrols.find((p) => p.id === t.units[0])!;
    for (let i = 0; i < 60; i++) {
      cop.pos = { x: sim.player.pos.x + 0.5, y: sim.player.pos.y };
      sim.step(TICK_DT, emptyIntent(), null); t.step(TICK_DT);
      if (t.isGrounded) break;
    }
  };

  it('walks you home and takes the board and the sling', () => {
    const sim = makeSim();
    place(sim, { x: 300, y: 150 });
    const t = new Trouble(sim);
    catchRider(sim, t);
    expect(t.isGrounded).toBe(true);
    expect(t.takeNotes().some((n) => n.kind === 'busted')).toBe(true);
    expect(sim.player.pos).toEqual(HOME);
    expect(sim.player.onBoard).toBe(false);
    expect(t.heat).toBe(0);
    expect(sim.orderedPatrols.length).toBe(0);
  });

  it('will not let you back on the board or throw anything while grounded', () => {
    const sim = makeSim();
    const t = new Trouble(sim);
    catchRider(sim, t);
    const stance = () => { const i = emptyIntent(); i.toggleStance = true; return i; };
    tick(sim, t, 0.2, stance);
    expect(sim.player.onBoard).toBe(false);
    const sling = () => { const i = emptyIntent(); i.aim = true; i.drawAmount = 1; i.firePressed = true; i.fire = true; return i; };
    tick(sim, t, 0.5, sling);
    expect(sim.projectiles.length).toBe(0);
  });

  it('can be caught on foot only when slow enough to grab', () => {
    const sim = makeSim();
    const t = new Trouble(sim);
    t.heat = 3.5;
    tick(sim, t, 0.05);
    const cop = sim.patrols.find((p) => p.id === t.units[0])!;
    sim.player.speed = 10;
    sim.player.vel = { x: 10, y: 0 };
    cop.pos = { x: sim.player.pos.x + 0.5, y: sim.player.pos.y };
    t.step(TICK_DT); t.step(TICK_DT);
    expect(t.isGrounded).toBe(false);
  });

  it('gives it all back when the time is up — later every time', () => {
    const sim = makeSim();
    const t = new Trouble(sim);
    const lengths: number[] = [];
    for (let k = 0; k < 3; k++) {
      catchRider(sim, t);
      lengths.push(t.groundedLeft);
      tick(sim, t, t.groundedLeft + 0.2);
      expect(t.isGrounded).toBe(false);
      expect(sim.player.onBoard).toBe(true);
      expect(sim.grounded).toBe(false);
      expect(t.takeNotes().some((n) => n.kind === 'returned')).toBe(true);
    }
    expect(lengths).toEqual(HEAT.groundedFor);
  });

  it('remembers a grounding across a reload', () => {
    const sim = makeSim();
    const t = new Trouble(sim, { busts: 1, groundedLeft: 40 });
    expect(t.isGrounded).toBe(true);
    expect(sim.player.onBoard).toBe(false);
  });
});

describe('the story is left to the story', () => {
  it('stands the afternoon\'s own police down only while trouble runs', () => {
    const sim = makeSim();
    const t = new Trouble(sim);
    expect(sim.troubleActive).toBe(true);
    t.dispose();
    expect(sim.troubleActive).toBe(false);
  });
});

describe('glass', () => {
  it('breaks a window when a stone goes into a wall at window height, and counts it', () => {
    const sim = makeSim();
    const t = new Trouble(sim);
    let glass = 0;
    sim.bus.on('world:glass', () => { glass++; });
    // A shop front on Northgate Parade, thrown at from the street.
    const shop = sim.world.data.buildings.find((b) => b.kind === 'shop')!;
    const xs = shop.poly.map((q) => q.x), ys = shop.poly.map((q) => q.y);
    const target = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.max(...ys) + 0.01 };
    place(sim, { x: target.x, y: target.y + 12 });
    sim.projectiles.push({
      id: 999, pos: { x: target.x, y: target.y + 3 }, z: 2, vel: { x: 0, y: -25 }, vz: 0, life: 3,
      origin: { x: target.x, y: target.y + 12 }, shape: { size: 1, squash: 1, spin: 0, jag: 1, phase: 0 },
      trail: [], bounces: 0, rolling: false, touched: false,
    });
    tick(sim, t, 0.3);
    expect(glass).toBe(1);
    expect(sim.damage.some((d) => d.kind === 'pane')).toBe(true);
    expect(t.heat).toBeGreaterThan(0);
  });
});
