import { beforeEach, describe, expect, it } from 'vitest';
import { TOUCH_TUNING, TouchEngine, type PointerSample } from '../src/core/touch';
import { emptyIntent, mergeIntent } from '../src/core/input';
import { makeSim, place } from './harness';
import { TICK_DT } from '../src/core/loop';

/**
 * The touch vocabulary, rebuilt after two human sessions.
 *
 * The old one was a relative stick — horizontal offset steered a heading,
 * vertical offset was a throttle, an upward flick was an ollie — and every part
 * of it asked the player to model something invisible. The verdict after tuning
 * it was "a tiny bit better but still not fun or intuitive".
 *
 * The rule these tests hold to: a thumb names a direction, and everything else
 * is a button you can see.
 */
const VIEWPORT = { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } };

const STICK = { x: 90, y: 700 };
const WORLD = { x: 195, y: 240 };

let engine: TouchEngine;
let clock = 1000;

function make(): TouchEngine {
  const e = new TouchEngine();
  e.setViewport(VIEWPORT);
  e.setVisionAvailable(true);
  return e;
}

const at = (p: { x: number; y: number }, id = 1, t = clock): PointerSample => ({ id, x: p.x, y: p.y, t });

function drag(
  e: TouchEngine, id: number, points: Array<{ x: number; y: number }>, stepMs = 16,
): void {
  e.handle('down', at(points[0], id, clock));
  for (let i = 1; i < points.length; i++) {
    clock += stepMs;
    e.handle('move', at(points[i], id, clock));
  }
}

function tap(e: TouchEngine, p: { x: number; y: number }, id = 1): void {
  e.handle('down', at(p, id, clock));
  clock += 90;
  e.handle('up', at(p, id, clock));
}

const button = (e: TouchEngine, id: 'sling' | 'ollie' | 'vision') =>
  e.buttonLayout().find((b) => b.id === id)!.pos;

beforeEach(() => { engine = make(); clock = 1000; engine.setVisionAvailable(true); });

describe('zones', () => {
  it('gives the movement thumb the bottom-left and the buttons the bottom-right', () => {
    expect(engine.zoneAt(STICK.x, STICK.y)).toBe('stick');
    expect(engine.zoneAt(WORLD.x, WORLD.y)).toBe('idle');
    for (const id of ['sling', 'ollie', 'vision'] as const) {
      const p = button(engine, id);
      expect({ id, zone: engine.zoneAt(p.x, p.y) }).toEqual({ id, zone: id });
    }
  });

  it('keeps every button inside the safe area', () => {
    for (const b of engine.buttonLayout()) {
      expect(b.pos.x + b.radius).toBeLessThanOrEqual(VIEWPORT.w - VIEWPORT.safe.right);
      expect(b.pos.y + b.radius).toBeLessThanOrEqual(VIEWPORT.h - VIEWPORT.safe.bottom);
      expect(b.pos.x - b.radius).toBeGreaterThanOrEqual(VIEWPORT.safe.left);
    }
  });

  it('does not let the buttons overlap each other', () => {
    const bs = engine.buttonLayout();
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const d = Math.hypot(bs[i].pos.x - bs[j].pos.x, bs[i].pos.y - bs[j].pos.y);
        expect({ pair: `${bs[i].id}/${bs[j].id}`, clear: d > bs[i].radius + bs[j].radius })
          .toEqual({ pair: `${bs[i].id}/${bs[j].id}`, clear: true });
      }
    }
  });
});

describe('the stick names a direction', () => {
  it('points where the thumb points, not left or right of a heading', () => {
    drag(engine, 1, [STICK, { x: STICK.x, y: STICK.y - 60 }]);
    const up = engine.sample().moveVector!;
    expect(up.y).toBeLessThan(-0.9);
    expect(Math.abs(up.x)).toBeLessThan(0.05);
  });

  it('gives a magnitude, so a small push is a small move', () => {
    drag(engine, 1, [STICK, { x: STICK.x + 20, y: STICK.y }]);
    const small = Math.hypot(...Object.values(engine.sample().moveVector!) as [number, number]);
    engine = make();
    drag(engine, 1, [STICK, { x: STICK.x + 200, y: STICK.y }]);
    const big = Math.hypot(...Object.values(engine.sample().moveVector!) as [number, number]);
    expect(small).toBeLessThan(big);
    expect(big).toBeCloseTo(1, 1);
  });

  it('rolls on a thumb that lands and never moves, because that is a first touch', () => {
    engine.handle('down', at(STICK, 1, clock));
    const i = engine.sample();
    expect(i.push).toBe(true);
    expect(i.moveVector).toEqual({ x: 0, y: 0 });
  });

  it('re-centres if the thumb runs out of screen, so the stick is never unreachable', () => {
    drag(engine, 1, [STICK, { x: STICK.x + 400, y: STICK.y }]);
    const v = engine.visual.stick;
    expect(Math.hypot(v.thumb.x - v.anchor.x, v.thumb.y - v.anchor.y))
      .toBeLessThanOrEqual(TOUCH_TUNING.stickFull * 1.31);
  });

  it('allows only one stick, so a stray palm cannot fight the thumb', () => {
    engine.handle('down', at(STICK, 1, clock));
    engine.handle('down', at({ x: STICK.x + 30, y: STICK.y }, 2, clock));
    drag(engine, 2, [{ x: STICK.x + 30, y: STICK.y }, { x: STICK.x + 130, y: STICK.y }]);
    const v = engine.visual.stick;
    expect(v.anchor.x).toBeCloseTo(STICK.x, 0);
  });
});

describe('the buttons are the whole rest of the vocabulary', () => {
  it('does not draw VISION before the story has given it to the player', () => {
    const fresh = new TouchEngine();
    fresh.setViewport(VIEWPORT);
    expect(fresh.buttonLayout().map((b) => b.id).sort()).toEqual(['ollie', 'sling']);
    fresh.setVisionAvailable(true);
    expect(fresh.buttonLayout().map((b) => b.id)).toContain('vision');
  });

  it('ollies on a tap, with no flick to discover', () => {
    tap(engine, button(engine, 'ollie'));
    expect(engine.sample().olliePressed).toBe(true);
  });

  it('opens the machine while VISION is held, and closes it when let go', () => {
    const p = button(engine, 'vision');
    engine.handle('down', at(p, 1, clock));
    expect(engine.sample().vision).toBe(true);
    clock += 500;
    engine.handle('up', at(p, 1, clock));
    expect(engine.sample().vision).toBe(false);
  });

  it('asks for the aiming mode on a tap of the sling', () => {
    tap(engine, button(engine, 'sling'));
    expect(engine.sample().aimModePressed).toBe(true);
  });

  it('dims and refuses the sling when there is nothing to shoot with', () => {
    engine.setSlingAvailable(false);
    expect(engine.buttonLayout().find((b) => b.id === 'sling')!.enabled).toBe(false);
    tap(engine, button(engine, 'sling'));
    expect(engine.sample().aimModePressed).toBe(false);
  });
});

describe('aiming is a different vocabulary', () => {
  beforeEach(() => { engine.setAiming(true); });

  it('turns the whole screen into the aim surface', () => {
    expect(engine.zoneAt(STICK.x, STICK.y)).toBe('aim');
    expect(engine.zoneAt(WORLD.x, WORLD.y)).toBe('aim');
  });

  it('swings the view by dragging, right and left, up and down', () => {
    drag(engine, 1, [WORLD, { x: WORLD.x + 130, y: WORLD.y }]);
    const a = engine.takeLook();
    expect(a.yaw).toBeGreaterThan(0);
    drag(engine, 2, [WORLD, { x: WORLD.x, y: WORLD.y - 130 }]);
    const b = engine.takeLook();
    expect(b.pitch).toBeGreaterThan(0);
  });

  it('fires on release after a real drag', () => {
    drag(engine, 1, [WORLD, { x: WORLD.x + 60, y: WORLD.y }]);
    clock += 16;
    engine.handle('up', at({ x: WORLD.x + 60, y: WORLD.y }, 1, clock));
    const i = engine.sample();
    expect(i.fire).toBe(true);
    expect(i.firePressed).toBe(true);
  });

  it('treats a tap as a change of mind and leaves the mode instead', () => {
    tap(engine, WORLD);
    const i = engine.sample();
    expect(i.fire).toBe(false);
    expect(i.aimModePressed).toBe(true);
  });

  it('never asks the character to move while a shot is being lined up', () => {
    drag(engine, 1, [STICK, { x: STICK.x, y: STICK.y - 80 }]);
    const i = engine.sample();
    expect(i.moveVector).toBeNull();
    expect(i.push).toBe(false);
  });

  it('drops any half-made gesture when the mode changes under it', () => {
    drag(engine, 1, [WORLD, { x: WORLD.x + 90, y: WORLD.y }]);
    engine.setAiming(false);
    expect(engine.takeLook()).toEqual({ yaw: 0, pitch: 0 });
    expect(engine.sample().fire).toBe(false);
  });
});

describe('reaching into the world', () => {
  it('reports a tap above the controls so the caller can resolve it', () => {
    tap(engine, WORLD);
    engine.sample();
    expect(engine.takeTap()).toEqual({ x: WORLD.x, y: WORLD.y });
  });

  it('does not mistake a stick tap for a reach into the world', () => {
    tap(engine, STICK);
    engine.sample();
    expect(engine.takeTap()).toBeNull();
  });
});

describe('input abstraction', () => {
  it('keeps the simulation free of any knowledge of thumbs', () => {
    const merged = mergeIntent(emptyIntent(), engine.sample());
    expect(Object.keys(merged).sort()).toEqual(Object.keys(emptyIntent()).sort());
  });

  it('lets a keyboard and a thumb coexist without cancelling each other', () => {
    const kb = emptyIntent();
    kb.vision = true;
    drag(engine, 1, [STICK, { x: STICK.x + 40, y: STICK.y }]);
    const merged = mergeIntent(kb, engine.sample());
    expect(merged.vision).toBe(true);
    expect(merged.moveVector).not.toBeNull();
  });
});

describe('viewport', () => {
  it('moves the controls with the safe area rather than under the notch', () => {
    const tall = make();
    tall.setViewport({ w: 430, h: 932, safe: { top: 59, right: 0, bottom: 34, left: 0 } });
    for (const b of tall.buttonLayout()) {
      expect(b.pos.y + b.radius).toBeLessThanOrEqual(932 - 34);
    }
    expect(tall.homePoint().y).toBeLessThanOrEqual(932 - 34);
  });
});

describe('a thumb drives the simulation', () => {
  it('gets a standing player moving within a second of first contact', () => {
    const sim = makeSim();
    const e = make();
    place(sim, { x: 158, y: 214 });
    const from = { ...sim.player.pos };
    e.handle('down', { id: 1, x: STICK.x, y: STICK.y - 40, t: 0 });
    e.handle('move', { id: 1, x: STICK.x, y: STICK.y - 40, t: 16 });
    for (let i = 0; i < 60; i++) sim.step(TICK_DT, e.sample(), null);
    expect(Math.hypot(sim.player.pos.x - from.x, sim.player.pos.y - from.y)).toBeGreaterThan(2);
  });

  it('sends the character the way the thumb points, not the way it was facing', () => {
    const sim = makeSim();
    const e = make();
    place(sim, { x: 158, y: 214 });
    sim.player.heading = 0; // facing east
    // Thumb pushed straight up: the character should end up heading north.
    e.handle('down', { id: 1, x: STICK.x, y: STICK.y, t: 0 });
    e.handle('move', { id: 1, x: STICK.x, y: STICK.y - 60, t: 16 });
    for (let i = 0; i < 120; i++) sim.step(TICK_DT, e.sample(), null);
    // North is -y, which is an angle of -pi/2.
    expect(Math.abs(sim.player.heading + Math.PI / 2)).toBeLessThan(0.5);
  });
});
