import { describe, expect, it } from 'vitest';
import { PlanExit, emptyIntent, movementAsked, type Intent } from '../src/core/input';
import { TouchEngine } from '../src/core/touch';
import { readThrow } from '../src/render/plan';
import { THROW_READ } from '../src/content/copy';
import { makeSim, makeUnlockedSim } from './harness';

/**
 * The controls pass: the plan as a stop you leave by doing the next thing,
 * and the slingshot read as a tool for putting a noise somewhere.
 */

const intent = (extra: Partial<Intent> = {}): Intent => ({ ...emptyIntent(), ...extra });

describe('what counts as setting off', () => {
  it('reads a pushed stick, a held key and a steer as moving', () => {
    expect(movementAsked(intent({ moveVector: { x: 0, y: -0.8 }, push: true }))).toBe(true);
    expect(movementAsked(intent({ push: true }))).toBe(true);
    expect(movementAsked(intent({ steer: -1 }))).toBe(true);
  });

  it('does not read a thumb resting on the stick as moving', () => {
    expect(movementAsked(intent({ moveVector: { x: 0, y: 0 }, push: true }))).toBe(false);
    expect(movementAsked(intent({ moveVector: { x: 0.1, y: 0.1 }, push: true }))).toBe(false);
    expect(movementAsked(intent())).toBe(false);
  });
});

describe('the plan closes when the player does the next thing', () => {
  const go = intent({ moveVector: { x: 0, y: -1 }, push: true });

  it('stays open while nothing is asked of the street', () => {
    const x = new PlanExit();
    for (let k = 0; k < 60; k++) expect(x.update(true, intent())).toBe(false);
  });

  it('closes on setting off', () => {
    const x = new PlanExit();
    x.update(true, intent());
    expect(x.update(true, go)).toBe(true);
  });

  it('does not close on a stick that was already held when the plan opened', () => {
    const x = new PlanExit();
    for (let k = 0; k < 30; k++) expect(x.update(true, go)).toBe(false);
    // Let go, push again: that is a decision to leave.
    expect(x.update(true, intent())).toBe(false);
    expect(x.update(true, go)).toBe(true);
  });

  it('closes at once on reaching for a trick, a grab, a pop or the aiming view', () => {
    for (const k of ['trickPressed', 'grabPressed', 'olliePressed', 'aimModePressed'] as const) {
      const x = new PlanExit();
      expect({ k, closed: x.update(true, intent({ [k]: true })) }).toEqual({ k, closed: true });
    }
  });

  it('does not close on a click or a held mouse button — on the map, that is a pin', () => {
    const x = new PlanExit();
    x.update(true, intent());
    expect(x.update(true, intent({ aim: true, fire: true, pointerActive: true }))).toBe(false);
  });

  it('forgets everything once the plan is shut, so the next opening starts fresh', () => {
    const x = new PlanExit();
    x.update(true, intent());
    x.update(false, intent());
    expect(x.update(true, go)).toBe(false);
  });

  it('carries the touch that left the plan straight on into the street', () => {
    // End to end through the touch engine: plan open, stick pushed.
    const e = new TouchEngine();
    e.setViewport({ w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } });
    const plan = e.buttonLayout().find((b) => b.id === 'plan')!.pos;
    e.handle('down', { id: 1, x: plan.x, y: plan.y, t: 0 });
    e.handle('up', { id: 1, x: plan.x, y: plan.y, t: 80 });
    const x = new PlanExit();
    expect(x.update(true, e.sample())).toBe(false);
    e.handle('down', { id: 2, x: 90, y: 700, t: 200 });
    e.handle('move', { id: 2, x: 90, y: 620, t: 216 });
    const i = e.sample();
    expect(i.planView).toBe(true);
    expect(x.update(i.planView, i)).toBe(true);
    // The host closes the plan; the push is still in the same intent.
    expect(i.moveVector).not.toBeNull();
    expect(i.push).toBe(true);
  });
});

describe('a drawn stone says what it would do', () => {
  /*
   * Diversion first: a stone is mostly a way of putting a noise somewhere you
   * are not, so the reading at the end of the arc leads with who would turn.
   */
  it('names the noise and how many cameras would turn to it', () => {
    const sim = makeUnlockedSim();
    const cam = sim.sensors[0];
    const p = { x: cam.data.pos.x + 3, y: cam.data.pos.y + 3 };
    const n = sim.earshot(p).stone.length;
    expect(n).toBeGreaterThan(0);
    const wary = sim.earshot(p).wary;
    expect(readThrow(sim, p, null)).toBe(wary ? THROW_READ.wary : THROW_READ.turns(n));
  });

  it('counts only the cameras the player has noticed, before VISION', () => {
    const sim = makeSim();
    const cam = sim.sensors[0];
    const p = { x: cam.data.pos.x + 3, y: cam.data.pos.y + 3 };
    sim.knownSensors.clear();
    expect(readThrow(sim, p, null)).toBe(THROW_READ.unheard);
  });

  it('names what is in the way of the arc for what hitting it is', () => {
    const sim = makeSim();
    const at = { x: 0, y: 0 };
    expect(readThrow(sim, at, { id: 'c', pos: at, z: 4, radius: 0.4, kind: 'camera' })).toBe(THROW_READ.camera);
    expect(readThrow(sim, at, { id: 'p', pos: at, z: 1, radius: 0.5, kind: 'person' })).toBe(THROW_READ.person);
    expect(readThrow(sim, at, { id: 't', pos: at, z: 3, radius: 1.8, kind: 'foliage' })).toBe(THROW_READ.foliage);
  });

  it('calls a bin loud, and says what it would turn', () => {
    const sim = makeUnlockedSim();
    const bin = sim.world.data.props.find((p) => p.hittable && p.kind !== 'tree' && p.kind !== 'car')!;
    const said = readThrow(sim, bin.pos, { id: bin.id, pos: bin.pos, z: 0.7, radius: 0.6, kind: 'prop' });
    expect(said.startsWith(bin.kind.toUpperCase())).toBe(true);
    expect(said).toContain('LOUD');
  });
});
