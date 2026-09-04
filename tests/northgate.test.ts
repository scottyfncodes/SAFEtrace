import { describe, expect, it } from 'vitest';
import { buildBellhaven } from '../src/content/bellhaven';
import { validateWorld, World } from '../src/sim/world';
import { makeSim, place, step } from './harness';
import { RECORD_CHAIN } from '../src/content/story';
import { SABLE_GAP_X, SABLE_LANE_Y } from '../src/content/northgate';
import { observe } from '../src/sim/surveillance/sensors';
import { Rng } from '../src/core/rng';
import { resolveRecords, type RecordContext } from '../src/sim/worldTypes';

const data = buildBellhaven();
const world = new World(data);
const staticCtx = (): RecordContext =>
  ({ tick: 0, evidence: [], network: data.network, playerIdentity: 'REYES, D.' });
const recordsOf = (id: string) =>
  resolveRecords(data.network.nodes.find((n) => n.id === id)!.records, staticCtx());

const northgate = {
  buildings: data.buildings.filter((b) => b.district === 'northgate'),
  sensors: data.sensors.filter((s) => s.district === 'northgate'),
};

describe('Northgate is a district, not a diorama', () => {
  it('holds the authored building count', () => {
    expect(northgate.buildings.length).toBeGreaterThanOrEqual(23);
    expect(northgate.buildings.length).toBeLessThanOrEqual(28);
  });

  it('holds the authored sensor count, and adds no new sensor type', () => {
    expect(northgate.sensors.length).toBe(20);
    const kinds = new Set(northgate.sensors.map((s) => s.kind));
    const known = new Set(['porch', 'street', 'plaza', 'school', 'reader', 'doorbell', 'facility']);
    for (const k of kinds) expect(known.has(k)).toBe(true);
  });

  it('passes the same structural validation as the rest of the town', () => {
    const errors = validateWorld(data).filter((i) => i.severity === 'error');
    expect(errors.map((e) => e.message)).toEqual([]);
  });

  it('mounts every Northgate camera on a facade', () => {
    const warnings = validateWorld(data)
      .filter((i) => i.severity === 'warning' && i.message.includes('inside building'));
    expect(warnings.map((w) => w.message)).toEqual([]);
  });

  it('gives every sensor a segment that reaches an uplink', () => {
    for (const s of northgate.sensors) {
      const node = data.network.nodes.find((n) => n.id === s.nodeId);
      expect(node, s.id).toBeDefined();
      const seg = data.network.segments.find((x) => x.id === node!.segmentId);
      expect(seg, `${s.id} segment ${node!.segmentId}`).toBeDefined();
      expect(data.network.nodes.some((n) => n.id === seg!.uplinkId)).toBe(true);
    }
  });

  it('splits the street and the rear service onto separate segments', () => {
    // The district's one topology lesson: they do not fail together.
    const seg = (id: string) => data.network.nodes.find((n) => n.id === id)!.segmentId;
    expect(seg('CM-207')).toBe('S-N2');
    const rear = data.sensors.filter((s) => s.label.startsWith('SABLE LANE'));
    expect(rear.length).toBe(2);
    for (const s of rear) expect(seg(s.nodeId)).toBe('S-N3');
    // Both still hang off the same uplink as the rest of the north side.
    for (const id of ['S-N2', 'S-N3']) {
      expect(data.network.segments.find((x) => x.id === id)!.uplinkId).toBe('TX-2');
    }
  });

  it('participates in the road graph like everywhere else', () => {
    const from = world.nearestRoadNode(data.spawns.player, 60)!;
    const to = world.nearestRoadNode({ x: 145, y: 60 }, 40);
    expect(to).not.toBeNull();
    expect(world.path(from.id, to!.id).length).toBeGreaterThan(0);
  });
});

describe('Sable Lane is the route the model cannot follow', () => {
  it('is paved end to end, so it is genuinely skateable', () => {
    for (let x = 34; x <= 220; x += 12) {
      const s = world.surfaceAt({ x, y: SABLE_LANE_Y });
      expect(['smoothConcrete', 'roughConcrete', 'asphalt'], `unpaved at x=${x}`).toContain(s);
    }
  });

  it('is off the road graph, so no forecast runs along it', () => {
    expect(world.distanceOffModel({ x: SABLE_GAP_X, y: SABLE_LANE_Y })).toBeGreaterThan(13);
  });

  it('breaks its garage row exactly once, and the break comes out behind CM-207', () => {
    const solidAt = (x: number) => world.buildingAt({ x, y: 106 }) !== null;
    expect(solidAt(SABLE_GAP_X)).toBe(false);
    // The gap leads north to within reach of the camera.
    expect(world.buildingAt({ x: SABLE_GAP_X, y: 100 })).toBeNull();
    const cm207 = data.sensors.find((s) => s.id === 'CM-207')!;
    const reach = Math.hypot(cm207.pos.x - SABLE_GAP_X, cm207.pos.y - 100);
    expect(reach).toBeLessThan(16);
  });

  it('leaves its middle uncovered while watching both ends', () => {
    const sim = makeSim();
    const seenAt = (x: number, y: number) => {
      const subject = { ...sim.playerSubject, pos: { x, y }, speed: 0 };
      return sim.sensors.filter((s) => {
        // Sweep to the angle most favourable to the camera before judging.
        for (let t = 0; t < 14; t += 0.25) {
          s.facing = s.data.facing + Math.sin((t / (s.data.sweepPeriod || 1) + s.data.sweepPhase) * Math.PI * 2) * s.data.sweep;
          if (observe(s, subject, sim.world, 1, { daylight: 1 }, new Rng(1))) return true;
        }
        return false;
      }).map((s) => s.data.label);
    };
    // Both entrances are watched by something.
    expect(seenAt(222, SABLE_LANE_Y).length).toBeGreaterThan(0);
    expect(seenAt(111, SABLE_LANE_Y).length).toBeGreaterThan(0);
    // The break in the garages is not.
    expect(seenAt(SABLE_GAP_X, SABLE_LANE_Y)).toEqual([]);
  });

  it('offers overhead cover, so a dispatched drone can lose you in it', () => {
    expect(world.underCover({ x: 84, y: 105 })).not.toBeNull();
    expect(world.underCover({ x: 176, y: 105 })).not.toBeNull();
    expect(world.underCover({ x: SABLE_GAP_X, y: SABLE_LANE_Y })).toBeNull();
  });

  it('costs something: taking it reads as an unusual route, as it should', () => {
    const sim = makeSim();
    place(sim, { x: SABLE_GAP_X, y: SABLE_LANE_Y });
    step(sim, 4);
    expect([...sim.playerTrack.flags]).toContain('UNUSUAL_ROUTE');
    // But it stays below the threshold that sends a unit after you.
    expect(sim.playerRisk).toBeLessThan(45);
  });

  it('is not the only way in: the street still works, and is watched', () => {
    const sim = makeSim();
    place(sim, { x: 145, y: 60 });
    step(sim, 3);
    const watchers = sim.sensorsSeeingPlayer().map((s) => s.data.id);
    expect(watchers.length).toBeGreaterThan(0);
    expect(watchers).toContain('CM-207');
  });
});

describe('the record that teaches what a segment is', () => {
  it('states a node count that is actually true', () => {
    const seg = data.network.segments.find((s) => s.id === 'S-N2')!;
    expect(recordsOf('JX-207')[0]).toBe(
      `SEGMENT S-N2 — ${seg.nodeIds.length} NODES, ALL CARRIED BY THIS RELAY`);
  });

  it('is derived, so growing the district cannot make it a lie', () => {
    // The failure this replaces: the line said 14 while the segment held 18,
    // because Northgate grew after the record was written.
    const grown = JSON.parse(JSON.stringify({ network: data.network })) as { network: typeof data.network };
    grown.network.segments.find((s) => s.id === 'S-N2')!.nodeIds.push('CM-FAKE');
    const line = resolveRecords(
      data.network.nodes.find((n) => n.id === 'JX-207')!.records,
      { tick: 0, evidence: [], network: grown.network, playerIdentity: '' },
    )[0];
    expect(line).toContain(`${grown.network.segments.find((s) => s.id === 'S-N2')!.nodeIds.length} NODES`);
  });

  it('names no junction the player has not found yet', () => {
    const text = recordsOf('JX-207').join(' ');
    expect(text).not.toMatch(/JX-R12|JX-N3|JX-CH/);
    expect(text).not.toMatch(/ATTACK|DESTROY|TARGET/);
  });
});

describe('the six-record chain', () => {
  it('is six distinct records, each saying something the last did not', () => {
    expect(RECORD_CHAIN.length).toBe(6);
    const texts = RECORD_CHAIN.map((id) => recordsOf(id).join(' | '));
    expect(new Set(texts).size).toBe(6);
    for (const t of texts) expect(t.length).toBeGreaterThan(30);
  });

  it('forms a causal chain: the camera worked, and the harm happened anyway', () => {
    const rec = (id: string) => recordsOf(id).join(' | ');
    expect(rec('CM-207')).toMatch(/NO FAULT/);
    expect(rec('JX-207')).toMatch(/NO RETRANSMISSION|NO LOSS/);
    expect(rec('SVC-VISION')).toMatch(/ENROLLED MINORS/);
    expect(rec('SVC-VISION')).toMatch(/REVIEW 11-04/);
    expect(rec('SVC-REVIEW')).toMatch(/PARENTS/);
    expect(rec('SVC-REVIEW')).toMatch(/WITHIN TOLERANCE/);
    expect(rec('SVC-PREDICT')).toMatch(/41 PRIOR VISITS/);
    expect(rec('SVC-RECORD')).toMatch(/RECORD IMMUTABLE/);
  });

  it('is walkable: every record is reachable by following edges from CM-207', () => {
    const sim = makeSim();
    const node = sim.network.get('CM-207')!;
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 });
    step(sim, 0.1);

    const reached = new Set<string>(['CM-207']);
    const frontier = ['CM-207'];
    let guard = 0;
    while (frontier.length && guard++ < 40) {
      const id = frontier.pop()!;
      sim.applyHack('TRACE', id);
      for (const e of sim.network.get(id)!.edges) {
        if (!reached.has(e)) { reached.add(e); frontier.push(e); }
      }
    }
    for (const id of RECORD_CHAIN) expect(reached.has(id), `unreachable: ${id}`).toBe(true);
  });

  it('counts a record as read only once the player has actually held it', () => {
    const sim = makeSim();
    const node = sim.network.get('CM-207')!;
    place(sim, { x: node.pos.x + 4, y: node.pos.y + 4 });
    step(sim, 0.2);

    sim.applyHack('TRACE', 'CM-207');
    // An edge naming a record is not the same as reading it.
    expect(sim.discoveredNodes.has('SVC-VISION')).toBe(true);
    expect(sim.readNodes.has('SVC-VISION')).toBe(false);

    sim.selectNode('SVC-VISION');
    step(sim, 0.1);
    expect(sim.readNodes.has('SVC-VISION')).toBe(true);
  });

  it('can be read all the way through, from the alley, without new mechanics', () => {
    const sim = makeSim();
    // Arrive behind the camera, the way the district is built to be played.
    place(sim, { x: SABLE_GAP_X, y: 100 });
    step(sim, 0.2);
    expect(sim.network.nearest(sim.player.pos, 16)?.id).toBe('CM-207');

    sim.selectNode('CM-207');
    for (const verb of ['QUERY', 'TRACE'] as const) { sim.applyHack(verb, 'CM-207'); step(sim, 0.1); }

    // JX-207 is a box on a pole. Two of the six records are places, not menus,
    // so the investigation has a leg you have to actually skate.
    const jx = sim.network.get('JX-207')!;
    expect(sim.readNodes.has('JX-207')).toBe(false);
    place(sim, { x: jx.pos.x + 5, y: jx.pos.y + 5 });
    step(sim, 0.2);
    sim.selectNode('JX-207');
    sim.applyHack('QUERY', 'JX-207');
    step(sim, 0.1);

    for (const id of ['SVC-VISION', 'SVC-REVIEW', 'SVC-PREDICT', 'SVC-RECORD']) {
      sim.selectNode(id);
      step(sim, 0.1);
      sim.applyHack('TRACE', id);
    }
    for (const id of RECORD_CHAIN) expect(sim.readNodes.has(id), `never read: ${id}`).toBe(true);
  });
});
