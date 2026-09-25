import { beforeEach, describe, expect, it } from 'vitest';
import { TouchEngine, type PointerSample } from '../src/core/touch';
import { InputManager, emptyIntent, type Intent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { SLING_RECOVERY, THROW_FLOOR } from '../src/sim/sim';
import { makeSim, place, step } from './harness';

/**
 * The held sling: press SLING, hold, pull back toward the palm, let go.
 *
 * It replaces two earlier shapes. The first was a mode — stop, drop to first
 * person, left thumb aims, right thumb pulls, find the way back out. The second
 * was a toggle — tap SLING to take it out, then pull back anywhere on the right
 * of the glass, then tap SLING again to put it away — which was two controls
 * and a state to remember for one throw. Now the whole shot is one touch, on
 * the control itself, and nothing is left on screen when the thumb comes off.
 * The first-person view is kept as the classic option and as `F` on a desktop.
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
const button = (e: TouchEngine, id: 'sling' | 'trick' | 'plan') => e.buttonLayout().find((b) => b.id === id)!.pos;
function tap(e: TouchEngine, x: number, y: number, id = 1): void {
  e.handle('down', at(x, y, id)); clock += 80; e.handle('up', at(x, y, id));
}
/** Press SLING and pull by `by`, over `steps` moves `ms` apart, sampling like frames do. */
function pull(e: TouchEngine, by: { x: number; y: number }, id = 3, steps = 10, ms = 30): { x: number; y: number } {
  const from = sling(e);
  e.handle('down', at(from.x, from.y, id));
  for (let i = 1; i <= steps; i++) {
    clock += ms;
    e.handle('move', at(from.x + by.x * i / steps, from.y + by.y * i / steps, id));
    e.sample();
  }
  return { x: from.x + by.x, y: from.y + by.y };
}
/** Hold SLING still for `ms`, sampling each frame. */
function hold(e: TouchEngine, ms: number, id = 3): void {
  const s = sling(e);
  e.handle('down', at(s.x, s.y, id));
  for (let t = 0; t < ms; t += 16) { clock += 16; e.sample(); }
}

beforeEach(() => { clock = 1000; });

describe('SLING is pressed, held, and let go', () => {
  it('starts aiming the moment it is pressed, and shows it on the control', () => {
    const e = engine();
    const s = sling(e);
    e.handle('down', at(s.x, s.y, 3));
    const i = e.sample();
    expect(i.aim).toBe(true);
    expect(i.throwVector).not.toBeNull();
    expect(i.aimModePressed).toBe(false);
    expect(e.slingHeld).toBe(true);
    expect(e.visual.sling.held).toBe(true);
    expect(e.visual.buttons.find((b) => b.id === 'sling')!.pressed).toBe(true);
  });

  it('held without pulling, points straight up the street and draws itself to about half', () => {
    const e = engine();
    hold(e, 800);
    const i = e.sample();
    expect(i.throwVector!.x).toBeCloseTo(0, 5);
    expect(i.throwVector!.y).toBeLessThan(0);
    expect(i.drawAmount!).toBeGreaterThan(0.4);
    expect(i.drawAmount!).toBeLessThan(0.5);
  });

  it('points the other way from the pull, and follows the thumb every frame', () => {
    const e = engine();
    pull(e, { x: -20, y: 80 });
    const a = e.sample();
    expect(a.throwVector!.x).toBeGreaterThan(0);
    expect(a.throwVector!.y).toBeLessThan(0);
    // Pulled straight away, so the hand had barely drawn it: the pull is the aim.
    expect(Math.abs(Math.atan2(a.throwVector!.y, a.throwVector!.x) - Math.atan2(-80, 20))).toBeLessThan(0.05);
    // Swing the thumb across without letting go: the aim goes with it.
    const s = sling(e);
    clock += 16; e.handle('move', at(s.x + 60, s.y + 60, 3));
    const b = e.sample();
    expect(b.throwVector!.x).toBeLessThan(0);
    expect(b.aim).toBe(true);
  });

  it('draws harder the further back it comes', () => {
    const a = engine();
    pull(a, { x: 0, y: 70 }, 3, 3, 16);
    const b = engine();
    pull(b, { x: 0, y: 120 }, 3, 3, 16);
    expect(b.sample().drawAmount!).toBeGreaterThan(a.sample().drawAmount!);
    expect(b.sample().drawAmount!).toBeCloseTo(1, 5);
  });

  it('fires on release, once, along the pull as it was just before the thumb came off', () => {
    const e = engine();
    const end = pull(e, { x: 0, y: 100 }, 3, 10, 30);
    // The thumb smears sideways as it lifts.
    clock += 20; e.handle('move', at(end.x + 20, end.y + 2, 3));
    clock += 20; e.handle('move', at(end.x + 38, end.y + 4, 3));
    clock += 10; e.handle('up', at(end.x + 42, end.y + 4, 3));
    const i = e.sample();
    expect(i.fire).toBe(true);
    expect(i.firePressed).toBe(true);
    expect(i.aim).toBe(true);
    expect(Math.abs(i.throwVector!.x)).toBeLessThan(3);
    expect(i.throwVector!.y).toBeLessThan(-85);
    expect(e.visual.sling.shots).toBe(1);
    // And only once; then it is gone from the glass.
    const next = e.sample();
    expect(next.fire).toBe(false);
    expect(next.aim).toBe(false);
    expect(next.throwVector).toBeNull();
    expect(e.visual.sling.held).toBe(false);
  });

  it('fires a plain press-hold-release up the street, with no pull at all', () => {
    const e = engine();
    hold(e, 400);
    const s = sling(e);
    e.handle('up', at(s.x, s.y, 3));
    const i = e.sample();
    expect(i.fire).toBe(true);
    expect(i.throwVector!.y).toBeLessThan(0);
  });

  it('does not throw on a brush too quick to have meant anything', () => {
    const e = engine();
    const s = sling(e);
    tap(e, s.x, s.y, 3);
    const i = e.sample();
    expect(i.fire).toBe(false);
    expect(e.visual.sling.shots).toBe(0);
    expect(e.visual.sling.fumbles).toBe(1);
    // A tap on SLING is not a tap on the world either.
    expect(e.takeTap()).toBeNull();
  });

  it('still throws a quick flick, because a flick has a pull in it', () => {
    const e = engine();
    pull(e, { x: 0, y: 60 }, 3, 2, 30);
    const s = sling(e);
    clock += 20; e.handle('up', at(s.x, s.y + 60, 3));
    expect(e.sample().fire).toBe(true);
  });

  it('throws shorter when the pouch is eased forward, after the hand has drawn it', () => {
    // Held long enough to draw itself, then the thumb eases the pouch toward
    // the target: a short lob at the bin across the path, not the far end.
    const e = engine();
    hold(e, 700);
    const drawn = e.sample().drawAmount!;
    const s = sling(e);
    for (let k = 1; k <= 5; k++) { clock += 16; e.handle('move', at(s.x, s.y - k * 6, 3)); e.sample(); }
    const eased = e.sample();
    expect(eased.drawAmount!).toBeLessThan(drawn * 0.6);
    expect(eased.throwVector!.y).toBeLessThan(0);
  });

  it('keeps the bearing still under a thumb holding a line, once it has started aiming', () => {
    const e = engine();
    hold(e, 150);
    const s = sling(e);
    clock += 16; e.handle('move', at(s.x + 30, s.y + 30, 3));
    const a = e.sample().throwVector!;
    for (let k = 0; k < 40; k++) { clock += 16; e.sample(); }
    const b = e.sample().throwVector!;
    expect(Math.atan2(b.y, b.x)).toBeCloseTo(Math.atan2(a.y, a.x), 6);
  });

  it('puts it down without throwing when the pouch is pushed forward until the band is slack', () => {
    const e = engine();
    pull(e, { x: 0, y: 80 });
    const s = sling(e);
    for (let k = 1; k <= 10; k++) { clock += 30; e.handle('move', at(s.x, s.y + 80 - k * 9.5, 3)); e.sample(); }
    expect(e.visual.sling.cancel).toBe(true);
    const drawn = e.sample();
    expect(drawn.drawAmount).toBe(0);
    expect(drawn.throwVector).toBeNull();
    clock += 150; e.handle('up', at(s.x, s.y + 2, 3));
    expect(e.sample().fire).toBe(false);
    expect(e.visual.sling.fumbles).toBe(1);
  });

  it('never throws from a cancelled touch — a call coming in, a palm', () => {
    const e = engine();
    const end = pull(e, { x: 0, y: 100 });
    e.handle('cancel', at(end.x, end.y, 3));
    expect(e.sample().fire).toBe(false);
  });

  it('lets go of a pull without a shot when there is suddenly nothing to throw with', () => {
    const e = engine();
    pull(e, { x: 0, y: 100 });
    e.setSlingAvailable(false);
    expect(e.slingHeld).toBe(false);
    expect(e.sample().aim).toBe(false);
    // And the dimmed control refuses a press.
    const s = sling(e);
    e.handle('down', at(s.x, s.y, 4));
    expect(e.sample().aim).toBe(false);
  });

  it('allows only one sling: a second thumb on it does nothing', () => {
    const e = engine();
    pull(e, { x: 0, y: 80 }, 3);
    const s = sling(e);
    e.handle('down', at(s.x + 5, s.y, 4));
    clock += 16; e.handle('move', at(s.x + 60, s.y - 60, 4));
    const i = e.sample();
    expect(i.throwVector!.y).toBeLessThan(0);
    expect(Math.abs(i.throwVector!.x)).toBeLessThan(1);
  });

  it('still opens the old aiming view in the classic scheme, and draws nothing itself', () => {
    const e = engine();
    e.setThrowMode(false);
    const s = sling(e);
    e.handle('down', at(s.x, s.y, 3));
    expect(e.sample().aim).toBe(false);
    clock += 80; e.handle('up', at(s.x, s.y, 3));
    expect(e.sample().aimModePressed).toBe(true);
  });
});

describe('the sling and the board at the same time', () => {
  it('keeps the stick moving the rider while the sling is held, pulled and let go', () => {
    const e = engine();
    e.handle('down', at(90, 700, 1));
    clock += 16; e.handle('move', at(90, 640, 1));
    const end = pull(e, { x: 0, y: 90 }, 3);
    const held = e.sample();
    expect(held.moveVector).not.toBeNull();
    expect(held.push).toBe(true);
    expect(held.aim).toBe(true);
    clock += 16; e.handle('up', at(end.x, end.y, 3));
    const fired = e.sample();
    expect(fired.fire).toBe(true);
    expect(fired.moveVector).not.toBeNull();
    const after = e.sample();
    expect(after.moveVector).not.toBeNull();
    expect(after.aim).toBe(false);
  });

  it('lets the sling be pressed again straight after, and the other buttons still work', () => {
    const e = engine();
    const end = pull(e, { x: 0, y: 90 }, 3);
    clock += 16; e.handle('up', at(end.x, end.y, 3));
    e.sample();
    const t = button(e, 'trick');
    tap(e, t.x, t.y, 5);
    expect(e.sample().trickPressed).toBe(true);
    pull(e, { x: 10, y: 90 }, 6);
    expect(e.sample().aim).toBe(true);
  });

  it('drives a rider in the simulation who keeps rolling through a whole shot', () => {
    const sim = makeSim();
    const e = engine();
    place(sim, { x: 158, y: 214 }, { x: 0, y: 7 });
    const run = (n: number) => { for (let k = 0; k < n; k++) { clock += 16; sim.step(TICK_DT, e.sample(), { x: 158, y: 240 }); } };
    e.handle('down', at(90, 700, 1));
    clock += 16; e.handle('move', at(90, 620, 1));
    run(20);
    const s = sling(e);
    e.handle('down', at(s.x, s.y, 3));
    run(10);
    for (let k = 1; k <= 6; k++) { clock += 16; e.handle('move', at(s.x, s.y + k * 15, 3)); run(1); }
    expect(sim.player.aiming).toBe(true);
    const drawnSpeed = sim.player.speed;
    clock += 16; e.handle('up', at(s.x, s.y + 90, 3));
    run(1);
    expect(sim.projectiles.length).toBe(1);
    run(30);
    expect(sim.player.aiming).toBe(false);
    expect(sim.player.speed).toBeGreaterThan(drawnSpeed * 0.8);
  });
});

describe('the sling recovers between shots', () => {
  const shoot = (sim: ReturnType<typeof makeSim>) => {
    const it = emptyIntent();
    it.aim = true; it.fire = true; it.firePressed = true; it.drawAmount = 0.8;
    sim.step(TICK_DT, it, { x: 158, y: 190 });
  };

  it('will not loose a second stone inside the recovery, and will after it', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    shoot(sim);
    expect(sim.projectiles.length).toBe(1);
    expect(sim.slingReady).toBeLessThan(0.1);
    shoot(sim);
    expect(sim.projectiles.length).toBe(1);
    step(sim, SLING_RECOVERY + 0.05);
    expect(sim.slingReady).toBeCloseTo(1, 5);
    shoot(sim);
    expect(sim.projectiles.length).toBe(2);
  });

  it('puts the draw back to nothing the moment a stone goes', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    shoot(sim);
    expect(sim.player.draw).toBe(0);
    sim.step(TICK_DT, emptyIntent(), null);
    expect(sim.player.aiming).toBe(false);
  });
});

describe('reaching for a tool from the plan leaves the plan', () => {
  it('closes the plan on a press of SLING, and is aiming in that same touch', () => {
    const e = engine();
    const p = button(e, 'plan');
    tap(e, p.x, p.y, 5);
    expect(e.sample().planView).toBe(true);
    const s = sling(e);
    e.handle('down', at(s.x, s.y, 3));
    const i = e.sample();
    expect(i.planView).toBe(false);
    expect(i.aim).toBe(true);
  });

  it('closes the plan on a press of TRICK, and does the trick', () => {
    const e = engine();
    const p = button(e, 'plan');
    tap(e, p.x, p.y, 5);
    e.sample();
    const t = button(e, 'trick');
    tap(e, t.x, t.y, 6);
    const i = e.sample();
    expect(i.planView).toBe(false);
    expect(i.trickPressed).toBe(true);
  });

  it('leaves a drag on the map to the map', () => {
    const e = engine();
    const p = button(e, 'plan');
    tap(e, p.x, p.y, 5);
    e.sample();
    e.handle('down', at(200, 300, 7));
    clock += 16; e.handle('move', at(240, 330, 7));
    expect(e.sample().planView).toBe(true);
    expect(e.takeLookDrag()).toEqual({ x: 40, y: 30 });
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

describe('noise works as cover — until it is a pattern', () => {
  /*
   * Pass 38 folded the three-in-fifty-seconds rule into the disturbance
   * ledger: the place remembers each stone, the third is noticed, and the
   * fifth is a pattern that sends somebody to look.
   */
  function stone(sim: ReturnType<typeof makeSim>, at: { x: number; y: number }): void {
    sim.disturbance.record('noise', at, sim.tick, sim.world.districtAt(at)?.id ?? 'bellhaven');
  }

  it('lets the first noises in one place go, and sends somebody once it is a pattern', () => {
    const sim = makeSim();
    const flagged: Array<{ x: number; y: number }> = [];
    sim.bus.on('disturbance:flagged', ({ pos }) => flagged.push(pos));
    const spot = { x: 160, y: 250 };
    for (let i = 0; i < 4; i++) { stone(sim, { x: spot.x + i, y: spot.y }); step(sim, 1); }
    expect(flagged.length).toBe(0);
    const before = sim.dispatcher.activeAnomalies.length;
    stone(sim, spot);
    step(sim, 1);
    expect(flagged.length).toBe(1);
    expect(sim.dispatcher.activeAnomalies.length).toBeGreaterThan(before);
    // And another straight after is the same pattern, not a new one.
    stone(sim, spot);
    step(sim, 1);
    expect(flagged.length).toBe(1);
  });

  it('forgets noises that are far apart or long ago', () => {
    const sim = makeSim();
    let flagged = 0;
    sim.bus.on('disturbance:flagged', () => { flagged++; });
    for (let i = 0; i < 3; i++) stone(sim, { x: 100, y: 100 });
    for (let i = 0; i < 3; i++) stone(sim, { x: 200, y: 300 });
    step(sim, 240);
    stone(sim, { x: 100, y: 100 });
    stone(sim, { x: 102, y: 101 });
    step(sim, 1);
    expect(flagged).toBe(0);
  });
});

describe('a gamepad throws the same way', () => {
  class FakeTarget {
    addEventListener() {}
    removeEventListener() {}
  }
  it('points with the right stick and throws on the trigger', () => {
    const pad = { connected: true, axes: [0, 0, 0, -0.9], buttons: Array.from({ length: 12 }, () => ({ pressed: false, value: 0 })) };
    const nav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: { ...(nav ?? {}), getGamepads: () => [pad] }, configurable: true });
    try {
      const input = new InputManager();
      input.attach(new FakeTarget() as unknown as Window);
      pad.buttons[7] = { pressed: true, value: 1 };
      const held = input.sample();
      expect(held.aim).toBe(true);
      expect(held.throwVector!.y).toBeLessThan(-100);
      expect(Math.abs(held.throwVector!.x)).toBeLessThan(1);
      pad.buttons[7] = { pressed: false, value: 0 };
      const let_go = input.sample();
      expect(let_go.firePressed).toBe(true);
      expect(let_go.throwVector!.y).toBeLessThan(-100);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
    }
  });
});
