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
    // Direction, independent of how far the thumb has travelled: the magnitude
    // is the separate question below.
    drag(engine, 1, [STICK, { x: STICK.x, y: STICK.y - 60 }]);
    const up = engine.sample().moveVector!;
    const len = Math.hypot(up.x, up.y);
    expect(up.y / len).toBeLessThan(-0.98);
    expect(Math.abs(up.x) / len).toBeLessThan(0.05);
  });

  /*
   * The property that was missing, and the whole of why steering was twitchy:
   * the simulation measured the stick's travel and then discarded it, so a
   * six-pixel nudge pointing ninety degrees off the nose asked for a full
   * deflection. There was no such thing as a small input.
   */
  it('asks for far less turn on a small nudge than on a full push', () => {
    const heading = 0;                        // facing east
    const turnFor = (dx: number, dy: number) => {
      const e = make();
      drag(e, 1, [STICK, { x: STICK.x + dx, y: STICK.y + dy }]);
      const sim = makeSim();
      place(sim, { x: 300, y: 150 }, { x: 7, y: 0 });
      sim.player.heading = heading;
      const before = sim.player.heading;
      for (let i = 0; i < 20; i++) sim.step(TICK_DT, e.sample(), null);
      return Math.abs(sim.player.heading - before);
    };
    const nudge = turnFor(0, -14);
    const full = turnFor(0, -110);
    expect(nudge).toBeLessThan(full * 0.35);
    expect(full).toBeGreaterThan(0.05);
  });

  it('ignores a thumb that has barely left the spot it landed on', () => {
    drag(engine, 1, [STICK, { x: STICK.x + 3, y: STICK.y - 3 }]);
    const sim = makeSim();
    place(sim, { x: 300, y: 150 }, { x: 7, y: 0 });
    sim.player.heading = 0;
    for (let i = 0; i < 30; i++) sim.step(TICK_DT, engine.sample(), null);
    expect(Math.abs(sim.player.heading)).toBeLessThan(0.02);
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

  it('centres wherever the thumb lands, anywhere in the pad', () => {
    /*
     * There is no joystick sitting at a fixed spot on the glass waiting to be
     * found. The stick is wherever the thumb went down, every time it goes
     * down — which is the only version that works on a phone held one-handed,
     * where the reachable arc moves with the grip.
     */
    for (const p of [{ x: 40, y: 810 }, { x: 190, y: 620 }, { x: 110, y: 760 }]) {
      const e = make();
      e.handle('down', at(p, 1, clock));
      const v = e.visual.stick;
      expect({ x: Math.round(v.anchor.x), y: Math.round(v.anchor.y) }).toEqual({ x: p.x, y: p.y });
      // And it is centred: a thumb that has not moved is not asking to go
      // anywhere, wherever on the glass it happens to be.
      expect(e.sample().moveVector).toEqual({ x: 0, y: 0 });
    }
  });

  it('re-centres on the next thumb, not on the last one', () => {
    drag(engine, 1, [STICK, { x: STICK.x + 60, y: STICK.y }]);
    engine.handle('up', at({ x: STICK.x + 60, y: STICK.y }, 1, clock));
    const second = { x: 200, y: 620 };
    engine.handle('down', at(second, 2, clock));
    const v = engine.visual.stick;
    expect({ x: Math.round(v.anchor.x), y: Math.round(v.anchor.y) }).toEqual(second);
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
    expect(fresh.buttonLayout().map((b) => b.id).sort()).toEqual(['ollie', 'sling', 'trick']);
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

describe('aiming: look, grab, pull, release', () => {
  /*
   * The old model made the whole screen one gesture: any drag looked *and* any
   * release fired, so a player could not look around without shooting. Looking
   * and firing are now separate things, and which one you get is decided by
   * where your thumb lands — the sling is drawn in the bottom-left, so putting
   * a finger on the sling is putting a finger on the sling.
   */
  beforeEach(() => { engine.setAiming(true); });

  const slingAt = (e: TouchEngine) => {
    const z = e.slingZone();
    return { x: z.x + z.w * 0.3, y: z.y + z.h * 0.5 };
  };

  it('makes everywhere but the sling a place to look', () => {
    expect(engine.zoneAt(WORLD.x, WORLD.y)).toBe('look');
    expect(engine.zoneAt(360, 120)).toBe('look');
    expect(engine.zoneAt(slingAt(engine).x, slingAt(engine).y)).toBe('pull');
  });

  it('looks all the way round, without limit, on horizontal swipes', () => {
    let total = 0;
    for (let i = 0; i < 12; i++) {
      drag(engine, i + 1, [WORLD, { x: WORLD.x + 300, y: WORLD.y }]);
      engine.handle('up', at({ x: WORLD.x + 300, y: WORLD.y }, i + 1, clock));
      total += engine.takeLook().yaw;
    }
    // Comfortably past a full turn: nothing clamps the horizontal.
    expect(Math.abs(total)).toBeGreaterThan(Math.PI * 2);
  });

  it('moves the view in proportion to the thumb, both ways', () => {
    drag(engine, 1, [WORLD, { x: WORLD.x + 60, y: WORLD.y }]);
    const small = engine.takeLook().yaw;
    drag(engine, 2, [WORLD, { x: WORLD.x + 180, y: WORLD.y }]);
    const big = engine.takeLook().yaw;
    expect(small).toBeGreaterThan(0);
    expect(big / small).toBeGreaterThan(2.5);
    drag(engine, 3, [WORLD, { x: WORLD.x, y: WORLD.y - 90 }]);
    expect(engine.takeLook().pitch).toBeGreaterThan(0);
  });

  it('never fires from looking around, however far you swipe', () => {
    drag(engine, 1, [WORLD, { x: WORLD.x + 240, y: WORLD.y - 60 }]);
    clock += 16;
    engine.handle('up', at({ x: WORLD.x + 240, y: WORLD.y - 60 }, 1, clock));
    expect(engine.sample().fire).toBe(false);
  });

  it('builds tension as the sling is pulled back', () => {
    const g = slingAt(engine);
    // One continuous thumb: grab, then draw it further and further back.
    engine.handle('down', at(g, 1, clock));
    expect(engine.sample().drawAmount).toBe(0);
    clock += 16;
    engine.handle('move', at({ x: g.x + 30, y: g.y + 20 }, 1, clock));
    const part = engine.sample().drawAmount!;
    clock += 16;
    engine.handle('move', at({ x: g.x + 120, y: g.y + 80 }, 1, clock));
    const full = engine.sample().drawAmount!;
    expect(part).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(part);
    expect(full).toBeCloseTo(1, 1);
  });

  it('lets the pull swing the aim, opposite the way the band is drawn', () => {
    const g = slingAt(engine);
    drag(engine, 1, [g, { x: g.x + 100, y: g.y }]);
    engine.sample();
    // Drawn to the right, so the shot goes left.
    expect(engine.pullOffset.yaw).toBeLessThan(0);
  });

  it('fires on release of a drawn sling, and reports the draw it was let go at', () => {
    const g = slingAt(engine);
    drag(engine, 1, [g, { x: g.x + 90, y: g.y + 40 }]);
    engine.sample();
    clock += 16;
    engine.handle('up', at({ x: g.x + 90, y: g.y + 40 }, 1, clock));
    const i = engine.sample();
    expect(i.fire).toBe(true);
    expect(i.firePressed).toBe(true);
    expect(i.drawAmount).toBeGreaterThan(0.4);
  });

  it('does not fire a sling that was touched and let go without drawing', () => {
    const g = slingAt(engine);
    tap(engine, g);
    expect(engine.sample().fire).toBe(false);
  });

  it('leaves the mode on a tap out in the world', () => {
    tap(engine, WORLD);
    const i = engine.sample();
    expect(i.fire).toBe(false);
    expect(i.aimModePressed).toBe(true);
  });

  it('never asks the character to move while a shot is being lined up', () => {
    drag(engine, 1, [WORLD, { x: WORLD.x, y: WORLD.y - 80 }]);
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
