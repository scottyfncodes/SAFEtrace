import { describe, expect, it } from 'vitest';
import { interact, makeUnlockedSim, place, shootAt, step } from './harness';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import type { Vec2 } from '../src/core/math';
import type { Sim } from '../src/sim/sim';
import { TRICKS } from '../src/sim/player';

/** Chest height on a person, which is what the sling is pointed at. */
const PERSON_Z = 1.15;

/** Aim at a point at a given height and release a fully drawn shot. */
function shoot(sim: Sim, at: Vec2 | (() => Vec2), z: number | (() => number) = 0): void {
  shootAt(sim, at, z);
}

describe('every rock is a rock, and no two are the same rock', () => {
  /*
   * The projectile was one hard-coded outline at one angle, so a street the
   * player had been shooting in ended up with a dozen identical pebbles in it —
   * the sort of thing you notice once and then cannot stop noticing.
   *
   * The variation is restrained on purpose. These are rocks, not a collection:
   * a shade bigger or smaller, a little wider than tall, turned to their own
   * angle, lumpier or smoother round the edge. Nothing that could read as a
   * second kind of ammunition, because there is only one kind.
   */
  const rocks = (n: number) => {
    const sim = makeUnlockedSim();
    place(sim, { x: 145, y: 62 });
    for (let i = 0; i < n; i++) shootAt(sim, { x: 175, y: 30 });
    return sim.droppedRocks.map((r) => r.shape);
  };

  it('gives each stone its own silhouette', () => {
    const shapes = rocks(12);
    expect(shapes.length).toBe(12);
    for (const key of ['size', 'squash', 'spin', 'jag', 'phase'] as const) {
      const distinct = new Set(shapes.map((s) => s[key].toFixed(4)));
      expect({ key, varied: distinct.size > shapes.length * 0.7 })
        .toEqual({ key, varied: true });
    }
  });

  it('keeps every one of them inside "that is a rock"', () => {
    for (const s of rocks(40)) {
      // Never half again as big or small as the next one, never a sliver, and
      // never lumpy enough to lose the round.
      expect(s.size).toBeGreaterThan(0.8);
      expect(s.size).toBeLessThan(1.2);
      expect(s.squash).toBeGreaterThan(0.8);
      expect(s.squash).toBeLessThan(1.2);
      expect(s.jag).toBeLessThanOrEqual(1.4);
    }
  });

  it('throws the same stones on a replay, and the one that lands is the one that flew', () => {
    const a = rocks(6).map((s) => `${s.size}:${s.squash}:${s.spin}:${s.jag}:${s.phase}`);
    const b = rocks(6).map((s) => `${s.size}:${s.squash}:${s.spin}:${s.jag}:${s.phase}`);
    expect(a).toEqual(b);

    const sim = makeUnlockedSim();
    place(sim, { x: 145, y: 62 });
    const it = emptyIntent();
    it.aim = true;
    for (let i = 0; i < 40; i++) sim.step(TICK_DT, it, { x: 175, y: 30 });
    const f = emptyIntent();
    f.aim = true; f.fire = true; f.firePressed = true;
    sim.step(TICK_DT, f, { x: 175, y: 30 });
    const thrown = sim.projectiles[0].shape;
    for (let i = 0; i < 300 && sim.projectiles.length > 0; i++) sim.step(TICK_DT, emptyIntent(), null);
    expect(sim.droppedRocks[sim.droppedRocks.length - 1].shape).toEqual(thrown);
  });
});

describe('the slingshot loop', () => {
  it('takes a camera out of service, and costs nothing but the throw', () => {
    const sim = makeUnlockedSim();
    const cam = sim.sensorById.get('CM-207')!;
    // Stand in the street in front of the camera, at a workable range.
    place(sim, { x: 145, y: 62 });

    shoot(sim, cam.data.pos, cam.data.height);

    expect(['OFFLINE', 'MISALIGNED', 'FROZEN']).toContain(cam.state);
    // And a rock is left lying where it landed, because the world remembers.
    expect(sim.droppedRocks.length).toBeGreaterThan(0);
  });

  it('never runs out: a hundred rocks is the same as one', () => {
    const sim = makeUnlockedSim();
    place(sim, { x: 145, y: 62 });
    for (let i = 0; i < 100; i++) shoot(sim, { x: 145, y: 30 });
    // Still able to shoot, still able to aim, nothing counted, nothing spent.
    const cam = sim.sensorById.get('CM-207')!;
    shoot(sim, cam.data.pos, cam.data.height);
    expect(['OFFLINE', 'MISALIGNED', 'FROZEN']).toContain(cam.state);
  });

  it('creates evidence, analyses it, and reaches a verdict', () => {
    const sim = makeUnlockedSim();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: 145, y: 62 });
    shoot(sim, cam.data.pos, cam.data.height);

    expect(sim.evidence.size).toBeGreaterThan(0);
    const e = [...sim.evidence.values()][0];
    expect(e.stage).not.toBe('RESOLVED');

    // The analysis delay is the window in which a player leaves the origin.
    step(sim, 4);
    const after = [...sim.evidence.values()][0];
    expect(after.stage).toBe('RESOLVED');
    expect(after.originEstimate).toBeDefined();
  });

  it('links the shooter when they stay put, and not when they were never held', () => {
    const linked = (stay: boolean) => {
      const sim = makeUnlockedSim();
      const cam = sim.sensorById.get('CM-207')!;
      place(sim, { x: 145, y: 62 });
      // Let the system acquire the player first when we want a link.
      if (stay) step(sim, 3);
      shoot(sim, cam.data.pos, cam.data.height);
      if (!stay) {
        // Break contact entirely: the far side of town, inside the Channel.
        place(sim, { x: 300, y: 442 });
        sim.playerTrack.confidence = 0;
        sim.playerTrack.history.length = 0;
      }
      step(sim, 4);
      return [...sim.evidence.values()].some((e) => e.linkedTrackId === sim.playerTrack.id);
    };
    expect(linked(true)).toBe(true);
    expect(linked(false)).toBe(false);
  });

  it('turns a knocked-over bin into an anomaly that moves the asset pool', () => {
    const sim = makeUnlockedSim();
    // A bin with clear ground south of it, so the shot is about the bin rather
    // than about whatever happens to be authored behind it. Picking "the first
    // bin" made this test depend on content ordering.
    const bins = sim.world.data.props.filter((p) => p.kind === 'bin' && p.district === 'northgate');
    const bin = bins.find((p) => {
      for (let d = 2; d <= 14; d += 2) {
        if (sim.world.buildingAt({ x: p.pos.x, y: p.pos.y + d })) return false;
      }
      return true;
    })!;
    expect(bin, 'Northgate needs at least one bin approachable from the street').toBeDefined();
    place(sim, { x: bin.pos.x, y: bin.pos.y + 12 });
    expect(sim.dispatcher.activeAnomalies.length).toBe(0);

    shoot(sim, bin.pos);

    expect(bin.knocked).toBe(true);
    expect(sim.dispatcher.activeAnomalies.length).toBeGreaterThan(0);
    // Something is now on its way to a place the player is not.
    step(sim, 2);
    const tasked = sim.drones.some((d) => d.state === 'INVESTIGATE')
      || sim.patrols.some((p) => p.state === 'RESPONDING');
    expect(tasked).toBe(true);
  });

  /*
   * This replaces a test asserting that people were never ballistic targets.
   * They are now, deliberately: making them unhittable is a lie a player
   * catches in ten seconds, and making them damageable turns a disruption tool
   * into a weapon. So the bearing lands, nobody is hurt, and every consequence
   * lands on the person who threw it.
   */
  it('lets a person be aimed at, but never the player themselves', () => {
    const sim = makeUnlockedSim();
    const targets = sim.ballisticTargets();
    expect(targets.some((t) => t.kind === 'person')).toBe(true);
    expect(targets.some((t) => t.id === sim.playerSubject.id)).toBe(false);
  });

  it('hits a person without harming them, and makes it everyone else’s business', () => {
    const sim = makeUnlockedSim();
    const npc = sim.npcs[0];
    npc.route = [{ ...npc.pos }];
    npc.routeIndex = 0;
    place(sim, { x: npc.pos.x - 9, y: npc.pos.y });
    step(sim, 0.2);
    const before = { pos: { ...npc.pos }, risk: sim.playerTrack.risk.total };

    let struck: { witnesses: number; seen: boolean } | null = null;
    sim.bus.on('person:struck', (e) => { struck = e; });
    shoot(sim, { x: npc.pos.x, y: npc.pos.y }, PERSON_Z);
    sim.bus.flush();

    // It connected, and the person is entirely unharmed: no health, no damage,
    // no state on them that says otherwise. They are simply startled.
    expect(struck).not.toBeNull();
    expect(npc.startled).toBeGreaterThan(0);
    expect(Object.keys(npc)).not.toContain('health');

    // And the whole system turned round.
    expect([...sim.evidence.values()].some((e) => e.kind === 'PERSON_STRUCK')).toBe(true);
    expect(sim.playerTrack.risk.total).toBeGreaterThan(before.risk);
    expect(sim.dispatcher.activeAnomalies.length).toBeGreaterThan(0);
    void before.pos;
  });

  it('is worse on camera than off it: a frame puts your name on the incident', () => {
    // Staged where a lens definitely has line of sight — in front of CM-207.
    const run = (seen: boolean) => {
      const sim = makeUnlockedSim();
      const npc = sim.npcs[0];
      npc.pos = { x: 145, y: 70 };
      npc.route = [{ ...npc.pos }];
      npc.routeIndex = 0;
      if (!seen) for (const s of sim.sensors) { s.state = 'OFFLINE'; s.stateUntil = 1e9; }
      place(sim, { x: 136, y: 70 });
      step(sim, 0.2);
      shoot(sim, { x: npc.pos.x, y: npc.pos.y }, PERSON_Z);
      const inc = sim.incidents.find((i) => i.kind === 'PUBLIC_ORDER');
      const ev = [...sim.evidence.values()].find((e) => e.kind === 'PERSON_STRUCK');
      return { associated: inc?.associated.length ?? 0, watched: ev?.observedBy.length ?? 0 };
    };
    const on = run(true);
    const off = run(false);
    expect(on.watched).toBeGreaterThan(0);
    expect(off.watched).toBe(0);
    // Off camera it is an incident near you. On camera it is your incident.
    expect(on.associated).toBeGreaterThan(off.associated);
  });

  it('startles the people who watched it happen, not only the one it hit', () => {
    const sim = makeUnlockedSim();
    const npc = sim.npcs[0];
    npc.route = [{ ...npc.pos }];
    npc.routeIndex = 0;
    // A bystander, close enough to see.
    const near = sim.npcs[1];
    near.route = [{ x: npc.pos.x + 6, y: npc.pos.y + 2 }];
    near.routeIndex = 0;
    near.pos = { x: npc.pos.x + 6, y: npc.pos.y + 2 };
    place(sim, { x: npc.pos.x - 9, y: npc.pos.y });
    step(sim, 0.2);
    shoot(sim, { x: npc.pos.x, y: npc.pos.y }, PERSON_Z);
    expect(near.startled).toBeGreaterThan(0);
  });

  it('sends them away afterwards rather than back to their walk', () => {
    const sim = makeUnlockedSim();
    const npc = sim.npcs[0];
    npc.route = [{ ...npc.pos }];
    npc.routeIndex = 0;
    place(sim, { x: npc.pos.x - 9, y: npc.pos.y });
    step(sim, 0.2);
    shoot(sim, { x: npc.pos.x, y: npc.pos.y }, PERSON_Z);
    const at = { ...npc.pos };
    step(sim, 6);
    expect(Math.hypot(npc.pos.x - at.x, npc.pos.y - at.y)).toBeGreaterThan(2);
    // And away from the person who did it, not toward them.
    expect(Math.hypot(npc.pos.x - sim.player.pos.x, npc.pos.y - sim.player.pos.y))
      .toBeGreaterThan(Math.hypot(at.x - sim.player.pos.x, at.y - sim.player.pos.y));
  });
});

describe('the hacking loop', () => {
  it('QUERY reveals a node’s edges, which is how the network becomes a place', () => {
    const sim = makeUnlockedSim();
    const node = sim.network.get('CM-207')!;
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 });
    step(sim, 0.1);

    expect(sim.interactCandidate?.id).toBe('CM-207');
    expect(interact(sim)).toBe(true);
    expect(sim.focusNode?.id).toBe('CM-207');
    sim.startHack('QUERY');
    step(sim, 1.2);

    expect(sim.discoveredNodes.has('CM-207')).toBe(true);
    for (const edge of node.edges) expect(sim.discoveredNodes.has(edge)).toBe(true);
    expect(node.edges).toContain('SVC-VISION');
  });

  it('LOOP blinds a camera now and betrays you later', () => {
    const sim = makeUnlockedSim();
    const node = sim.network.get('CM-207')!;
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 });
    step(sim, 0.1);
    interact(sim);

    sim.startHack('LOOP');
    step(sim, 3);
    expect(cam.state).toBe('LOOPED');
    expect(node.checkTick).toBeGreaterThan(sim.tick);

    // The integrity check is real: it fires, and it writes evidence.
    const before = sim.evidence.size;
    while (sim.tick < node.checkTick + 2) step(sim, 1);
    expect(sim.evidence.size).toBeGreaterThan(before);
  });

  it('cancels an interference the moment the player moves off', () => {
    const sim = makeUnlockedSim();
    const node = sim.network.get('CM-207')!;
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 });
    step(sim, 0.1);
    interact(sim);
    sim.startHack('LOOP');
    step(sim, 0.5);
    expect(sim.hack).not.toBeNull();

    // The cost of interfering is time standing still.
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 }, { x: 6, y: 0 });
    sim.step(TICK_DT, emptyIntent(), null);
    expect(sim.hack).toBeNull();
  });

  it('REROUTE moves attention and leaves nothing behind', () => {
    const sim = makeUnlockedSim();
    const node = sim.network.get('CM-207')!;
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 });
    step(sim, 0.1);
    const evidenceBefore = sim.evidence.size;
    sim.applyHack('REROUTE', 'CM-207');
    expect(sim.dispatcher.activeAnomalies.length).toBeGreaterThan(0);
    expect(sim.evidence.size).toBe(evidenceBefore);
  });
});

describe('drones', () => {
  it('cannot see through overhead cover', () => {
    const sim = makeUnlockedSim();
    const drone = sim.drones[0];
    // Under the parking decks.
    const covered = { x: 500, y: 100 };
    drone.pos = { x: covered.x, y: covered.y };
    drone.z = 12;
    place(sim, covered);
    step(sim, 0.5);
    const seenBy = sim.sensorsSeeingPlayer().map((s) => s.data.id);
    expect(seenBy).not.toContain(drone.id);
    expect(sim.world.underCover(covered)).not.toBeNull();
  });

  it('is stopped by a rotor hit and releases its task', () => {
    const sim = makeUnlockedSim();
    const drone = sim.drones[0];
    // Park it overhead so the shot is a ballistics problem rather than a
    // moving-target problem, which is tested by playing, not by unit tests.
    drone.route = [{ x: 145, y: 50 }];
    drone.routeIndex = 0;
    drone.pos = { x: 145, y: 50 };
    drone.z = 11;
    place(sim, { x: 145, y: 62 });
    shoot(sim, () => drone.pos, () => drone.z);

    expect(drone.state).toBe('DESTABILISED');
    expect(drone.task).toBeNull();
    // A destabilised unit is a very loud data event.
    expect([...sim.evidence.values()].some((e) => e.kind === 'DRONE_INTERFERENCE')).toBe(true);
  });
});

describe('escape', () => {
  it('lets the score come down once the player is unobserved and behaving', () => {
    const sim = makeUnlockedSim();
    place(sim, { x: 145, y: 62 });
    sim.playerTrack.risk.total = 70;
    sim.playerTrack.linkedEvidence.length = 0;
    // Out of sight, in the Channel, moving normally.
    place(sim, { x: 300, y: 442 });
    step(sim, 20);
    expect(sim.playerTrack.risk.total).toBeLessThan(70);
  });
});

describe('tricks are the board, not the rider', () => {
  /*
   * A skateboard trick is the deck doing something under a pair of feet. The
   * shortcut — spinning the whole character — produces a 180, which is a
   * different trick and reads as one, so what the simulation carries is two
   * numbers about the deck: turns about its long axis, and turns about the
   * vertical. Every entry has to be a real trick with real numbers.
   */
  const press = (sim: Sim): void => {
    const it = emptyIntent();
    it.trickPressed = true;
    sim.step(TICK_DT, it, null);
  };

  it('names six tricks that exist, and describes each one correctly', () => {
    const by = new Map(TRICKS.map((t) => [t.name, t]));
    expect([...by.keys()].sort()).toEqual([
      '360 SHOVE-IT', 'FRONTSIDE SHOVE-IT', 'HEELFLIP', 'KICKFLIP',
      'POP SHOVE-IT', 'VARIAL FLIP',
    ]);
    // A kickflip and a heelflip are one flip, opposite ways, no shove.
    expect(by.get('KICKFLIP')!.flip).toBe(-by.get('HEELFLIP')!.flip);
    expect(Math.abs(by.get('KICKFLIP')!.flip)).toBe(1);
    expect(by.get('KICKFLIP')!.shove).toBe(0);
    // A shove-it is half a turn of the deck, flat, and frontside is the other
    // way round from a pop shove-it.
    expect(by.get('POP SHOVE-IT')!.shove).toBe(-0.5);
    expect(by.get('FRONTSIDE SHOVE-IT')!.shove).toBe(0.5);
    expect(by.get('POP SHOVE-IT')!.flip).toBe(0);
    // A varial flip is a kickflip and a pop shove-it at the same time.
    expect(by.get('VARIAL FLIP')!.flip).toBe(by.get('KICKFLIP')!.flip);
    expect(by.get('VARIAL FLIP')!.shove).toBe(by.get('POP SHOVE-IT')!.shove);
    // A 360 shove-it is a whole turn, still flat.
    expect(by.get('360 SHOVE-IT')!.shove).toBe(-1);
    expect(by.get('360 SHOVE-IT')!.flip).toBe(0);
  });

  it('pops on its own, so one press is one motion', () => {
    const sim = makeUnlockedSim();
    place(sim, { x: 145, y: 62 }, { x: 6, y: 0 });
    expect(sim.player.stance).toBe('ROLL');
    press(sim);
    expect(sim.player.stance).toBe('AIR');
    expect(sim.player.trick).not.toBeNull();
  });

  it('turns the board and hands it back, without turning the rider', () => {
    const sim = makeUnlockedSim();
    place(sim, { x: 145, y: 62 }, { x: 6, y: 0 });
    const heading = sim.player.heading;
    press(sim);
    const spec = sim.player.trick!.spec;
    let seen: string | null = null;
    sim.bus.on('player:trick', ({ name }) => { seen = name; });
    step(sim, spec.duration + 0.05);
    expect(seen).toBe(spec.name);
    // Caught in the air: the rotation is complete and the feet are back on it.
    // It stays on the state until the wheels touch, which the next test covers.
    expect(sim.player.trick!.landed).toBe(true);
    expect(sim.player.trick!.phase).toBe(1);
    // And the rider is pointed exactly where they were.
    expect(sim.player.heading).toBeCloseTo(heading, 6);
  });

  it('lands it: a pop buys more air than the longest trick needs', () => {
    const sim = makeUnlockedSim();
    place(sim, { x: 145, y: 62 }, { x: 6, y: 0 });
    press(sim);
    step(sim, 2.0);
    expect(sim.player.stance).toBe('ROLL');
    expect(sim.player.trick).toBeNull();
  });

  it('does not stack: one board, one trick at a time', () => {
    const sim = makeUnlockedSim();
    place(sim, { x: 145, y: 62 }, { x: 6, y: 0 });
    press(sim);
    const first = sim.player.trick!.spec.name;
    for (let i = 0; i < 6; i++) press(sim);
    expect(sim.player.trick!.spec.name).toBe(first);
  });

  it('takes a board to do: nothing happens while aiming', () => {
    const sim = makeUnlockedSim();
    place(sim, { x: 145, y: 62 }, { x: 6, y: 0 });
    sim.enterAimMode();
    press(sim);
    expect(sim.player.trick).toBeNull();
    expect(sim.player.stance).not.toBe('AIR');
  });

  it('is not the same trick every time, and is the same every replay', () => {
    const run = (): string[] => {
      const sim = makeUnlockedSim();
      place(sim, { x: 145, y: 62 }, { x: 6, y: 0 });
      const out: string[] = [];
      for (let i = 0; i < 14; i++) {
        press(sim);
        if (sim.player.trick) out.push(sim.player.trick.spec.name);
        step(sim, 2.0);
      }
      return out;
    };
    const a = run();
    expect(new Set(a).size).toBeGreaterThan(2);
    expect(run()).toEqual(a);
  });
});
