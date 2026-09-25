import { beforeEach, describe, expect, it } from 'vitest';
import { TouchEngine, type PointerSample } from '../src/core/touch';
import { InputManager, emptyIntent, type Intent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { THROW_FLOOR } from '../src/sim/sim';
import { makeSim, place, step } from './harness';

/**
 * The drag-back sling: taken out without leaving the street, pulled back from
 * anywhere on the right of the glass, and let go.
 *
 * It replaces a mode — stop, drop to first person, left thumb aims, right thumb
 * pulls, find the way back out — with a gesture. The first-person view is kept
 * as the classic option and as `F`'s steady aim on a desktop.
 */

const VIEWPORT = { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } };
let clock = 1000;
const at = (x: number, y: number, id = 1, t = clock): PointerSample => ({ id, x, y, t });

function engine(): TouchEngine {
  const e = new TouchEngine();
  e.setViewport(VIEWPORT);
  e.setThrowMode(true);
  return e;
}
const sling = (e: TouchEngine) => e.buttonLayout().find((b) => b.id === 'sling')!.pos;
function tap(e: TouchEngine, x: number, y: number, id = 1): void {
  e.handle('down', at(x, y, id)); clock += 80; e.handle('up', at(x, y, id));
}
function pull(e: TouchEngine, from: { x: number; y: number }, by: { x: number; y: number }, id = 3, steps = 10, ms = 30): void {
  e.handle('down', at(from.x, from.y, id));
  for (let i = 1; i <= steps; i++) {
    clock += ms;
    e.handle('move', at(from.x + by.x * i / steps, from.y + by.y * i / steps, id));
  }
}

beforeEach(() => { clock = 1000; });

describe('taking the sling out is not a mode', () => {
  it('takes it out and puts it away with SLING, and never asks for the aiming view', () => {
    const e = engine();
    const s = sling(e);
    tap(e, s.x, s.y);
    const i = e.sample();
    expect(e.isSlingOut).toBe(true);
    expect(i.aimModePressed).toBe(false);
    expect(e.visual.buttons.find((b) => b.id === 'sling')!.pressed).toBe(true);
    tap(e, s.x, s.y);
    expect(e.isSlingOut).toBe(false);
  });

  it('still opens the old aiming view in the classic scheme', () => {
    const e = engine();
    e.setThrowMode(false);
    const s = sling(e);
    tap(e, s.x, s.y);
    expect(e.sample().aimModePressed).toBe(true);
    expect(e.isSlingOut).toBe(false);
  });

  it('keeps the stick and the other buttons working with the sling out', () => {
    const e = engine();
    const s = sling(e);
    tap(e, s.x, s.y);
    e.sample();
    e.handle('down', at(90, 700, 2));
    clock += 16;
    e.handle('move', at(90, 640, 2));
    const i = e.sample();
    expect(i.moveVector).not.toBeNull();
    expect(i.push).toBe(true);
    for (const b of e.buttonLayout()) expect(e.zoneAt(b.pos.x, b.pos.y)).toBe(b.id);
  });

  it('leaves a drag on the plan to the plan, even with the sling out', () => {
    const e = engine();
    e.setSlingOut(true);
    e.setPlanOpen(true);
    expect(e.zoneAt(280, 300)).not.toBe('throw');
    e.setPlanOpen(false);
    expect(e.zoneAt(280, 300)).toBe('throw');
  });

  it('puts the sling away when there is nothing to throw with', () => {
    const e = engine();
    e.setSlingOut(true);
    expect(e.isSlingOut).toBe(true);
    e.setSlingAvailable(false);
    expect(e.isSlingOut).toBe(false);
  });
});

describe('pulling back', () => {
  it('reads a drag on the right of the glass as a pull, pointing the other way', () => {
    const e = engine();
    e.setSlingOut(true);
    pull(e, { x: 280, y: 300 }, { x: -20, y: 80 });
    const i = e.sample();
    expect(i.aim).toBe(true);
    expect(i.throwVector!.x).toBeCloseTo(20, 5);
    expect(i.throwVector!.y).toBeCloseTo(-80, 5);
    expect(i.drawAmount!).toBeGreaterThan(0.4);
    expect(e.visual.pull).not.toBeNull();
  });

  it('draws harder the further back it comes', () => {
    const a = engine(); a.setSlingOut(true);
    pull(a, { x: 280, y: 300 }, { x: 0, y: 40 });
    const b = engine(); b.setSlingOut(true);
    pull(b, { x: 280, y: 300 }, { x: 0, y: 110 });
    expect(b.sample().drawAmount!).toBeGreaterThan(a.sample().drawAmount!);
  });

  it('throws on release, along the pull as it was just before the thumb came off', () => {
    const e = engine();
    e.setSlingOut(true);
    // A steady pull straight back, then the thumb smears sideways as it lifts.
    pull(e, { x: 280, y: 300 }, { x: 0, y: 100 }, 3, 10, 30);
    e.sample();
    clock += 20; e.handle('move', at(300, 402, 3));
    clock += 20; e.handle('move', at(318, 404, 3));
    clock += 10; e.handle('up', at(322, 404, 3));
    const i = e.sample();
    expect(i.fire).toBe(true);
    expect(i.firePressed).toBe(true);
    expect(i.aim).toBe(true);
    // Straight ahead, not skewed by the lift.
    expect(Math.abs(i.throwVector!.x)).toBeLessThan(3);
    expect(i.throwVector!.y).toBeLessThan(-85);
    // And only once.
    expect(e.sample().fire).toBe(false);
  });

  it('does not throw a pull let back down to where it started — that is putting it down', () => {
    const e = engine();
    e.setSlingOut(true);
    pull(e, { x: 280, y: 300 }, { x: 0, y: 80 });
    for (let i = 1; i <= 10; i++) { clock += 30; e.handle('move', at(280, 380 - i * 8, 3)); }
    clock += 200; e.handle('move', at(280, 302, 3));
    clock += 100; e.handle('up', at(280, 302, 3));
    expect(e.sample().fire).toBe(false);
  });

  it('still lets a tap on the world be a tap, with the sling out', () => {
    const e = engine();
    e.setSlingOut(true);
    tap(e, 280, 300, 4);
    const i = e.sample();
    expect(i.fire).toBe(false);
    expect(e.takeTap()).toEqual({ x: 280, y: 300 });
  });
});

describe('the mouse: pull back, or point and hold', () => {
  class FakeTarget {
    private l = new Map<string, Set<(e: unknown) => void>>();
    addEventListener(t: string, f: (e: unknown) => void) { if (!this.l.has(t)) this.l.set(t, new Set()); this.l.get(t)!.add(f); }
    removeEventListener(t: string, f: (e: unknown) => void) { this.l.get(t)?.delete(f); }
    fire(t: string, d: Record<string, unknown> = {}) { for (const f of this.l.get(t) ?? []) f(d); }
  }
  const make = () => { const target = new FakeTarget(); const input = new InputManager(); input.attach(target as unknown as Window); return { target, input }; };

  it('reads a drag back as a pull: direction reversed, length as the draw', () => {
    const { target, input } = make();
    target.fire('mousemove', { clientX: 600, clientY: 300 });
    target.fire('mousedown', { button: 0, clientX: 600, clientY: 300 });
    target.fire('mousemove', { clientX: 600, clientY: 400 });
    const i = input.sample();
    expect(i.aim).toBe(true);
    expect(i.throwVector).toEqual({ x: 0, y: -100 });
    expect(i.drawAmount!).toBeGreaterThan(0.5);
    expect(input.pullLine).not.toBeNull();
    target.fire('mouseup', { button: 0 });
    const r = input.sample();
    expect(r.firePressed).toBe(true);
    expect(r.aim).toBe(true);
    expect(r.throwVector).toEqual({ x: 0, y: -100 });
  });

  it('reads a still hold as point-and-hold: no pull, the draw on its own clock', () => {
    const { target, input } = make();
    target.fire('mousemove', { clientX: 600, clientY: 300 });
    target.fire('mousedown', { button: 0, clientX: 600, clientY: 300 });
    target.fire('mousemove', { clientX: 604, clientY: 303 });
    const i = input.sample();
    expect(i.aim).toBe(true);
    expect(i.throwVector).toBeNull();
    expect(i.drawAmount).toBeNull();
  });

  it('does not read a drag as a pull while the first-person view is looking', () => {
    const { target, input } = make();
    input.options.dragThrow = false;
    target.fire('mousedown', { button: 0, clientX: 600, clientY: 300 });
    target.fire('mousemove', { clientX: 600, clientY: 420 });
    expect(input.sample().throwVector).toBeNull();
  });
});

describe('the simulation throws at the point it is given, at its height', () => {
  /** Hold a pull at `draw` aimed at `p`, `z` metres up, then let go. */
  function throwAt(sim: ReturnType<typeof makeSim>, p: { x: number; y: number }, z: number, draw: number, extra: Partial<Intent> = {}): void {
    for (let i = 0; i < 20; i++) {
      sim.step(TICK_DT, { ...emptyIntent(), aim: true, drawAmount: draw, aimHeight: z, throwVector: { x: 0, y: -50 }, ...extra }, p);
    }
    sim.step(TICK_DT, { ...emptyIntent(), aim: true, fire: true, firePressed: true, drawAmount: draw, aimHeight: z, throwVector: { x: 0, y: -50 }, ...extra }, p);
    for (let i = 0; i < 300 && sim.projectiles.length; i++) sim.step(TICK_DT, emptyIntent(), null);
  }

  it('hits a camera on its pole when the point is the lens, without any aiming view', () => {
    const sim = makeSim();
    const cam = sim.sensors.find((s) => {
      const from = { x: s.data.pos.x + Math.cos(s.data.facing) * 12, y: s.data.pos.y + Math.sin(s.data.facing) * 12 };
      return !sim.world.buildingAt(from) && !sim.world.blocked(from, s.data.pos, 1.6);
    })!;
    const from = { x: cam.data.pos.x + Math.cos(cam.data.facing) * 12, y: cam.data.pos.y + Math.sin(cam.data.facing) * 12 };
    place(sim, from);
    let hit: string | undefined;
    sim.bus.on('projectile:impact', ({ targetId }) => { if (targetId) hit = targetId; });
    throwAt(sim, cam.data.pos, cam.data.height, 0.8);
    expect(sim.aimMode).toBe(false);
    expect(hit).toBe(cam.data.id);
  });

  it('fires a short pull at something close — a flick is enough', () => {
    const sim = makeSim();
    const bin = sim.world.data.props.find((p) => p.kind === 'bin'
      && !sim.world.buildingAt({ x: p.pos.x + 10, y: p.pos.y })
      && !sim.world.blocked({ x: p.pos.x + 10, y: p.pos.y }, p.pos, 1.6))!;
    place(sim, { x: bin.pos.x + 10, y: bin.pos.y });
    throwAt(sim, bin.pos, 0.7, 0.05);
    // Whichever bin is first on that line goes over (in this street there are
    // two, one behind the other): the flick reached, flat and quick.
    expect(sim.world.data.props.some((p) => p.kind === 'bin' && p.knocked)).toBe(true);
    expect(THROW_FLOOR).toBeGreaterThan(0.3);
  });

  it('throws on the move, from a board that keeps rolling', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 }, { x: 0, y: 8 });
    let fired = false;
    sim.bus.on('player:fire', () => { fired = true; });
    throwAt(sim, { x: 158, y: 260 }, 0, 0.6, { moveVector: { x: 0, y: -1 } });
    expect(fired).toBe(true);
    expect(sim.aimMode).toBe(false);
    expect(sim.player.speed).toBeGreaterThan(0.5);
  });

  it('never goes near the aiming view to do any of it', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    let entered = false;
    sim.bus.on('aim:entered', () => { entered = true; });
    throwAt(sim, { x: 158, y: 240 }, 0, 0.5);
    step(sim, 0.5);
    expect(entered).toBe(false);
  });
});
