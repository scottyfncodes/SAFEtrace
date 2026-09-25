/**
 * The escalation ladder: avoid, hide, distract, manipulate, sabotage, destroy.
 *
 * Each rung solves a problem and leaves a different amount behind. These
 * tests hold the ladder in place — that going round is free, that a stone
 * works until a place has heard too many, that breaking a camera works and
 * makes the street around it harder, that a hack is clean now and traced
 * later — and that none of it, on its own, sends anybody after the player.
 */
import { describe, expect, it } from 'vitest';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { dist } from '../src/core/math';
import { makeSim, makeUnlockedSim, place, shootAt, skate, step } from './harness';
import {
  Disturbance, DISTURBANCE, levelForHeat,
} from '../src/sim/surveillance/disturbance';
import { analyse, makeEvidence } from '../src/sim/surveillance/evidence';
import { Rng } from '../src/core/rng';
import { makeTrack } from '../src/sim/surveillance/fusion';
import { SYSTEM } from '../src/content/copy';
import { readPlan } from '../src/render/plan';
import type { Sim } from '../src/sim/sim';

/** CM-207 swings; a clear patch of road beside it, and a place to throw from. */
const NOISE_AT = { x: 149, y: 78 };
const THROW_FROM = { x: 169, y: 78 };

function stoneInto(sim: Sim, at = NOISE_AT): { turned: string[]; discounted: boolean } {
  let out = { turned: [] as string[], discounted: false };
  const off = sim.bus.on('world:attention', (e) => {
    if (e.sensors.length) out = { turned: e.sensors, discounted: !!e.discounted };
  });
  shootAt(sim, at, 0);
  step(sim, 0.3);
  off?.();
  return out;
}

describe('the disturbance ledger', () => {
  it('remembers a place, forgets it with time, and ranks the ladder', () => {
    const d = new Disturbance();
    const at = { x: 0, y: 0 };
    d.record('noise', at, 0, 'maple');
    const stone = d.heatAt(at, 0);
    d.record('sabotage', { x: 100, y: 0 }, 0, 'maple');
    const broken = d.heatAt({ x: 100, y: 0 }, 0);
    // Breaking a camera is several stones' worth of trouble.
    expect(broken).toBeGreaterThan(stone * 5);
    // Heat falls off with distance and fades with time.
    expect(d.heatAt({ x: 20, y: 0 }, 0)).toBeLessThan(stone);
    expect(d.heatAt(at, 60 * 600)).toBeLessThan(0.01);
    expect(levelForHeat(DISTURBANCE.pattern)).toBe('PATTERN');
  });

  it('announces a district going up, holds it against flicker, and lets it go', () => {
    const d = new Disturbance();
    for (let i = 0; i < 5; i++) d.record('noise', { x: 0, y: 0 }, 0, 'maple');
    const up = d.update(0);
    expect(up.map((c) => c.to)).toEqual(['PATTERN']);
    expect(d.districtLevel('maple')).toBe('PATTERN');
    // Just under the line is not enough to drop it.
    const justUnder = Math.round(60 * 75 * Math.log2(3.75 / (DISTURBANCE.pattern * 0.95)));
    expect(d.update(justUnder)).toEqual([]);
    const later = d.update(60 * 900);
    expect(later.at(-1)?.to).toBe('QUIET');
    expect(d.events.length).toBe(0);
  });

  it('knows what kind of trouble a street has had', () => {
    const d = new Disturbance();
    d.record('noise', { x: 0, y: 0 }, 0, 'maple');
    d.record('clatter', { x: 5, y: 0 }, 0, 'maple');
    expect(d.dominant('maple', 0)).toBe('noise');
    d.record('sabotage', { x: 5, y: 5 }, 0, 'maple');
    expect(d.dominant('maple', 0)).toBe('broken');
    expect(d.dominant('commons', 0)).toBeNull();
  });
});

describe('avoid: going round leaves nothing', () => {
  it('skating the town — pushing, carving, popping — records no disturbance and starts no pursuit', () => {
    const sim = makeSim();
    place(sim, { x: 155, y: 190 }, { x: 0, y: -4 });
    skate(sim, 6, 0.2);
    const it = emptyIntent();
    it.trickPressed = true;
    sim.step(TICK_DT, it, null);
    skate(sim, 4, -0.2);
    expect(sim.disturbance.events.length).toBe(0);
    expect(sim.pursuit).toBe('NOT_PURSUING');
  });
});

describe('distract: a stone moves attention, until a place stops believing it', () => {
  it('turns the camera toward the sound', () => {
    const sim = makeUnlockedSim();
    place(sim, THROW_FROM);
    const r = stoneInto(sim);
    expect(r.turned).toContain('CM-207');
    expect(r.discounted).toBe(false);
    const cam = sim.sensorById.get('CM-207')!;
    expect(dist(cam.attend!, NOISE_AT)).toBeLessThan(3);
  });

  it('after enough noise in one place, looks back up the throw at whoever made it', () => {
    const sim = makeUnlockedSim();
    const said: string[] = [];
    sim.bus.on('safetrace:message', (m) => said.push(...m.lines));
    place(sim, THROW_FROM);
    let r = stoneInto(sim);
    for (let i = 0; i < 6 && !r.discounted; i++) r = stoneInto(sim);
    expect(r.discounted).toBe(true);
    const cam = sim.sensorById.get('CM-207')!;
    // Not at the noise: back along the line the stone came in on, near the thrower.
    expect(dist(cam.attend!, THROW_FROM)).toBeLessThan(8);
    expect(dist(cam.attend!, NOISE_AT)).toBeGreaterThan(12);
    expect(said).toContain(SYSTEM.noiseDiscounted);
    step(sim, 1.2);
    expect(said.some((l) => l.startsWith('PATTERN DETECTED'))).toBe(true);
    // Somebody is sent to look at the street — a place, not a person.
    expect(sim.tasking.some((t) => t.task?.reason.startsWith('PATTERN DETECTED'))).toBe(true);
    expect(sim.tasking.every((t) => !t.task || t.task.kind !== 'TRACK')).toBe(true);
  });

  it('the first two stones pass unremarked; the third is noticed', () => {
    const sim = makeUnlockedSim();
    place(sim, THROW_FROM);
    stoneInto(sim); stoneInto(sim);
    step(sim, 0.6);
    expect(sim.disturbance.districtLevel('northgate')).toBe('QUIET');
    stoneInto(sim);
    step(sim, 0.6);
    expect(sim.disturbance.districtLevel('northgate')).toBe('NOTICED');
  });

  it('forgets, given time, and the trick works again', () => {
    const sim = makeUnlockedSim();
    place(sim, THROW_FROM);
    for (let i = 0; i < 6; i++) stoneInto(sim);
    expect(sim.disturbance.levelAt(NOISE_AT, sim.tick)).not.toBe('QUIET');
    step(sim, 420);
    expect(sim.disturbance.levelAt(NOISE_AT, sim.tick)).toBe('QUIET');
    const r = stoneInto(sim);
    expect(r.discounted).toBe(false);
  });

  it('a street that has heard too much looks up at the skater going past', () => {
    const sim = makeSim();
    const n = sim.npcs[0];
    for (let i = 0; i < 6; i++) sim.disturbance.record('noise', n.pos, sim.tick, 'maple');
    n.glanceCooldown = 0; n.startled = 0; n.fleeing = 0; n.glancing = 0;
    place(sim, { x: n.pos.x + 3, y: n.pos.y });
    // Only if nothing stands between them.
    expect(sim.world.blocked(n.pos, sim.player.pos, 1.5)).toBe(false);
    sim.step(TICK_DT, emptyIntent(), null);
    expect(n.glancing ?? 0).toBeGreaterThan(0);
    expect(dist(n.lookAt!, sim.player.pos)).toBeLessThan(1);
  });
});

describe('sabotage: it works, and the street closes ranks', () => {
  it('a dead camera brings somebody to look at it and puts its segment on watch', () => {
    // A real shot; the lens/motor/mount roll is seeded, so find an afternoon where it is the lens.
    let sim: Sim | null = null;
    for (let seed = 1; seed < 40 && !sim; seed++) {
      const s = makeUnlockedSim(seed);
      place(s, { x: 145, y: 62 });
      const cam = s.sensorById.get('CM-207')!;
      shootAt(s, cam.data.pos, cam.data.height);
      if (cam.state === 'OFFLINE') sim = s;
    }
    expect(sim).not.toBeNull();
    const cam = sim!.sensorById.get('CM-207')!;
    const sibling = sim!.sensorById.get('CM-008')!;
    expect(sim!.disturbance.levelAt(cam.data.pos, sim!.tick)).toBe('PATTERN');
    expect(sim!.tasking.some((t) => t.task?.reason === SYSTEM.nodeInspect('CM-207'))).toBe(true);
    step(sim!, 4);
    // CM-008 is a fixed camera on the same segment, down the street. It starts to scan.
    expect(sibling.vigilance).toBeGreaterThan(0.4);
    // The segment runs across half the town; its far end does not care.
    const far = sim!.sensors.filter((x) => x.data.id !== 'CM-207'
      && sim!.network.get(x.data.nodeId)?.segmentId === sim!.network.get(cam.data.nodeId)?.segmentId
      && dist(x.data.pos, cam.data.pos) > 90);
    expect(far.length).toBeGreaterThan(0);
    for (const x of far) expect(x.vigilance).toBeLessThan(0.05);
    const a = sibling.facing;
    step(sim!, 3);
    expect(Math.abs(sibling.facing - a)).toBeGreaterThan(0.02);
  });

  it('a watchful camera hears further than a calm one', () => {
    const sim = makeSim();
    const cam = sim.sensors.find((s) => s.data.sweep > 0)!;
    const d = cam.data;
    expect.hasAssertions();
    // Just beyond what a stone normally carries to.
    for (let r = 14; r < 30; r += 0.5) {
      const at = { x: d.pos.x + Math.cos(d.facing) * r, y: d.pos.y + Math.sin(d.facing) * r };
      if (sim.world.blocked(d.pos, at, d.height)) break;
      if (sim.wouldHear(at, 7).includes(d.id)) continue;
      cam.vigilance = 1;
      expect(sim.wouldHear(at, 7)).toContain(d.id);
      return;
    }
  });

  it('damage nobody can be linked to is still logged, and the log closes when the place goes quiet', () => {
    const sim = makeSim();
    const pos = { x: 145, y: 88 };
    for (const t of sim.allTracks) t.confidence = 0;
    const priv = sim as unknown as { addEvidence: (...a: unknown[]) => void };
    priv.addEvidence('NODE_OFFLINE', pos, 'NODE TEST OFFLINE', null, []);
    sim.disturbance.record('sabotage', pos, sim.tick, 'northgate', 'CM-207');
    step(sim, 4);
    const inc = sim.incidents.find((i) => i.label === SYSTEM.incidentVandalism);
    expect(inc?.open).toBe(true);
    step(sim, 60 * 16);
    expect(inc?.open).toBe(false);
  });

  it('disturbance alone never sends anybody after the player', () => {
    const sim = makeSim();
    place(sim, { x: 150, y: 200 });
    for (let i = 0; i < 6; i++) sim.disturbance.record('sabotage', { x: 150 + i, y: 200 }, sim.tick, 'maple', 'X');
    step(sim, 30);
    expect(sim.pursuit).toBe('NOT_PURSUING');
    expect(sim.playerTrack.wantedUntil).toBeLessThan(sim.tick);
  });

  it('forensics in a place already under review run sooner and search a tighter disc', () => {
    const vel = { x: 18, y: 4 };
    const calm = makeEvidence('NODE_OFFLINE', { x: 0, y: 0 }, 0, 'x', { impactVel: vel, impactVz: -3, impactZ: 4 });
    const hot = makeEvidence('NODE_OFFLINE', { x: 0, y: 0 }, 0, 'x', { impactVel: vel, impactVz: -3, impactZ: 4, scrutiny: 1 });
    expect(hot.analysisCompleteTick).toBeLessThan(calm.analysisCompleteTick);
    const track = makeTrack({
      id: 'S', kind: 'resident', identity: 'S', displayName: 'S', pos: { x: 500, y: 500 },
      vel: { x: 0, y: 0 }, speed: 0, districtPriors: {}, priorContacts: 0, familiarity: 1,
    });
    analyse(calm, [track], new Rng(7));
    analyse(hot, [track], new Rng(7));
    expect(hot.originUncertainty).toBeLessThan(calm.originUncertainty);
  });
});

describe('manipulate: a hack is clean now and traced later', () => {
  it('LOOP leaves nothing when it runs, and a tamper mark when the check finds it', () => {
    const sim = makeUnlockedSim();
    const node = sim.network.get('CM-207')!;
    sim.applyHack('LOOP', 'CM-207');
    expect(sim.disturbance.events.length).toBe(0);
    const due = node.checkTick - sim.tick;
    step(sim, due / 60 + 0.5);
    expect(sim.disturbance.events.some((e) => e.kind === 'tamper')).toBe(true);
  });

  it('a hot segment checks its feeds sooner', () => {
    const calm = makeUnlockedSim(99);
    calm.applyHack('LOOP', 'CM-207');
    const hot = makeUnlockedSim(99);
    const pos = hot.network.get('CM-207')!.pos;
    for (let i = 0; i < 3; i++) hot.disturbance.record('sabotage', pos, hot.tick, 'northgate');
    hot.applyHack('LOOP', 'CM-207');
    const wait = (s: Sim) => s.network.get('CM-207')!.checkTick - s.tick;
    expect(wait(hot)).toBeLessThan(wait(calm));
  });

  it('REROUTE is a false flag the place remembers', () => {
    const sim = makeUnlockedSim();
    const node = [...sim.network.nodes.values()].find((n) => n.kind === 'JUNCTION')!;
    sim.applyHack('REROUTE', node.id);
    expect(sim.disturbance.events.map((e) => e.kind)).toEqual(['falseflag']);
  });
});

describe('the board: noise is visibility', () => {
  function turner(sim: Sim) {
    // A turning camera with open ground a few metres in front of it.
    for (const s of sim.sensors) {
      if (s.data.sweep <= 0) continue;
      const at = { x: s.data.pos.x + Math.cos(s.data.facing) * 5, y: s.data.pos.y + Math.sin(s.data.facing) * 5 };
      if (sim.world.buildingAt(at) || sim.world.blocked(s.data.pos, at, s.data.height)) continue;
      return { s, at };
    }
    throw new Error('no turner');
  }

  it('a trick landed under a camera turns it toward the rider', () => {
    const sim = makeSim();
    const { s, at } = turner(sim);
    place(sim, at);
    const it = emptyIntent();
    it.trickPressed = true;
    sim.step(TICK_DT, it, null);
    expect(s.attend).not.toBeNull();
    expect(dist(s.attend!, at)).toBeLessThan(1.5);
  });

  it('rolling past without pushing makes no sound at all', () => {
    const sim = makeSim();
    const { s, at } = turner(sim);
    const dir = { x: -Math.sin(s.data.facing), y: Math.cos(s.data.facing) };
    place(sim, { x: at.x - dir.x * 6, y: at.y - dir.y * 6 }, { x: dir.x * 4, y: dir.y * 4 });
    step(sim, 2.5);
    expect(s.attend).toBeNull();
  });
});

describe('hide: what the system cannot see, it cannot judge', () => {
  it('waiting somewhere unwatched is not loitering; waiting in view is', () => {
    const hidden = makeSim();
    place(hidden, { x: 300, y: 442 });
    step(hidden, 12);
    expect(hidden.playerTrack.flags.has('LOITERING')).toBe(false);

    const seen = makeUnlockedSim();
    place(seen, { x: 145, y: 70 });
    step(seen, 12);
    expect(seen.playerTrack.confidence).toBeGreaterThan(0.3);
    expect(seen.playerTrack.flags.has('LOITERING')).toBe(true);
  });

  it('a tree crown thins a camera\'s view; a parked car hides a rider who has stopped behind it', () => {
    const sim = makeSim();
    const w = sim.world;
    const tree = w.data.props.find((p) => p.kind === 'tree')!;
    const eye = { x: tree.pos.x - 8, y: tree.pos.y };
    expect(w.softCover(eye, 5, { x: tree.pos.x + 14, y: tree.pos.y }, 3)).toBeLessThan(0.5);

    const car = w.data.props.find((p) => p.kind === 'car')!;
    const side = { x: -Math.sin(car.rot), y: Math.cos(car.rot) };
    const cam = { x: car.pos.x + side.x * 28, y: car.pos.y + side.y * 28 };
    const behind = { x: car.pos.x - side.x * 1.6, y: car.pos.y - side.y * 1.6 };
    expect(w.softCover(cam, 4.5, behind, 0)).toBe(0);
    // Rolling, you are seen over it.
    expect(w.softCover(cam, 4.5, behind, 5)).toBe(1);
  });
});

describe('plan: the player\'s model of the surveillance', () => {
  it('before VISION shows only the cameras the player has noticed', () => {
    const sim = makeSim();
    const before = readPlan(sim, null).cameras.map((c) => c.id);
    expect(before).not.toContain('CM-207');
    place(sim, { x: 145, y: 70 });
    step(sim, 0.5);
    expect(readPlan(sim, null).cameras.map((c) => c.id)).toContain('CM-207');
    // VISION hands over the machine's full map.
    sim.unlockVision();
    expect(readPlan(sim, null).cameras.length).toBe(sim.sensors.length);
  });

  it('says when you are in view', () => {
    const sim = makeUnlockedSim();
    place(sim, { x: 145, y: 70 });
    step(sim, 0.5);
    expect(sim.playerObserved).toBe(true);
    expect(readPlan(sim, null).lines[0]).toMatch(/^IN VIEW/);
  });

  it('with a pin down, says which cameras a stone there would turn — and when they would look back', () => {
    const sim = makeUnlockedSim();
    place(sim, THROW_FROM);
    const r = readPlan(sim, NOISE_AT);
    expect(r.earshot?.stone).toContain('CM-207');
    expect(r.lines.some((l) => l.startsWith('A STONE BY THE PIN TURNS'))).toBe(true);
    // The preview and the real thing agree.
    expect(stoneInto(sim).turned).toEqual(sim.wouldHear(NOISE_AT, 7));
    for (let i = 0; i < 6; i++) stoneInto(sim);
    const wary = readPlan(sim, NOISE_AT);
    expect(wary.earshot?.wary).toBe(true);
    expect(wary.lines.some((l) => l.includes('LOOK BACK'))).toBe(true);
    expect(wary.marks.length).toBeGreaterThan(0);
  });
});
