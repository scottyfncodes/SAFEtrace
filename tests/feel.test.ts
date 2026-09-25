import { describe, expect, it } from 'vitest';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { InputManager } from '../src/core/input';
import {
  BOUNCE, fire, rebound, stepProjectile, type Impact, type Projectile,
} from '../src/sim/slingshot';
import { Rng } from '../src/core/rng';
import { focalFor, PerspectiveRenderer } from '../src/render/perspective';
import { makeSim, makeUnlockedSim, place, shootAt, skate, step } from './harness';

/**
 * The feel pass: the slingshot as something with weight, the plan as a place
 * you can move in, and the Community Safety Score as something found.
 *
 * Every one of these was found by playing the build, not by reading it.
 */

const flat = { targets: [], solidAt: () => false, heightAt: () => 0 };

function aimIntent(extra: Partial<ReturnType<typeof emptyIntent>> = {}) {
  return { ...emptyIntent(), ...extra };
}

describe('the sling is only drawn while something is drawing it', () => {
  it('stays slack when the sling comes up and nothing pulls it', () => {
    // It used to load itself to full on its own clock the moment aiming began,
    // so a mouse click fired a shot that was already drawn.
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    sim.enterAimMode();
    step(sim, 1.5);
    expect(sim.player.draw).toBe(0);
  });

  it('builds while the button is held, quickly at first and harder toward the end', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    sim.enterAimMode();
    const samples: number[] = [];
    for (let i = 0; i < 60; i++) {
      sim.step(TICK_DT, aimIntent({ aim: true }), null);
      if (i % 12 === 11) samples.push(sim.player.draw);
    }
    expect(samples[0]).toBeGreaterThan(0.2);
    expect(samples[samples.length - 1]).toBeGreaterThan(0.95);
    // Tension: every fifth of a second adds less than the one before.
    const gains = samples.slice(1).map((v, i) => v - samples[i]);
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeLessThanOrEqual(gains[i - 1] + 1e-9);
  });

  it('eases back off when the pull is let go without a shot', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    sim.enterAimMode();
    step(sim, 0.8, aimIntent({ aim: true }));
    const drawn = sim.player.draw;
    // Not a release: the draw is dropped, not fired.
    const i = aimIntent();
    sim.step(TICK_DT, i, null);
    expect(sim.player.draw).toBeLessThan(drawn);
    expect(sim.player.draw).toBeGreaterThan(drawn - 0.1);
    step(sim, 0.6);
    expect(sim.player.draw).toBe(0);
    expect(sim.projectiles.length).toBe(0);
  });

  it('fires on release, the frame it is let go, with the draw it was held at', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    sim.enterAimMode();
    step(sim, 0.8, aimIntent({ aim: true }));
    let fired: number | null = null;
    sim.bus.on('player:fire', ({ draw }) => { fired = draw; });
    sim.step(TICK_DT, aimIntent({ firePressed: true }), null);
    expect(sim.projectiles.length).toBe(1);
    expect(fired).not.toBeNull();
    expect(fired!).toBeGreaterThan(0.9);
  });

  it('shakes a full draw held too long into a worse shot', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    sim.enterAimMode();
    step(sim, 1, aimIntent({ aim: true }));
    const steady = sim.aim.sway;
    step(sim, 3, aimIntent({ aim: true }));
    expect(sim.player.drawHeld).toBeGreaterThan(2);
    expect(sim.aim.sway).toBeGreaterThan(steady);
  });
});

describe('a stone has weight', () => {
  const stone = (vx: number, vz: number): Projectile => {
    const p = fire({ x: 0, y: 0 }, 0, 1, 0, new Rng(1));
    p.vel = { x: vx, y: 0 };
    p.vz = vz;
    return p;
  };
  const groundHit = (p: Projectile): Impact => ({
    projectile: p, kind: 'ground', pos: { ...p.pos }, z: 0, vel: { ...p.vel }, vz: p.vz, from: { x: p.pos.x, y: p.pos.y, z: 0.2 },
  });

  it('skips on a road and dies in a lawn', () => {
    const road = stone(20, -9);
    const lawn = stone(20, -9);
    expect(rebound(groundHit(road), 'asphalt', () => false)).toBe('bounce');
    const r = rebound(groundHit(lawn), 'grass', () => false);
    expect(r).not.toBe('bounce');
    expect(road.vz).toBeCloseTo(9 * BOUNCE.asphalt[0], 5);
    expect(Math.abs(road.vel.x)).toBeGreaterThan(Math.abs(lawn.vel.x));
  });

  it('rolls out and comes to rest, rather than stopping dead', () => {
    const p = stone(6, -1);
    expect(rebound(groundHit(p), 'asphalt', () => false)).toBe('roll');
    expect(p.rolling).toBe(true);
    let t = 0;
    while (Math.hypot(p.vel.x, p.vel.y) > 0.25 && t < 5) { stepProjectile(p, flat, TICK_DT); t += TICK_DT; }
    expect(t).toBeGreaterThan(0.1);
    expect(t).toBeLessThan(2);
    expect(p.pos.x).toBeGreaterThan(0.3);
  });

  it('glances off a wall and comes back the way it came', () => {
    const p = stone(18, 0);
    p.pos = { x: 10.2, y: 0 };
    const wall = (q: { x: number; y: number }) => q.x >= 10;
    const hit: Impact = {
      projectile: p, kind: 'building', pos: { ...p.pos }, z: 1.5, vel: { ...p.vel }, vz: 0,
      from: { x: 9.9, y: 0, z: 1.5 },
    };
    expect(rebound(hit, 'building', wall, () => 6)).toBe('bounce');
    expect(p.vel.x).toBeLessThan(0);
    expect(p.pos.x).toBeLessThan(10);
  });

  it('keeps flying in the simulation after it first touches the road', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    let bounces = 0;
    let impacts = 0;
    sim.bus.on('projectile:bounce', () => { bounces++; });
    sim.bus.on('projectile:impact', () => { impacts++; });
    // Flat and hard down the street.
    shootAt(sim, { x: 158, y: 240 }, 0, 0, 1);
    expect(impacts).toBeGreaterThanOrEqual(1);
    expect(bounces + impacts).toBeGreaterThanOrEqual(2);
    expect(sim.droppedRocks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('every stone that lands is left lying somewhere', () => {
  it('settles each one, however long it skipped and rolled', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    for (let i = 0; i < 4; i++) shootAt(sim, { x: 158 + (i - 1.5) * 2, y: 250 }, 0, 0, 1);
    step(sim, 4);
    expect(sim.projectiles.length).toBe(0);
    expect(sim.droppedRocks.length).toBe(4);
  });
});

describe('the town reacts to a stone', () => {
  it('turns a camera built to turn toward a sound, and back again', () => {
    const sim = makeSim();
    const cam = sim.sensors.find((s) => s.data.sweep > 0)!;
    const d = cam.data;
    const at = { x: d.pos.x + Math.cos(d.facing + 1.4) * 6, y: d.pos.y + Math.sin(d.facing + 1.4) * 6 };
    const bearing = Math.atan2(at.y - d.pos.y, at.x - d.pos.x);
    const off = () => Math.abs(Math.atan2(Math.sin(cam.facing - bearing), Math.cos(cam.facing - bearing)));
    const before = off();
    let heard = false;
    sim.bus.on('world:attention', ({ sensors }) => { heard = sensors.includes(d.id); });
    sim.drawAttention(at, 20, 3);
    step(sim, 1.2);
    // If a wall happened to be in the way the camera would rightly not turn.
    if (!sim.world.blocked(d.pos, at, d.height)) {
      expect(heard).toBe(true);
      expect(off()).toBeLessThan(before * 0.5 + 0.05);
      step(sim, 4);
      expect(cam.attend).toBeNull();
    }
  });

  it('sends birds out of a tree the first time, and only the first time', () => {
    const sim = makeSim();
    const tree = sim.world.data.props.find((p) => p.kind === 'tree'
      && !sim.world.buildingAt({ x: p.pos.x + 12, y: p.pos.y })
      && !sim.world.blocked({ x: p.pos.x + 12, y: p.pos.y }, p.pos, 1.6))!;
    expect(tree).toBeDefined();
    const hits: boolean[] = [];
    sim.bus.on('foliage:hit', ({ birds }) => hits.push(birds));
    place(sim, { x: tree.pos.x + 12, y: tree.pos.y });
    shootAt(sim, tree.pos, 3.6 * tree.scale);
    shootAt(sim, tree.pos, 3.6 * tree.scale);
    expect(hits.length).toBe(2);
    expect(hits).toEqual([true, false]);
  });

  it('never names a bin or a tree in the shot result — only things with names', () => {
    const sim = makeSim();
    const tree = sim.world.data.props.find((p) => p.kind === 'tree'
      && !sim.world.buildingAt({ x: p.pos.x + 12, y: p.pos.y })
      && !sim.world.blocked({ x: p.pos.x + 12, y: p.pos.y }, p.pos, 1.6))!;
    place(sim, { x: tree.pos.x + 12, y: tree.pos.y });
    shootAt(sim, tree.pos, 3.6 * tree.scale);
    expect(sim.lastShot?.hit).toBe(true);
    expect(sim.lastShot?.label).toBe('');
  });
});

describe('the plan is somewhere you can move', () => {
  const planning = (push = true) => aimIntent({ planView: true, push, pushPressed: push });

  it('lets the player keep skating with the plan open', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    sim.player.heading = Math.PI / 2;
    step(sim, 2, planning());
    expect(sim.planViewActive).toBe(true);
    expect(sim.player.speed).toBeGreaterThan(3);
  });

  it('still will not let the player shoot or reach into anything from it', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    step(sim, 1, aimIntent({ planView: true, aim: true, fire: true, firePressed: true, interactPressed: true }));
    expect(sim.projectiles.length).toBe(0);
    expect(sim.player.aiming).toBe(false);
    expect(sim.focusNode).toBeNull();
  });
});

describe('the keyboard: held keys do what a held thumb does', () => {
  class FakeTarget {
    private l = new Map<string, Set<(e: unknown) => void>>();
    addEventListener(t: string, f: (e: unknown) => void) { if (!this.l.has(t)) this.l.set(t, new Set()); this.l.get(t)!.add(f); }
    removeEventListener(t: string, f: (e: unknown) => void) { this.l.get(t)?.delete(f); }
    fire(t: string, d: Record<string, unknown> = {}) { for (const f of this.l.get(t) ?? []) f(d); }
  }
  const make = () => { const target = new FakeTarget(); const input = new InputManager(); input.attach(target as unknown as Window); return { target, input }; };

  it('keeps asking to push while W is held, so a held key rolls on', () => {
    const { target, input } = make();
    target.fire('keydown', { code: 'KeyW', repeat: false });
    for (let i = 0; i < 30; i++) expect(input.sample().pushPressed).toBe(true);
    target.fire('keyup', { code: 'KeyW' });
    expect(input.sample().pushPressed).toBe(false);
  });

  it('actually keeps the board rolling under a held W', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    sim.player.heading = Math.PI / 2;
    const { target, input } = make();
    target.fire('keydown', { code: 'KeyW', repeat: false });
    for (let i = 0; i < 60 * 3; i++) sim.step(TICK_DT, input.sample(), null);
    expect(sim.player.speed).toBeGreaterThan(7);
  });

  it('opens the plan on a tap of Q and keeps it open until the next tap', () => {
    const { target, input } = make();
    target.fire('keydown', { code: 'KeyQ', repeat: false });
    input.sample();
    target.fire('keyup', { code: 'KeyQ' });
    for (let i = 0; i < 40; i++) expect(input.sample().planView).toBe(true);
    target.fire('keydown', { code: 'KeyQ', repeat: false });
    expect(input.sample().planView).toBe(false);
  });

  it('treats a long hold of Q as a peek, closing when it is let go', () => {
    const { target, input } = make();
    target.fire('keydown', { code: 'KeyQ', repeat: false });
    for (let i = 0; i < 40; i++) expect(input.sample().planView).toBe(true);
    target.fire('keyup', { code: 'KeyQ' });
    expect(input.sample().planView).toBe(false);
  });

  it('turns the sling with the mouse, and ignores a pointer-lock warp', () => {
    const { target, input } = make();
    target.fire('mousemove', { clientX: 0, clientY: 0, movementX: 12, movementY: -4 });
    target.fire('mousemove', { clientX: 0, clientY: 0, movementX: 640, movementY: 380 });
    target.fire('mousemove', { clientX: 0, clientY: 0, movementX: -640, movementY: -380 });
    target.fire('mousemove', { clientX: 0, clientY: 0, movementX: 8, movementY: 2 });
    expect(input.takeLook()).toEqual({ x: 20, y: -2 });
    expect(input.takeLook()).toEqual({ x: 0, y: 0 });
  });
});

describe('the Community Safety Score is found, not shown', () => {
  it('is not known at the start of an afternoon', () => {
    const sim = makeSim();
    step(sim, 2);
    expect(sim.scoreDiscovered).toBe(false);
  });

  it('is found by reading a camera, which lists who it holds', () => {
    const sim = makeUnlockedSim();
    let heard: string | null = null;
    sim.bus.on('score:discovered', ({ where }) => { heard = where; });
    const cam = [...sim.network.nodes.values()].find((n) => n.kind === 'CAMERA')!;
    place(sim, { x: cam.pos.x + 2, y: cam.pos.y + 2 });
    sim.selectNode(cam.id);
    step(sim, 0.2);
    expect(sim.scoreDiscovered).toBe(true);
    expect(heard).toBe(cam.id);
    expect(sim.scoreFoundAt).toBe(cam.id);
  });

  it('is found on the plan once VISION puts subjects on it — and not before', () => {
    const locked = makeSim();
    step(locked, 2, aimIntent({ planView: true }));
    expect(locked.scoreDiscovered).toBe(false);

    const open = makeUnlockedSim();
    step(open, 2, aimIntent({ planView: true }));
    expect(open.scoreDiscovered).toBe(true);
    expect(open.scoreFoundAt).toBe('the plan');
  });

  it('is found once: a second discovery says nothing', () => {
    const sim = makeUnlockedSim();
    let n = 0;
    sim.bus.on('score:discovered', () => { n++; });
    sim.discoverScore('CM-001');
    sim.discoverScore('the plan');
    step(sim, 0.1);
    expect(n).toBe(1);
    expect(sim.scoreFoundAt).toBe('CM-001');
  });
});

describe('the camera sees enough of the town', () => {
  it('never gives an upright phone less than 48 degrees across', () => {
    for (const [w, h] of [[320, 568], [375, 667], [390, 664], [430, 932]]) {
      const hfov = 2 * Math.atan((w / 2) / focalFor(w, h)) * 180 / Math.PI;
      expect(hfov).toBeGreaterThanOrEqual(47.99);
    }
  });

  it('leaves a landscape screen exactly as it was: forty degrees vertical', () => {
    const vfov = 2 * Math.atan((760 / 2) / focalFor(1280, 760)) * 180 / Math.PI;
    expect(vfov).toBeCloseTo(40, 5);
  });

  it('finds the ground under the pointer: the inverse of drawing it', () => {
    const r = new PerspectiveRenderer();
    const eye = { pos: { x: 100, y: 200, z: 18 }, yaw: 0.7, pitch: -0.2 };
    for (const g of [{ x: 130, y: 225 }, { x: 118, y: 240 }, { x: 150, y: 210 }]) {
      const s = r.project3(eye, g.x, g.y, 0, 1280, 760)!;
      const back = r.groundAt(eye, s.x, s.y, 1280, 760)!;
      expect(back.x).toBeCloseTo(g.x, 4);
      expect(back.y).toBeCloseTo(g.y, 4);
    }
    // Above the horizon there is no ground.
    expect(r.groundAt(eye, 640, 0, 1280, 760)).toBeNull();
  });
});

describe('Devon rides beside you, not between you and the camera', () => {
  it('settles off the shoulder, clear of the line straight back from the board', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    sim.player.heading = Math.PI / 2;
    sim.devonPos = { x: 158, y: 205 };
    sim.meetDevon();
    skate(sim, 5);
    const h = sim.player.heading;
    const rel = { x: sim.devonPos.x - sim.player.pos.x, y: sim.devonPos.y - sim.player.pos.y };
    const behind = -(rel.x * Math.cos(h) + rel.y * Math.sin(h));
    const lateral = Math.abs(-rel.x * Math.sin(h) + rel.y * Math.cos(h));
    expect(behind).toBeGreaterThan(3);
    expect(lateral).toBeGreaterThan(1.8);
  });
});

describe('the plan names the streets the town talks about', () => {
  it('carries every authored street name into the world, Northgate Lane included', () => {
    const sim = makeSim();
    const names = (sim.world.data.streets ?? []).map((s) => s.name);
    expect(names).toContain('Northgate Lane');
    expect(names).toContain('Bellhaven Avenue');
    for (const st of sim.world.data.streets ?? []) expect(st.pts.length).toBeGreaterThanOrEqual(2);
  });

  it('puts CM-207 — the camera the story names — within a few metres of the lane it is named for', () => {
    const sim = makeSim();
    const lane = sim.world.data.streets!.find((s) => s.name === 'Northgate Lane')!;
    const cam = sim.network.get('CM-207')!;
    const nearest = Math.min(...lane.pts.slice(1).map((b, i) => {
      const a = lane.pts[i];
      const t = Math.max(0, Math.min(1, ((cam.pos.x - a.x) * (b.x - a.x) + (cam.pos.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)));
      return Math.hypot(cam.pos.x - (a.x + (b.x - a.x) * t), cam.pos.y - (a.y + (b.y - a.y) * t));
    }));
    expect(nearest).toBeLessThan(35);
  });
});

describe('the notes say where the number was found, in English', () => {
  it('says "on the plan" for the plan and names the camera otherwise', async () => {
    const { PHONE } = await import('../src/content/copy');
    expect(PHONE.notes(80, 'NOMINAL', 'the plan')).toContain('Found it on the plan.');
    expect(PHONE.notes(80, 'NOMINAL', 'CM-207')).toContain("Found it in CM-207's record.");
  });
});
