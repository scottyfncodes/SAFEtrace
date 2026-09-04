import { describe, expect, it } from 'vitest';
import { makeSim, place, step } from './harness';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import type { Vec2 } from '../src/core/math';
import type { Sim } from '../src/sim/sim';

/** Aim at a point and release a fully drawn shot. */
function shoot(sim: Sim, at: Vec2): void {
  // Hold aim long enough to reach full draw.
  for (let i = 0; i < 40; i++) {
    const it = emptyIntent();
    it.aim = true;
    sim.step(TICK_DT, it, at);
  }
  const fireIntent = emptyIntent();
  fireIntent.aim = true;
  fireIntent.fire = true;
  fireIntent.firePressed = true;
  sim.step(TICK_DT, fireIntent, at);
  // Let the projectile fly.
  for (let i = 0; i < 200 && sim.projectiles.length > 0; i++) {
    sim.step(TICK_DT, emptyIntent(), null);
  }
}

describe('the slingshot loop', () => {
  it('takes a camera out of service and spends a bearing doing it', () => {
    const sim = makeSim();
    const cam = sim.sensorById.get('CM-207')!;
    // Stand in the street in front of the camera, at a workable range.
    place(sim, { x: 145, y: 62 });
    const before = sim.player.bearings;

    shoot(sim, cam.data.pos);

    expect(sim.player.bearings).toBe(before - 1);
    expect(['OFFLINE', 'MISALIGNED', 'FROZEN']).toContain(cam.state);
  });

  it('creates evidence, analyses it, and reaches a verdict', () => {
    const sim = makeSim();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: 145, y: 62 });
    shoot(sim, cam.data.pos);

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
      const sim = makeSim();
      const cam = sim.sensorById.get('CM-207')!;
      place(sim, { x: 145, y: 62 });
      // Let the system acquire the player first when we want a link.
      if (stay) step(sim, 3);
      shoot(sim, cam.data.pos);
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
    const sim = makeSim();
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

  it('declines to shoot a person', () => {
    const sim = makeSim();
    const targets = sim.ballisticTargets();
    // No subject of any kind is ever a ballistic target.
    const people = new Set([
      sim.playerSubject.id, sim.devon.id, ...sim.npcs.map((n) => n.id), ...sim.patrols.map((p) => p.id),
    ]);
    expect(targets.filter((t) => people.has(t.id))).toEqual([]);
  });
});

describe('the hacking loop', () => {
  it('QUERY reveals a node’s edges, which is how the network becomes a place', () => {
    const sim = makeSim();
    const node = sim.network.get('CM-207')!;
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 });
    step(sim, 0.1);

    expect(sim.focusNode?.id).toBe('CM-207');
    sim.startHack('QUERY');
    step(sim, 1.2);

    expect(sim.discoveredNodes.has('CM-207')).toBe(true);
    for (const edge of node.edges) expect(sim.discoveredNodes.has(edge)).toBe(true);
    expect(node.edges).toContain('SVC-VISION');
  });

  it('LOOP blinds a camera now and betrays you later', () => {
    const sim = makeSim();
    const node = sim.network.get('CM-207')!;
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 });
    step(sim, 0.1);

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
    const sim = makeSim();
    const node = sim.network.get('CM-207')!;
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 });
    step(sim, 0.1);
    sim.startHack('LOOP');
    step(sim, 0.5);
    expect(sim.hack).not.toBeNull();

    // The cost of interfering is time standing still.
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 }, { x: 6, y: 0 });
    sim.step(TICK_DT, emptyIntent(), null);
    expect(sim.hack).toBeNull();
  });

  it('REROUTE moves attention and leaves nothing behind', () => {
    const sim = makeSim();
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
    const sim = makeSim();
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
    const sim = makeSim();
    const drone = sim.drones[0];
    // Park it overhead so the shot is a ballistics problem rather than a
    // moving-target problem, which is tested by playing, not by unit tests.
    drone.route = [{ x: 145, y: 50 }];
    drone.routeIndex = 0;
    drone.pos = { x: 145, y: 50 };
    drone.z = 11;
    place(sim, { x: 145, y: 62 });
    shoot(sim, drone.pos);

    expect(drone.state).toBe('DESTABILISED');
    expect(drone.task).toBeNull();
    // A destabilised unit is a very loud data event.
    expect([...sim.evidence.values()].some((e) => e.kind === 'DRONE_INTERFERENCE')).toBe(true);
  });
});

describe('escape', () => {
  it('lets the score come down once the player is unobserved and behaving', () => {
    const sim = makeSim();
    place(sim, { x: 145, y: 62 });
    sim.playerTrack.risk.total = 70;
    sim.playerTrack.linkedEvidence.length = 0;
    // Out of sight, in the Channel, moving normally.
    place(sim, { x: 300, y: 442 });
    step(sim, 20);
    expect(sim.playerTrack.risk.total).toBeLessThan(70);
  });
});
