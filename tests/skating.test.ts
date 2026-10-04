/**
 * Natural skating (docs/42).
 *
 * Three things a skater would have noticed and a spectator would have felt:
 * the push arrived before the foot did, the body leaned for the wrong reason,
 * and the brake was a tighter corner rather than a slide.
 */
import { describe, expect, it } from 'vitest';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { wrapAngle } from '../src/core/math';
import { TUNE, footDown, pushProfile } from '../src/sim/player';
import { makeSim, place } from './harness';

const OPEN_ROAD = { x: 300, y: 150 };   // Bellhaven Avenue

const travelOf = (sim: ReturnType<typeof makeSim>) => Math.atan2(sim.player.vel.y, sim.player.vel.x);
const offOf = (sim: ReturnType<typeof makeSim>) => Math.abs(wrapAngle(sim.player.heading - travelOf(sim)));

describe('a push comes through the foot', () => {
  const pushOnce = (sim: ReturnType<typeof makeSim>) => {
    const it = emptyIntent();
    it.push = true; it.pushPressed = true;
    sim.step(TICK_DT, it, null);
  };

  it('starts the leg at once, but the board does not speed up until the foot is down', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 4, y: 0 });
    pushOnce(sim);
    expect(sim.player.pushTimer).toBeGreaterThan(0);
    // Nothing yet: the foot is still on its way to the road.
    expect(sim.player.speed).toBeLessThanOrEqual(4.0);
    expect(footDown(sim.player)).toBe(false);
    let before = sim.player.speed;
    let gainedWhileUp = 0, gainedWhileDown = 0;
    for (let i = 0; i < 30 && sim.player.pushTimer > 0; i++) {
      const down = footDown(sim.player);
      sim.step(TICK_DT, emptyIntent(), null);
      const gain = sim.player.speed - before;
      if (gain > 0) { if (down || footDown(sim.player)) gainedWhileDown += gain; else gainedWhileUp += gain; }
      before = sim.player.speed;
    }
    expect(gainedWhileDown).toBeGreaterThan(1.5);
    expect(gainedWhileUp).toBeLessThan(0.05);
  });

  it('delivers the same speed a one-frame shove used to, over the stride', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 4, y: 0 });
    const room = (TUNE.maxSpeed - 4) / TUNE.maxSpeed;
    pushOnce(sim);
    let peak = 0;
    for (let i = 0; i < 40; i++) { sim.step(TICK_DT, emptyIntent(), null); peak = Math.max(peak, sim.player.speed); }
    // Friction takes a little off along the way; the impulse itself is intact.
    expect(peak).toBeGreaterThan(4 + TUNE.pushImpulse * room - 0.35);
    expect(peak).toBeLessThan(4 + TUNE.pushImpulse * room + 0.05);
  });

  it('makes its sound when the foot touches the road, not when the button does', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 4, y: 0 });
    pushOnce(sim);
    expect(sim.player.pushedThisTick).toBe(false);
    let heardAt = -1;
    for (let i = 1; i < 30 && heardAt < 0; i++) {
      sim.step(TICK_DT, emptyIntent(), null);
      if (sim.player.pushedThisTick) heardAt = sim.player.pushPhase;
    }
    expect(heardAt).toBeGreaterThanOrEqual(TUNE.pushContactStart);
    expect(heardAt).toBeLessThan(TUNE.pushContactStart + 0.1);
  });

  it('has a profile that starts at nothing, ends at everything, and peaks mid-drive', () => {
    expect(pushProfile(0)).toBe(0);
    expect(pushProfile(TUNE.pushContactStart)).toBe(0);
    expect(pushProfile(TUNE.pushContactEnd)).toBeCloseTo(1, 6);
    expect(pushProfile(1)).toBeCloseTo(1, 6);
    const mid = (TUNE.pushContactStart + TUNE.pushContactEnd) / 2;
    expect(pushProfile(mid)).toBeCloseTo(0.5, 6);
    // Steeper in the middle than at either end of the contact.
    const d = 0.02;
    const slopeMid = pushProfile(mid + d) - pushProfile(mid - d);
    const slopeEdge = pushProfile(TUNE.pushContactStart + 2 * d) - pushProfile(TUNE.pushContactStart);
    expect(slopeMid).toBeGreaterThan(slopeEdge * 2);
  });

  it('is a stride with a rest in it, at the old rhythm', () => {
    expect(TUNE.pushDuration).toBeLessThan(TUNE.pushCooldown);
    expect(TUNE.pushContactStart).toBeGreaterThan(0.1);
    expect(TUNE.pushContactEnd).toBeLessThan(0.9);
  });

  it('pushes nothing from a foot that never reached the road', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 5, y: 0 });
    pushOnce(sim);
    // Pop before the foot comes down. The stride is interrupted by the air.
    const it = emptyIntent();
    it.olliePressed = true; it.ollieReleased = true;
    sim.step(TICK_DT, it, null);
    expect(sim.player.stance).toBe('AIR');
    const before = sim.player.speed;
    for (let i = 0; i < 40; i++) sim.step(TICK_DT, emptyIntent(), null);
    expect(sim.player.speed).toBeLessThanOrEqual(before + 0.01);
  });
});

describe('the body leans against the load', () => {
  const carve = (speed: number, stick: number, seconds: number) => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: speed, y: 0 });
    sim.player.heading = 0;
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      const it = emptyIntent();
      // A thumb a little off the nose: the same ask at every speed.
      it.moveVector = { x: Math.cos(stick), y: Math.sin(stick) };
      sim.step(TICK_DT, it, null);
    }
    return sim.player;
  };

  it('leans harder for the same turn the faster it is going', () => {
    const slow = carve(3, -0.35, 0.5);
    const fast = carve(10, -0.35, 0.5);
    expect(Math.abs(fast.lean)).toBeGreaterThan(Math.abs(slow.lean) * 1.3);
  });

  it('barely leans pivoting on the spot', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD);
    sim.player.heading = 0;
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      const it = emptyIntent();
      it.moveVector = { x: 0, y: -1 };
      sim.step(TICK_DT, it, null);
      peak = Math.max(peak, Math.abs(sim.player.lean));
    }
    expect(peak).toBeLessThan(0.15);
  });

  it('leans into the turn, toward the inside of it', () => {
    const p = carve(8, -1.2, 0.4);
    // Turning toward -y is a heading decrease; the lean carries the same sign.
    expect(p.turnRate).toBeLessThan(0);
    expect(p.lean).toBeLessThan(-0.2);
  });

  it('pops with the knees folded, not from standing', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 6, y: 0 });
    for (let i = 0; i < 30; i++) sim.step(TICK_DT, emptyIntent(), null);
    expect(Math.abs(sim.player.crouch)).toBeLessThan(0.05);
    const it = emptyIntent();
    it.olliePressed = true; it.ollieReleased = true;
    sim.step(TICK_DT, it, null);
    expect(sim.player.stance).toBe('AIR');
    expect(sim.player.crouch).toBeLessThan(-0.4);
  });
});

describe('the brake is a powerslide', () => {
  const brake = (sim: ReturnType<typeof makeSim>, seconds: number, steer = 0) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      const it = emptyIntent();
      it.brake = true;
      it.steer = steer;
      sim.step(TICK_DT, it, null);
    }
  };

  it('throws the board sideways while the rider keeps going the way they were', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 9, y: 0 });
    const travel0 = travelOf(sim);
    brake(sim, 0.5);
    expect(sim.player.stance).toBe('SLIDE');
    // Most of the way to across.
    expect(offOf(sim)).toBeGreaterThan(1.0);
    // The line of travel has barely moved: this is a slide, not a corner.
    expect(Math.abs(wrapAngle(travelOf(sim) - travel0))).toBeLessThan(0.3);
    // And it is scrubbing speed.
    expect(sim.player.speed).toBeLessThan(7.5);
    expect(sim.player.speed).toBeGreaterThan(2);
  });

  it('goes frontside by default, so the rider ends up facing where they are going', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 9, y: 0 });
    sim.player.heading = 0;
    brake(sim, 0.4);
    // The toe edge is +r, a quarter turn on from the heading; facing travel
    // means the heading has come *back* by a quarter turn.
    expect(sim.player.heading).toBeLessThan(-0.6);
  });

  it('lets the stick pick the side', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 9, y: 0 });
    sim.player.heading = 0;
    brake(sim, 0.4, 1);
    expect(sim.player.heading).toBeGreaterThan(0.6);
  });

  it('never slides past sideways', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 10, y: 0 });
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      const it = emptyIntent();
      it.brake = true; it.steer = -1;
      sim.step(TICK_DT, it, null);
      // A board sliding to a dead stop sits however it stopped; measure the slide.
      if (sim.player.speed > 1.5) peak = Math.max(peak, offOf(sim));
    }
    expect(peak).toBeGreaterThan(1.0);
    expect(peak).toBeLessThan(Math.PI / 2 + 0.1);
    expect(sim.player.stance).not.toBe('BAIL');
  });

  it('comes back in line when the brake is let go, by turning the board, not the road', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 9, y: 0 });
    brake(sim, 0.4);
    const travelSlid = travelOf(sim);
    expect(offOf(sim)).toBeGreaterThan(0.9);
    for (let i = 0; i < 30; i++) sim.step(TICK_DT, emptyIntent(), null);
    expect(sim.player.stance).toBe('ROLL');
    expect(offOf(sim)).toBeLessThan(0.3);
    // The heading came round to the travel; the travel did not jump to the heading.
    expect(Math.abs(wrapAngle(travelOf(sim) - travelSlid))).toBeLessThan(0.35);
    expect(sim.player.stance).not.toBe('BAIL');
  });

  it('is announced once, when the wheels let go', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 9, y: 0 });
    let slides = 0;
    sim.bus.on('player:slide', () => slides++);
    brake(sim, 0.5);
    expect(slides).toBe(1);
  });

  it('is a stop below walking pace, not a slide', () => {
    const sim = makeSim();
    place(sim, OPEN_ROAD, { x: 2.5, y: 0 });
    brake(sim, 0.3);
    expect(sim.player.stance).toBe('ROLL');
    expect(offOf(sim)).toBeLessThan(0.1);
  });
});
