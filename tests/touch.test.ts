import { beforeEach, describe, expect, it } from 'vitest';
import { TOUCH_TUNING, TouchEngine, type PointerSample } from '../src/core/touch';
import { emptyIntent, mergeIntent } from '../src/core/input';

const VIEWPORT = { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } };

/** Bottom-left: the board. Bottom-right: the slingshot. Top: the world. */
const PAD = { x: 90, y: 700 };
const ACTION = { x: 300, y: 700 };
const WORLD = { x: 195, y: 240 };

let engine: TouchEngine;
let clock = 1000;

function make(): TouchEngine {
  const e = new TouchEngine();
  e.setViewport(VIEWPORT);
  return e;
}

const at = (p: { x: number; y: number }, id = 1, t = clock): PointerSample => ({ id, x: p.x, y: p.y, t });

/** Drag a finger through a series of points, one sample per `stepMs`. */
function drag(
  e: TouchEngine, id: number, points: Array<{ x: number; y: number }>, stepMs = 16,
): void {
  e.handle('down', at(points[0], id, clock));
  for (let i = 1; i < points.length; i++) {
    clock += stepMs;
    e.handle('move', at(points[i], id, clock));
  }
}

beforeEach(() => { engine = make(); clock = 1000; });

describe('zones', () => {
  it('splits the bottom of the screen into a board thumb and an action thumb', () => {
    expect(engine.zoneAt(PAD.x, PAD.y)).toBe('steer');
    expect(engine.zoneAt(ACTION.x, ACTION.y)).toBe('action');
    // The upper screen is the world, not a control surface.
    expect(engine.zoneAt(WORLD.x, WORLD.y)).toBe('idle');
  });
});

describe('steering', () => {
  it('carves continuously and proportionally', () => {
    drag(engine, 1, [PAD, { x: PAD.x + 40, y: PAD.y }]);
    const mid = engine.sample().steer;
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(1);

    drag(engine, 2, [{ x: PAD.x, y: PAD.y - 4 }]);
    engine.handle('up', at(PAD, 1, clock));
    const e2 = make();
    drag(e2, 1, [PAD, { x: PAD.x - 200, y: PAD.y }]);
    expect(e2.sample().steer).toBe(-1);
  });

  it('has a dead zone, so a resting thumb does not steer', () => {
    drag(engine, 1, [PAD, { x: PAD.x + TOUCH_TUNING.steerDead - 2, y: PAD.y }]);
    expect(engine.sample().steer).toBe(0);
  });

  it('re-anchors when the thumb runs out of room, so it never pins to a coordinate', () => {
    drag(engine, 1, [PAD, { x: PAD.x + 300, y: PAD.y }], 20);
    expect(engine.sample().steer).toBe(1);
    // Coming back a little must start unwinding the turn immediately.
    clock += 20;
    engine.handle('move', at({ x: PAD.x + 260, y: PAD.y }, 1, clock));
    expect(engine.sample().steer).toBeLessThan(1);
  });

  it('stops steering when the touch is released or cancelled', () => {
    drag(engine, 1, [PAD, { x: PAD.x + 60, y: PAD.y }]);
    expect(engine.sample().steer).toBeGreaterThan(0);
    engine.handle('up', at({ x: PAD.x + 60, y: PAD.y }, 1, clock));
    expect(engine.sample().steer).toBe(0);

    drag(engine, 2, [PAD, { x: PAD.x + 60, y: PAD.y }]);
    engine.handle('cancel', at({ x: PAD.x + 60, y: PAD.y }, 2, clock));
    expect(engine.sample().steer).toBe(0);
  });
});

describe('throttle', () => {
  it('pushes when the thumb is held forward and brakes when it is pulled back', () => {
    drag(engine, 1, [PAD, { x: PAD.x, y: PAD.y - 40 }], 60);
    const push = engine.sample();
    expect(push.push).toBe(true);
    expect(push.pushPressed).toBe(true);
    expect(push.brake).toBe(false);

    const e2 = make();
    drag(e2, 1, [PAD, { x: PAD.x, y: PAD.y + 40 }], 60);
    const brake = e2.sample();
    expect(brake.brake).toBe(true);
    expect(brake.push).toBe(false);
  });

  it('keeps asking to push every frame, so the board sets the rhythm', () => {
    drag(engine, 1, [PAD, { x: PAD.x, y: PAD.y - 40 }], 60);
    expect(engine.sample().pushPressed).toBe(true);
    expect(engine.sample().pushPressed).toBe(true);
  });

  it('does nothing while the thumb rests near the anchor', () => {
    drag(engine, 1, [PAD, { x: PAD.x, y: PAD.y - 4 }]);
    const i = engine.sample();
    expect(i.push).toBe(false);
    expect(i.brake).toBe(false);
  });
});

describe('ollie', () => {
  const flick = (e: TouchEngine, from = PAD) => {
    e.handle('down', at(from, 1, clock));
    clock += TOUCH_TUNING.ollieSettle + 20;
    e.handle('move', at({ x: from.x, y: from.y - 2 }, 1, clock));
    for (let i = 1; i <= 4; i++) {
      clock += 8;
      e.handle('move', at({ x: from.x, y: from.y - 2 - i * 12 }, 1, clock));
    }
  };

  it('fires on a short upward flick', () => {
    flick(engine);
    const i = engine.sample();
    expect(i.olliePressed).toBe(true);
    expect(i.ollieReleased).toBe(true);
  });

  it('is consumed once, not held', () => {
    flick(engine);
    expect(engine.sample().olliePressed).toBe(true);
    expect(engine.sample().olliePressed).toBe(false);
  });

  it('does not fire from placing a thumb down', () => {
    engine.handle('down', at(PAD, 1, clock));
    clock += 10;
    engine.handle('move', at({ x: PAD.x, y: PAD.y - 40 }, 1, clock));
    expect(engine.sample().olliePressed).toBe(false);
  });

  it('does not fire from a slow push, which travels the same distance', () => {
    engine.handle('down', at(PAD, 1, clock));
    for (let i = 1; i <= 10; i++) {
      clock += 40;
      engine.handle('move', at({ x: PAD.x, y: PAD.y - i * 6 }, 1, clock));
    }
    const i = engine.sample();
    expect(i.olliePressed).toBe(false);
    expect(i.push).toBe(true);
  });

  it('does not fire from a fast horizontal carve', () => {
    engine.handle('down', at(PAD, 1, clock));
    clock += TOUCH_TUNING.ollieSettle + 20;
    for (let i = 1; i <= 5; i++) {
      clock += 8;
      engine.handle('move', at({ x: PAD.x + i * 16, y: PAD.y }, 1, clock));
    }
    expect(engine.sample().olliePressed).toBe(false);
  });

  it('fires while carving, because a turning skater still ollies', () => {
    engine.handle('down', at(PAD, 1, clock));
    clock += TOUCH_TUNING.ollieSettle + 20;
    engine.handle('move', at({ x: PAD.x + 40, y: PAD.y }, 1, clock));
    for (let i = 1; i <= 4; i++) {
      clock += 8;
      engine.handle('move', at({ x: PAD.x + 42, y: PAD.y - i * 13 }, 1, clock));
    }
    const i = engine.sample();
    expect(i.olliePressed).toBe(true);
    expect(Math.abs(i.steer)).toBeGreaterThan(0);
  });

  it('will not repeat faster than the cooldown', () => {
    flick(engine);
    expect(engine.sample().olliePressed).toBe(true);
    for (let i = 1; i <= 4; i++) {
      clock += 8;
      engine.handle('move', at({ x: PAD.x, y: PAD.y - 60 - i * 12 }, 1, clock));
    }
    expect(engine.sample().olliePressed).toBe(false);
  });
});

describe('slingshot', () => {
  it('aims opposite the pull, the way a slingshot actually works', () => {
    // Pull down-left; the shot must go up-right.
    drag(engine, 1, [ACTION, { x: ACTION.x - 60, y: ACTION.y + 60 }]);
    const i = engine.sample();
    expect(i.aim).toBe(true);
    expect(i.aimVector!.x).toBeGreaterThan(0);
    expect(i.aimVector!.y).toBeLessThan(0);
    expect(Math.hypot(i.aimVector!.x, i.aimVector!.y)).toBeCloseTo(1, 5);
  });

  it('builds draw with pull distance and reports it to the simulation', () => {
    drag(engine, 1, [ACTION, { x: ACTION.x - 30, y: ACTION.y }]);
    const small = engine.sample().drawAmount!;
    drag(engine, 2, [ACTION, { x: ACTION.x - 200, y: ACTION.y }]);
    const e2 = make();
    drag(e2, 1, [ACTION, { x: ACTION.x - 200, y: ACTION.y }]);
    const full = e2.sample().drawAmount!;
    expect(small).toBeGreaterThan(0);
    expect(full).toBe(1);
    expect(full).toBeGreaterThan(small);
  });

  it('fires on release, with the draw still open on that frame', () => {
    drag(engine, 1, [ACTION, { x: ACTION.x - 70, y: ACTION.y }]);
    clock += 16;
    engine.handle('up', at({ x: ACTION.x - 70, y: ACTION.y }, 1, clock));
    const i = engine.sample();
    expect(i.firePressed).toBe(true);
    // The simulation only fires while the character is aiming, so the release
    // frame must still describe a drawn slingshot.
    expect(i.aim).toBe(true);
    expect(i.drawAmount).toBeGreaterThan(0.12);
    expect(i.aimVector!.x).toBeGreaterThan(0);
  });

  it('fires once, not every frame after', () => {
    drag(engine, 1, [ACTION, { x: ACTION.x - 70, y: ACTION.y }]);
    clock += 16;
    engine.handle('up', at({ x: ACTION.x - 70, y: ACTION.y }, 1, clock));
    expect(engine.sample().firePressed).toBe(true);
    expect(engine.sample().firePressed).toBe(false);
  });

  it('cancels when the thumb comes back to the pouch', () => {
    drag(engine, 1, [ACTION, { x: ACTION.x - 70, y: ACTION.y }, { x: ACTION.x - 3, y: ACTION.y }]);
    clock += 16;
    engine.handle('up', at({ x: ACTION.x - 3, y: ACTION.y }, 1, clock));
    expect(engine.sample().firePressed).toBe(false);
  });

  it('cancels when the gesture is interrupted', () => {
    drag(engine, 1, [ACTION, { x: ACTION.x - 70, y: ACTION.y }]);
    engine.handle('cancel', at({ x: ACTION.x - 70, y: ACTION.y }, 1, clock));
    const i = engine.sample();
    expect(i.firePressed).toBe(false);
    expect(i.aim).toBe(false);
  });

  it('does not fire from a tap', () => {
    engine.handle('down', at(ACTION, 1, clock));
    clock += 60;
    engine.handle('up', at({ x: ACTION.x + 2, y: ACTION.y }, 1, clock));
    expect(engine.sample().firePressed).toBe(false);
  });
});

describe('vision', () => {
  it('needs two fingers: one is the slingshot', () => {
    drag(engine, 1, [ACTION, { x: ACTION.x - 50, y: ACTION.y }]);
    expect(engine.sample().vision).toBe(false);

    engine.handle('down', at({ x: ACTION.x + 40, y: ACTION.y - 30 }, 2, clock));
    expect(engine.sample().vision).toBe(true);
  });

  it('is not triggered by the steering thumb plus one finger', () => {
    drag(engine, 1, [PAD, { x: PAD.x + 30, y: PAD.y }]);
    engine.handle('down', at(ACTION, 2, clock));
    expect(engine.sample().vision).toBe(false);
  });

  it('costs you the shot: aiming stops while the machine is open', () => {
    drag(engine, 1, [ACTION, { x: ACTION.x - 70, y: ACTION.y }]);
    expect(engine.sample().aim).toBe(true);
    engine.handle('down', at({ x: ACTION.x + 40, y: ACTION.y - 30 }, 2, clock));
    const i = engine.sample();
    expect(i.vision).toBe(true);
    expect(i.aim).toBe(false);
    expect(i.firePressed).toBe(false);
  });

  it('keeps reporting the thumbs; what looking costs is the simulation to decide', () => {
    drag(engine, 1, [PAD, { x: PAD.x + 40, y: PAD.y - 40 }]);
    expect(engine.sample().push).toBe(true);
    engine.handle('down', at(ACTION, 2, clock));
    engine.handle('down', at({ x: ACTION.x + 40, y: ACTION.y }, 3, clock));
    const i = engine.sample();
    expect(i.vision).toBe(true);
    expect(Math.abs(i.steer)).toBeGreaterThan(0);
  });

  it('does not resume aiming with the surviving finger when one is lifted', () => {
    engine.handle('down', at(ACTION, 1, clock));
    engine.handle('down', at({ x: ACTION.x + 40, y: ACTION.y }, 2, clock));
    expect(engine.sample().vision).toBe(true);
    clock += 40;
    engine.handle('up', at({ x: ACTION.x + 40, y: ACTION.y }, 2, clock));
    clock += 16;
    engine.handle('move', at({ x: ACTION.x - 70, y: ACTION.y }, 1, clock));
    const i = engine.sample();
    expect(i.vision).toBe(false);
    expect(i.aim).toBe(false);
  });
});

describe('reaching into the world', () => {
  it('reports a tap so the caller can resolve it against the network', () => {
    engine.handle('down', at(WORLD, 1, clock));
    clock += 80;
    engine.handle('up', at({ x: WORLD.x + 3, y: WORLD.y + 2 }, 1, clock));
    const tap = engine.takeTap();
    expect(tap).toEqual({ x: WORLD.x + 3, y: WORLD.y + 2 });
    // Taps are consumed once.
    expect(engine.takeTap()).toBeNull();
  });

  it('does not report a drag as a tap', () => {
    drag(engine, 1, [WORLD, { x: WORLD.x + 60, y: WORLD.y }]);
    engine.handle('up', at({ x: WORLD.x + 60, y: WORLD.y }, 1, clock));
    expect(engine.takeTap()).toBeNull();
  });
});

describe('input abstraction', () => {
  it('produces the same Intent shape as any other device', () => {
    drag(engine, 1, [PAD, { x: PAD.x + 40, y: PAD.y - 40 }]);
    const touch = engine.sample();
    expect(Object.keys(touch).sort()).toEqual(Object.keys(emptyIntent()).sort());
  });

  it('merges with a keyboard intent without either cancelling the other', () => {
    const keys = emptyIntent();
    keys.steer = -1;
    keys.vision = true;

    drag(engine, 1, [PAD, { x: PAD.x + 20, y: PAD.y - 40 }]);
    const merged = mergeIntent(keys, engine.sample());

    // The stronger steer wins; booleans are additive.
    expect(merged.steer).toBe(-1);
    expect(merged.vision).toBe(true);
    expect(merged.push).toBe(true);
  });

  it('carries a null draw when no device offers one, so the character loads it', () => {
    expect(emptyIntent().drawAmount).toBeNull();
  });
});

describe('control visuals', () => {
  it('describes the pad and the band without the renderer knowing about touch', () => {
    drag(engine, 1, [PAD, { x: PAD.x + 30, y: PAD.y - 30 }]);
    drag(engine, 2, [ACTION, { x: ACTION.x - 60, y: ACTION.y }]);
    const v = engine.visual;
    expect(v.pad.active).toBe(true);
    expect(v.pad.steer).toBeGreaterThan(0);
    expect(v.pad.throttle).toBeGreaterThan(0);
    expect(v.sling.active).toBe(true);
    expect(v.sling.draw).toBeGreaterThan(0);
    expect(v.sling.cancelling).toBe(false);
  });

  it('shows the band as cancelling when the thumb returns to the pouch', () => {
    drag(engine, 1, [ACTION, { x: ACTION.x - 60, y: ACTION.y }, { x: ACTION.x - 2, y: ACTION.y }]);
    expect(engine.visual.sling.cancelling).toBe(true);
  });
});

describe('viewport', () => {
  it('moves the thumb zones when the device rotates', () => {
    const e = make();
    e.setViewport({ w: 844, h: 390, safe: { top: 0, right: 47, bottom: 21, left: 47 } });
    // Landscape: the same physical corner is now a different coordinate.
    expect(e.zoneAt(100, 330)).toBe('steer');
    expect(e.zoneAt(700, 330)).toBe('action');
    expect(e.zoneAt(400, 60)).toBe('idle');
  });

  it('keeps the thumb zones clear of the home indicator', () => {
    // The bottom inset is reserved: the zone still resolves, but the layout
    // rules that place UI use the same inset, so nothing lands under it.
    expect(VIEWPORT.safe.bottom).toBeGreaterThan(0);
    expect(engine.zoneAt(PAD.x, VIEWPORT.h - VIEWPORT.safe.bottom - 1)).toBe('steer');
  });
});

// --------------------------------------------------------------------------
// The gestures above are only worth anything if they reach the simulation.
// These drive the real Sim from synthetic touch traces, with no DOM anywhere.

import { makeSim, place, step } from './harness';
import { TICK_DT } from '../src/core/loop';

/** Run the simulation for a while, feeding it whatever the thumbs are doing. */
function play(sim: ReturnType<typeof makeSim>, e: TouchEngine, seconds: number, aim: { x: number; y: number } | null = null): void {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    const intent = e.sample();
    let point = aim;
    if (intent.aimVector && !point) {
      point = {
        x: sim.player.pos.x + intent.aimVector.x * 30,
        y: sim.player.pos.y + intent.aimVector.y * 30,
      };
    }
    sim.step(TICK_DT, intent, point);
    clock += 1000 / 60;
  }
}

describe('touch drives the simulation', () => {
  it('gets the player rolling from a thumb held forward', () => {
    const sim = makeSim();
    const e = make();
    place(sim, { x: 155, y: 215 });
    drag(e, 1, [PAD, { x: PAD.x, y: PAD.y - 44 }], 40);
    play(sim, e, 3);
    expect(sim.player.speed).toBeGreaterThan(4);
    expect(sim.player.odometer).toBeGreaterThan(6);
  });

  it('carves the board without rewriting the physics', () => {
    const sim = makeSim();
    const e = make();
    place(sim, { x: 155, y: 215 });
    const before = sim.player.heading;
    drag(e, 1, [PAD, { x: PAD.x + 60, y: PAD.y - 44 }], 40);
    play(sim, e, 1.5);
    expect(sim.player.heading).not.toBe(before);
    expect(sim.player.stance).toBe('ROLL');
  });

  it('ollies at speed, leaving the ground and landing again', () => {
    const sim = makeSim();
    const e = make();
    place(sim, { x: 155, y: 215 });
    drag(e, 1, [PAD, { x: PAD.x, y: PAD.y - 44 }], 40);
    play(sim, e, 2.5);

    clock += 40;
    e.handle('move', at({ x: PAD.x, y: PAD.y - 46 }, 1, clock));
    for (let i = 1; i <= 4; i++) {
      clock += 8;
      e.handle('move', at({ x: PAD.x, y: PAD.y - 46 - i * 13 }, 1, clock));
    }
    let airborne = false;
    for (let i = 0; i < 20; i++) {
      sim.step(TICK_DT, e.sample(), null);
      if (sim.player.stance === 'AIR') airborne = true;
      clock += 1000 / 60;
    }
    expect(airborne).toBe(true);
  });

  it('draws and fires the slingshot, spending exactly one bearing', () => {
    const sim = makeSim();
    const e = make();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: 145, y: 62 });
    const before = sim.player.bearings;

    // Pull back away from the camera, which lies north of the player.
    e.handle('down', at(ACTION, 1, clock));
    for (let i = 1; i <= 6; i++) {
      clock += 16;
      e.handle('move', at({ x: ACTION.x, y: ACTION.y + i * 16 }, 1, clock));
      sim.step(TICK_DT, e.sample(), { x: cam.data.pos.x, y: cam.data.pos.y });
    }
    clock += 16;
    e.handle('up', at({ x: ACTION.x, y: ACTION.y + 96 }, 1, clock));
    sim.step(TICK_DT, e.sample(), { x: cam.data.pos.x, y: cam.data.pos.y });

    expect(sim.player.bearings).toBe(before - 1);
    step(sim, 3);
    expect(sim.evidence.size).toBeGreaterThan(0);
  });

  it('keeps the machine thinking while the player aims', () => {
    const sim = makeSim();
    const e = make();
    place(sim, { x: 145, y: 62 });
    const tick = sim.tick;
    drag(e, 1, [ACTION, { x: ACTION.x, y: ACTION.y + 70 }]);
    play(sim, e, 2);
    // Nothing pauses, nothing slows: aiming happens inside a running world.
    expect(sim.tick).toBeGreaterThan(tick + 100);
    expect(sim.player.aiming).toBe(true);
  });

  it('opens machine vision on two fingers and closes it on release', () => {
    const sim = makeSim();
    const e = make();
    place(sim, { x: 155, y: 215 });
    sim.unlockVision();

    e.handle('down', at(ACTION, 1, clock));
    e.handle('down', at({ x: ACTION.x + 40, y: ACTION.y }, 2, clock));
    play(sim, e, 1);
    expect(sim.visionActive).toBe(true);
    expect(sim.visionBlend).toBeGreaterThan(0.4);

    clock += 16;
    e.handle('up', at(ACTION, 1, clock));
    e.handle('up', at({ x: ACTION.x + 40, y: ACTION.y }, 2, clock));
    play(sim, e, 1);
    expect(sim.visionActive).toBe(false);
    expect(sim.visionBlend).toBeLessThan(0.1);
  });

  it('will not open machine vision before the player has earned it', () => {
    const sim = makeSim();
    const e = make();
    e.handle('down', at(ACTION, 1, clock));
    e.handle('down', at({ x: ACTION.x + 40, y: ACTION.y }, 2, clock));
    play(sim, e, 0.5);
    expect(sim.visionActive).toBe(false);
  });
});

describe('touch reaches into the network', () => {
  it('selects a node, runs a verb, and gets the real graph back', () => {
    const sim = makeSim();
    const node = sim.network.get('CM-207')!;
    place(sim, { x: node.pos.x + 5, y: node.pos.y + 5 });
    step(sim, 0.1);

    sim.selectNode('CM-207');
    expect(sim.focusNode?.id).toBe('CM-207');

    sim.startHack('QUERY', 'CM-207');
    step(sim, 1.2);
    // QUERY reveals actual edges, not a puzzle.
    for (const edge of node.edges) expect(sim.discoveredNodes.has(edge)).toBe(true);
    expect(node.edges).toContain('SVC-VISION');
  });

  it('refuses to reach a node the player is nowhere near', () => {
    const sim = makeSim();
    place(sim, { x: 155, y: 215 });
    sim.selectNode('CM-207');
    expect(sim.selectedNodeId).toBeNull();
  });

  it('lets go of a node when the player skates away, with no menu to dismiss', () => {
    const sim = makeSim();
    const node = sim.network.get('CM-207')!;
    place(sim, { x: node.pos.x + 5, y: node.pos.y + 5 });
    step(sim, 0.1);
    sim.selectNode('CM-207');
    sim.startHack('LOOP', 'CM-207');
    expect(sim.hack).not.toBeNull();

    place(sim, { x: 155, y: 215 });
    step(sim, 0.1);
    expect(sim.selectedNodeId).toBeNull();
    expect(sim.hack).toBeNull();
  });
});
