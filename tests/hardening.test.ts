import { describe, expect, it } from 'vitest';
import { makeSim, place } from './harness';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { buildBellhaven } from '../src/content/bellhaven';
import { aimSway, TUNE } from '../src/sim/player';
import { StoryDirector } from '../src/content/story';
import type { Sim } from '../src/sim/sim';
import { dist } from '../src/core/math';

/**
 * The story director needs a host. These stand in for the parts of the game
 * that draw things, so beats can be exercised headlessly.
 */
function directorFor(sim: Sim) {
  const said: string[] = [];
  const director = new StoryDirector({
    sim,
    hud: { say: (lines: string[]) => said.push(lines.join(' ')) } as never,
    audio: { motif: () => {}, peelIn: () => {} } as never,
    renderer: { kick: () => {} } as never,
    playReprise: () => {},
    hint: { vision: 'HOLD Q', inspect: 'PRESS E' },
  });
  return { director, said };
}

describe('the story runs on simulation time', () => {
  it('schedules on ticks, so a beat cannot drift away from the world', () => {
    const sim = makeSim();
    const { director, said } = directorFor(sim);
    let fired = 0;
    director.ctx.after(2, () => { fired++; });
    expect(director.pending).toBe(1);

    // Nothing happens until the simulation has actually advanced two seconds.
    for (let i = 0; i < 119; i++) { sim.step(TICK_DT, emptyIntent(), null); director.update(); }
    expect(fired).toBe(0);
    sim.step(TICK_DT, emptyIntent(), null); director.update();
    expect(fired).toBe(1);
    expect(director.pending).toBe(0);
    void said;
  });

  it('fires queued work in order, whatever order it was scheduled in', () => {
    const sim = makeSim();
    const { director } = directorFor(sim);
    const seen: string[] = [];
    director.ctx.after(3, () => seen.push('late'));
    director.ctx.after(1, () => seen.push('early'));
    for (let i = 0; i < 200; i++) { sim.step(TICK_DT, emptyIntent(), null); director.update(); }
    expect(seen).toEqual(['early', 'late']);
  });

  it('reaches the false positive identically from the same seed', () => {
    const run = () => {
      const sim = makeSim(4242);
      const { director } = directorFor(sim);
      const beats: string[] = [];
      sim.bus.on('story:beat', (b) => beats.push(b.id));
      place(sim, { x: 196, y: 428 });
      for (let i = 0; i < 60 * 70; i++) {
        sim.step(TICK_DT, emptyIntent(), null);
        director.update();
      }
      return { beats, identity: sim.incidents[0]?.associated[0] };
    };
    const a = run();
    const b = run();
    expect(a.beats).toEqual(b.beats);
    expect(a.identity).toBe('ARAYA, DEVON M.');
    expect(a.beats).toContain('the-match');
    expect(a.beats).toContain('devon-stopped');
  });

  /**
   * The advertisement runs for half a minute with the world live underneath it,
   * so by the time the player has control `sim.tick` is already past the gates
   * on the opening beats. Measured against the raw tick, the first two lines of
   * dialogue land on the same frame and the second overwrites the first.
   */
  it('starts the afternoon when the player gets control, not when the sim does', () => {
    const sim = makeSim();
    const { director } = directorFor(sim);
    const at = new Map<string, number>();
    sim.bus.on('story:beat', (b) => { if (!at.has(b.id)) at.set(b.id, sim.tick); });

    // The advertisement: the world steps, the story does not.
    for (let i = 0; i < 60 * 33; i++) sim.step(TICK_DT, emptyIntent(), null);
    director.begin();
    const started = sim.tick;
    for (let i = 0; i < 60 * 20; i++) { sim.step(TICK_DT, emptyIntent(), null); director.update(); }

    const welcome = at.get('welcome');
    const channel = at.get('devon-suggests-channel');
    expect(welcome).toBeDefined();
    expect(channel).toBeDefined();
    // Each still lands where it was authored to, relative to first control.
    expect(welcome! - started).toBeGreaterThan(60);
    expect(welcome! - started).toBeLessThan(60 * 4);
    // And the two openers are a conversation, not one frame with two speakers.
    expect(channel! - welcome!).toBeGreaterThan(60 * 8);
  });

  it('does not schedule story work on any wall clock', () => {
    const src = String(StoryDirector);
    expect(src).not.toMatch(/setTimeout|setInterval|Date\.now|performance\.now/);
  });
});

/**
 * Devon is the only figure in the game who is *supposed* to be behind you, so
 * he is the one who most easily reads as the wrong thing. The previous pass
 * gave him a board; this is about what he does rather than how he is drawn.
 */
describe('the friend behind you reads as a friend', () => {
  it('does not close on a player who is not moving', () => {
    const sim = makeSim();
    const start = dist(sim.devonPos, sim.player.pos);

    // The opening advertisement: half a minute in which the player is frozen
    // by definition. Devon used to cross eight metres of it at walking pace
    // and end up under three metres off their back.
    for (let i = 0; i < 60 * 33; i++) sim.step(TICK_DT, emptyIntent(), null);

    expect(dist(sim.devonPos, sim.player.pos)).toBeCloseTo(start, 5);
    expect(sim.devon.speed).toBe(0);
  });

  it('still skates after a player who is actually going somewhere', () => {
    const sim = makeSim();
    const push = () => { const i = emptyIntent(); i.push = true; i.pushPressed = true; return i; };
    for (let i = 0; i < 60 * 33; i++) sim.step(TICK_DT, emptyIntent(), null);

    let closest = Infinity;
    for (let i = 0; i < 60 * 20; i++) {
      sim.step(TICK_DT, push(), null);
      if (i > 60) closest = Math.min(closest, dist(sim.devonPos, sim.player.pos));
    }

    // He comes along, at something like the player's pace...
    expect(sim.devon.speed).toBeGreaterThan(1);
    expect(dist(sim.devonPos, sim.player.pos)).toBeLessThan(9);
    // ...without ever arriving in their personal space on the way.
    expect(closest).toBeGreaterThan(3.5);

    // And once the player has rolled to a halt, so has he. He keeps station
    // through the coast, which is right — a board does not stop when you stop
    // pushing — and then both of them are simply standing there.
    for (let i = 0; i < 60 * 20; i++) sim.step(TICK_DT, emptyIntent(), null);
    expect(sim.player.speed).toBe(0);
    expect(sim.devon.speed).toBe(0);

    const held = dist(sim.devonPos, sim.player.pos);
    expect(held).toBeGreaterThan(3.5);
    for (let i = 0; i < 60 * 20; i++) sim.step(TICK_DT, emptyIntent(), null);
    expect(dist(sim.devonPos, sim.player.pos)).toBeCloseTo(held, 5);
  });
});

describe('skating responds when the player is early', () => {
  it('remembers an ollie asked for while there was no ground to push against', () => {
    const sim = makeSim();
    place(sim, { x: 155, y: 215 }, { x: 9, y: 0 });

    const flick = () => { const i = emptyIntent(); i.olliePressed = true; i.ollieReleased = true; return i; };
    sim.step(TICK_DT, flick(), null);
    expect(sim.player.stance).toBe('AIR');

    // Ask again mid-air, then simply wait. The press must survive the landing.
    let asked = false;
    let poppedAgain = false;
    for (let i = 0; i < 60; i++) {
      const airborne = sim.player.stance === 'AIR';
      // Ask once, late enough that the board is still off the ground.
      if (airborne && !asked && sim.player.vz < 0) { sim.step(TICK_DT, flick(), null); asked = true; continue; }
      sim.step(TICK_DT, emptyIntent(), null);
      if (asked && sim.player.poppedThisTick) { poppedAgain = true; break; }
    }
    expect(asked).toBe(true);
    expect(poppedAgain).toBe(true);
  });

  it('forgets a press that was far too early, so ollies are not queued up', () => {
    const sim = makeSim();
    place(sim, { x: 155, y: 215 }, { x: 9, y: 0 });
    const flick = () => { const i = emptyIntent(); i.olliePressed = true; i.ollieReleased = true; return i; };
    sim.step(TICK_DT, flick(), null);
    expect(sim.player.stance).toBe('AIR');
    sim.step(TICK_DT, flick(), null);

    // Wait out the buffer entirely while still airborne.
    for (let i = 0; i < 120 && sim.player.stance === 'AIR'; i++) sim.step(TICK_DT, emptyIntent(), null);
    let popped = false;
    for (let i = 0; i < 30; i++) {
      sim.step(TICK_DT, emptyIntent(), null);
      if (sim.player.poppedThisTick) popped = true;
    }
    expect(popped).toBe(false);
  });

  it('holds an early press for a bounded time, not forever', () => {
    expect(TUNE.inputBuffer).toBeGreaterThan(0.15);
    expect(TUNE.inputBuffer).toBeLessThan(TUNE.pushCooldown);
  });

  it('leaves the player steering through a bail', () => {
    const sim = makeSim();
    place(sim, { x: 155, y: 215 }, { x: 10, y: 0 });
    sim.player.stance = 'BAIL';
    sim.player.bailTimer = TUNE.bailTime;
    const heading = sim.player.heading;
    const steer = () => { const i = emptyIntent(); i.steer = 1; return i; };
    for (let i = 0; i < 30; i++) sim.step(TICK_DT, steer(), null);
    expect(sim.player.stance).toBe('BAIL');
    expect(sim.player.heading).not.toBe(heading);
  });
});

describe('skating well is rewarded twice', () => {
  it('makes a flowing player more accurate at speed than a merely fast one', () => {
    const sim = makeSim();
    place(sim, { x: 155, y: 215 }, { x: 10, y: 0 });
    sim.player.flow = 0;
    const sloppy = aimSway(sim.player);
    sim.player.flow = 1;
    const flowing = aimSway(sim.player);
    expect(sloppy).toBeGreaterThan(flowing);

    // And standing still is steadiest of all.
    place(sim, { x: 155, y: 215 }, { x: 0, y: 0 });
    sim.player.flow = 0;
    expect(aimSway(sim.player)).toBeLessThan(sloppy);
  });

  it('reports the same sway to the reticle that it applies to the shot', () => {
    const sim = makeSim();
    place(sim, { x: 155, y: 215 }, { x: 8, y: 0 });
    expect(sim.aim.sway).toBe(aimSway(sim.player));
  });
});

describe('the town is already watched, and stays exactly as watched', () => {
  /**
   * The thesis in one assertion: surveillance does not escalate by inventory.
   * The camera count is fixed at construction and never grows, whatever the
   * player does or how far the story runs.
   */
  it('never adds a sensor, a drone, or a patrol during play', () => {
    const sim = makeSim();
    const { director } = directorFor(sim);
    const before = { sensors: sim.sensors.length, drones: sim.drones.length, patrols: sim.patrols.length };

    place(sim, { x: 196, y: 428 });
    for (let i = 0; i < 60 * 80; i++) {
      const intent = emptyIntent();
      intent.steer = Math.sin(i / 40);
      intent.push = true;
      intent.pushPressed = i % 30 === 0;
      sim.step(TICK_DT, intent, null);
      director.update();
    }

    expect(sim.sensors.length).toBe(before.sensors);
    expect(sim.drones.length).toBe(before.drones);
    expect(sim.patrols.length).toBe(before.patrols);
    // And the escalation actually happened, so this is not a vacuous run.
    expect(sim.incidents.length).toBeGreaterThan(0);
  });

  it('authors the whole surveillance network up front, in content', () => {
    const a = buildBellhaven();
    const b = buildBellhaven();
    expect(a.sensors.length).toBe(b.sensors.length);
    expect(a.sensors.length).toBeGreaterThanOrEqual(25);
    // Nothing in the world data is act-gated or unlocked later.
    const acts = JSON.stringify(a).match(/"act"|"unlockedAt"|"phase"/g);
    expect(acts).toBeNull();
  });
});

describe('simulation cost has headroom for more town', () => {
  it('stays well inside a frame at several times the current scale', () => {
    const sim = makeSim();
    const base = [...sim.sensors];
    for (let m = 1; m < 4; m++) {
      for (const s of base) {
        sim.sensors.push({ ...s, data: { ...s.data, id: `${s.data.id}-x${m}` } });
      }
    }
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) sim.step(TICK_DT, emptyIntent(), null);
    const msPerTick = (performance.now() - t0) / 300;
    // A generous ceiling: this is a regression guard, not a benchmark.
    expect(msPerTick).toBeLessThan(6);
  });
});
