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

const button = (e: TouchEngine, id: 'sling' | 'trick') =>
  e.buttonLayout().find((b) => b.id === id)!.pos;

beforeEach(() => { engine = make(); clock = 1000; });

describe('zones', () => {
  it('gives the movement thumb the bottom-left and the buttons the bottom-right', () => {
    expect(engine.zoneAt(STICK.x, STICK.y)).toBe('stick');
    expect(engine.zoneAt(WORLD.x, WORLD.y)).toBe('idle');
    for (const id of ['sling', 'trick'] as const) {
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
  it('has no eye, in any state the engine can be put into', () => {
    /*
     * The eye was removed once and grew back, because the button list was
     * built conditionally: unlock VISION and the touch layer added a control
     * on its own, mid-session, in front of a player who was mid-push. There is
     * no condition to satisfy now — 'vision' is not a button id, not a role,
     * and not a zone — so there is nothing for a regression to switch on.
     */
    const fresh = new TouchEngine();
    fresh.setViewport(VIEWPORT);
    expect(fresh.buttonLayout().map((b) => b.id).sort()).toEqual(['sling', 'trick']);

    fresh.setSlingAvailable(false);
    fresh.setAiming(true);
    fresh.setAiming(false);
    fresh.setSlingAvailable(true);
    expect(fresh.buttonLayout().map((b) => b.id).sort()).toEqual(['sling', 'trick']);
    expect(fresh.visual.buttons.map((b) => b.id).sort()).toEqual(['sling', 'trick']);
  });

  it('never reports a VISION hold, because nothing on the glass is one', () => {
    // Every square millimetre of the pad, and none of it is an eye.
    for (let x = 8; x < VIEWPORT.w; x += 16) {
      for (let y = 60; y < VIEWPORT.h; y += 16) {
        const e = make();
        e.handle('down', at({ x, y }, 1, clock));
        expect(e.sample().vision).toBe(false);
      }
    }
  });

  it('does a trick on a tap, with no flick to discover', () => {
    tap(engine, button(engine, 'trick'));
    expect(engine.sample().trickPressed).toBe(true);
  });

  it('has no POP button, and nothing has replaced it', () => {
    /*
     * A dedicated jump button is what a game gives you when it does not trust
     * its tricks. TRICK pops on its own — that is one motion under a foot —
     * so there is nothing here to press for air on its own, by design.
     */
    const ids = engine.buttonLayout().map((b) => b.id);
    expect(ids).not.toContain('ollie');
    expect(ids.length).toBeLessThanOrEqual(2);
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

describe('aiming: the left thumb moves the sling, the right thumb shoots', () => {
  /*
   * Four models in, and this is the one the request asked for.
   *
   * The first made the whole screen one gesture: any drag looked *and* any
   * release fired, so you could not look around without shooting. The second
   * split them by target — drag anywhere to look, grab a small rectangle in
   * the bottom-left to draw — which separated the verbs but still asked one
   * hand to do both jobs on the same glass. The third gave the screen a side
   * each and made the left one a rate stick, which separated the hands but
   * handed the player an invisible anchor, a dead zone and a response curve to
   * learn before they could point at anything. A human called it complicated,
   * and it was.
   *
   * This one has nothing to learn. Left thumb: drag, and the sling goes that
   * far. Right thumb: pull, and let go. The side a finger lands on decides
   * what it is, once, and nothing that happens to any other finger can change
   * it — the aim reads only its own pointer's own movement.
   */
  beforeEach(() => { engine.setAiming(true); });

  const HAND = { x: 90, y: 520 };
  const slingAt = (e: TouchEngine) => {
    const z = e.slingZone();
    return { x: z.x + z.w * 0.5, y: z.y + z.h * 0.7 };
  };
  /** Put the sling-holding thumb down and drag it somewhere. */
  const dragSling = (e: TouchEngine, to: { x: number; y: number }, id = 1): void => {
    e.handle('down', at(HAND, id, clock));
    clock += 16;
    e.handle('move', at(to, id, clock));
  };

  it('gives the left half to the sling hand and the right half to the band', () => {
    expect(engine.zoneAt(HAND.x, HAND.y)).toBe('aim');
    expect(engine.zoneAt(20, 120)).toBe('aim');
    expect(engine.zoneAt(360, 120)).toBe('pull');
    expect(engine.zoneAt(slingAt(engine).x, slingAt(engine).y)).toBe('pull');
  });

  it('moves the sling exactly as far as the thumb moved, and no further', () => {
    dragSling(engine, { x: HAND.x + 80, y: HAND.y });
    const a = engine.takeAimDrag();
    expect(a.yaw).toBeCloseTo(80 * TOUCH_TUNING.aimYawPerPixel, 6);
    expect(a.pitch).toBeCloseTo(0, 6);
  });

  it('stops the moment the thumb stops, because there is no rate to keep running', () => {
    dragSling(engine, { x: HAND.x + 80, y: HAND.y });
    engine.takeAimDrag();
    // Held out at the same place, frame after frame. A stick would still be
    // turning. A drag is not moving, so nothing moves.
    expect(engine.takeAimDrag()).toEqual({ yaw: 0, pitch: 0 });
    clock += 16;
    expect(engine.takeAimDrag()).toEqual({ yaw: 0, pitch: 0 });
  });

  it('travels the same distance per pixel wherever on the glass the drag happens', () => {
    // No dead zone to cross and no curve to climb: the second half of a drag
    // moves the sling exactly as far as the first half did.
    const first = (() => {
      const e = make(); e.setAiming(true);
      e.handle('down', at(HAND, 1, clock));
      clock += 16;
      e.handle('move', at({ x: HAND.x + 30, y: HAND.y }, 1, clock));
      return e.takeAimDrag().yaw;
    })();
    const second = (() => {
      const e = make(); e.setAiming(true);
      e.handle('down', at({ x: 20, y: 200 }, 1, clock));
      clock += 16;
      e.handle('move', at({ x: 50, y: 200 }, 1, clock));
      return e.takeAimDrag().yaw;
    })();
    expect(second).toBeCloseTo(first, 6);
  });

  it('costs nothing to lift the thumb and put it back down somewhere else', () => {
    /*
     * The requirement in the words it was asked in: no aiming jump. Only the
     * change is read, so where the thumb happens to be when it lands is not a
     * number the aim has ever seen.
     */
    dragSling(engine, { x: HAND.x + 60, y: HAND.y });
    engine.takeAimDrag();
    clock += 16;
    engine.handle('up', at({ x: HAND.x + 60, y: HAND.y }, 1, clock));
    expect(engine.takeAimDrag()).toEqual({ yaw: 0, pitch: 0 });
    // Down again on the far side of the pad: still nothing.
    engine.handle('down', at({ x: 20, y: 180 }, 2, clock));
    expect(engine.takeAimDrag()).toEqual({ yaw: 0, pitch: 0 });
  });

  it('sums every sample of a drag, so a burst of events is one smooth sweep', () => {
    engine.handle('down', at(HAND, 1, clock));
    for (let i = 1; i <= 10; i++) {
      clock += 4;
      engine.handle('move', at({ x: HAND.x + i * 9, y: HAND.y }, 1, clock));
    }
    expect(engine.takeAimDrag().yaw).toBeCloseTo(90 * TOUCH_TUNING.aimYawPerPixel, 6);
  });

  it('points the sling up when the thumb goes up', () => {
    dragSling(engine, { x: HAND.x, y: HAND.y - 90 });
    expect(engine.takeAimDrag().pitch).toBeGreaterThan(0);
  });

  it('has no limit on the horizontal: the sling goes all the way round', () => {
    // Nothing in the engine clamps the total, so a long sweep, or several,
    // carries the aim past a full turn.
    let yaw = 0;
    for (let n = 0; n < 12; n++) {
      const e = make(); e.setAiming(true);
      e.handle('down', at({ x: 10, y: 400 }, 1, clock));
      clock += 16;
      e.handle('move', at({ x: 190, y: 400 }, 1, clock));
      yaw += e.takeAimDrag().yaw;
    }
    expect(yaw).toBeGreaterThan(Math.PI * 2);
  });

  it('never fires from moving the sling, however far the thumb goes', () => {
    dragSling(engine, { x: HAND.x + 240, y: HAND.y - 60 });
    clock += 16;
    engine.handle('up', at({ x: HAND.x + 240, y: HAND.y - 60 }, 1, clock));
    expect(engine.sample().fire).toBe(false);
  });

  it('builds tension as the sling is pulled back', () => {
    const g = slingAt(engine);
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

  describe('the two thumbs are strangers', () => {
    /*
     * The requirement this exists for: releasing the shooting finger must
     * never make the aimer jump, and the shooting finger must never reposition
     * the sling. It used to be able to do both — looking was a drag that any
     * pointer not on the sling contributed to, so lifting one finger while
     * another was down could hand the aim to a thumb that had been doing
     * something else entirely, from wherever it happened to be sitting.
     *
     * Roles are decided once, at touch-down, by which side of the glass the
     * finger landed on, and the aim accumulates only from its own pointer's
     * own movement. There is nothing left to reassign.
     */
    it('does not move the sling when the shooting thumb arrives, moves, or fires', () => {
      const g = slingAt(engine);
      dragSling(engine, { x: HAND.x + 40, y: HAND.y }, 1);
      engine.takeAimDrag();

      engine.handle('down', at(g, 2, clock));
      clock += 16;
      engine.handle('move', at({ x: g.x + 100, y: g.y + 60 }, 2, clock));
      expect(engine.takeAimDrag()).toEqual({ yaw: 0, pitch: 0 });
      clock += 16;
      engine.handle('up', at({ x: g.x + 100, y: g.y + 60 }, 2, clock));
      expect(engine.sample().fire).toBe(true);
      expect(engine.takeAimDrag()).toEqual({ yaw: 0, pitch: 0 });
    });

    it('will not let a second finger on the right take the sling from the first', () => {
      const g = slingAt(engine);
      engine.handle('down', at(g, 1, clock));
      engine.handle('down', at({ x: g.x + 40, y: g.y - 40 }, 2, clock));
      clock += 16;
      // The interloper drags a long way; the draw follows the thumb that grabbed.
      engine.handle('move', at({ x: g.x + 240, y: g.y - 40 }, 2, clock));
      expect(engine.sample().drawAmount).toBe(0);
    });

    it('will not let a second finger on the left take the sling from the first', () => {
      dragSling(engine, { x: HAND.x + 30, y: HAND.y }, 1);
      engine.takeAimDrag();
      engine.handle('down', at({ x: 40, y: 300 }, 2, clock));
      clock += 16;
      engine.handle('move', at({ x: 160, y: 300 }, 2, clock));
      expect(engine.takeAimDrag()).toEqual({ yaw: 0, pitch: 0 });
    });

    it('keeps the sling from steering: drawing it aims nothing', () => {
      // The right thumb reports tension and a release. It has no opinion about
      // direction, so there is no aim offset for it to contribute.
      const g = slingAt(engine);
      drag(engine, 1, [g, { x: g.x + 100, y: g.y }]);
      const i = engine.sample();
      expect(i.aimVector).toBeNull();
      expect(i.drawAmount).toBeGreaterThan(0);
      expect(engine.takeAimDrag()).toEqual({ yaw: 0, pitch: 0 });
    });
  });

  it('leaves the mode on a tap out in the world', () => {
    tap(engine, HAND);
    const i = engine.sample();
    expect(i.fire).toBe(false);
    expect(i.aimModePressed).toBe(true);
  });

  it('never asks the character to move while a shot is being lined up', () => {
    dragSling(engine, { x: HAND.x, y: HAND.y - 80 });
    const i = engine.sample();
    expect(i.moveVector).toBeNull();
    expect(i.push).toBe(false);
  });

  it('drops any half-made gesture when the mode changes under it', () => {
    dragSling(engine, { x: HAND.x + 90, y: HAND.y });
    engine.setAiming(false);
    expect(engine.takeAimDrag()).toEqual({ yaw: 0, pitch: 0 });
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
