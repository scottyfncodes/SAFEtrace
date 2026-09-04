import { describe, expect, it } from 'vitest';
import { buildBellhaven } from '../src/content/bellhaven';
import { validateWorld, World } from '../src/sim/world';
import { makeSim, place, shootAt, step } from './harness';
import { Rng } from '../src/core/rng';
import { resolveRecords, type RecordContext } from '../src/sim/worldTypes';
import { makeSensor, observe } from '../src/sim/surveillance/sensors';
import type { Subject } from '../src/sim/surveillance/types';
import { OUTFALL_GAP, RELAY_CHAIN, YARD } from '../src/content/relay12';
import { verbsFor } from '../src/sim/surveillance/network';
import { Dispatcher, type Asset } from '../src/sim/surveillance/dispatch';
import type { Vec2 } from '../src/core/math';
import type { Sim } from '../src/sim/sim';

const data = buildBellhaven();
const world = new World(data);
const relay = {
  buildings: data.buildings.filter((b) => b.district === 'relay'),
  sensors: data.sensors.filter((s) => s.district === 'relay'),
};
const node = (id: string) => data.network.nodes.find((n) => n.id === id)!;
const segmentOf = (id: string) => data.network.segments.find((s) => s.nodeIds.includes(id))!;
const uplinkOf = (id: string) => segmentOf(id).uplinkId;

const probeSensors = data.sensors.map(makeSensor);

const staticCtx = (): RecordContext =>
  ({ tick: 0, evidence: [], network: data.network, playerIdentity: 'REYES, D.' });
const recordsOf = (id: string) => resolveRecords(node(id).records, staticCtx());

/** Can any sensor in Bellhaven see this spot at any point in its sweep? */
function watchers(p: Vec2): string[] {
  const rng = new Rng(7);
  const subject = {
    id: 'S-PROBE', kind: 'player', identity: 'X', displayName: 'X',
    pos: p, vel: { x: 0, y: 0 }, speed: 0,
    districtPriors: {}, priorContacts: 0, familiarity: 0,
  } as unknown as Subject;
  const out = new Set<string>();
  for (let t = 0; t < 60 * 12; t += 15) {
    for (const s of probeSensors) {
      s.state = 'ONLINE';
      s.stateUntil = 0;
      if (observe(s, subject, world, t, { daylight: 1 }, rng)) out.add(s.data.id);
    }
  }
  return [...out];
}

/** The height a junction box sits at on its post. */
const JUNCTION_Z = 1.6;

/** Aim at a point at a given height and release a fully drawn shot. */
function shoot(sim: Sim, at: Vec2, z = 0): void {
  shootAt(sim, at, z);
}

describe('Relay 12 is a working yard, not a set', () => {
  it('holds the authored building count', () => {
    expect(relay.buildings.length).toBeGreaterThanOrEqual(22);
    expect(relay.buildings.length).toBeLessThanOrEqual(26);
  });

  it('holds the authored sensor count, and adds no new sensor kind', () => {
    expect(relay.sensors.length).toBe(8);
    const known = new Set(['porch', 'street', 'plaza', 'school', 'reader', 'doorbell', 'facility']);
    for (const s of relay.sensors) expect(known.has(s.kind)).toBe(true);
  });

  it('is the yard the brief asked for, by name', () => {
    const labels = relay.buildings.map((b) => b.label ?? '');
    const has = (re: RegExp) => labels.some((l) => re.test(l));
    expect(labels.filter((l) => /^PORTACABIN/.test(l)).length).toBeGreaterThanOrEqual(6);
    expect(labels.filter((l) => /^LOCK-UP/.test(l)).length).toBe(4);
    expect(labels.filter((l) => /^CONTAINER/.test(l)).length).toBe(2);
    expect(has(/DEPOT/)).toBe(true);
    expect(has(/PUMP HOUSE/)).toBe(true);
    expect(has(/WEIGHBRIDGE HUT/)).toBe(true);
    expect(has(/CANTEEN/)).toBe(true);
    expect(has(/COMPOUND OFFICE/)).toBe(true);
  });

  it('ships without a validation error', () => {
    expect(validateWorld(data).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('every camera watches the thing it is named after', () => {
  const cases: Array<[string, Vec2]> = [
    ['CM-R01', { x: 478, y: 198 }],   // the west gate itself
    ['CM-R01', { x: 462, y: 215 }],   // and the East Avenue South approach to it
    ['CM-R02', { x: 512, y: 166 }],   // the north gate
    ['CM-R03', { x: 493, y: 216 }],   // the hall door, and the cabinet beside it
    ['CM-R04', { x: 516, y: 240 }],   // the loading apron
    ['CM-R05', { x: 512, y: 289 }],   // the weighbridge deck
    ['CM-R06', { x: 495, y: 262 }],   // the lock-up lane
    ['CM-R07', { x: 496, y: 200 }],   // the office yard
    ['CM-R08', { x: 534, y: 244 }],   // the container stack
  ];
  for (const [id, p] of cases) {
    it(`${id} covers (${p.x}, ${p.y})`, () => {
      expect(watchers(p)).toContain(id);
    });
  }
});

describe('TX-2 is the shared file, and the office camera is the control case', () => {
  it('carries every Relay 12 camera except the compound office', () => {
    for (const s of relay.sensors) {
      if (s.id === 'CM-R07') continue;
      expect(uplinkOf(s.id)).toBe('TX-2');
    }
    expect(uplinkOf('CM-R07')).toBe('TX-1');
  });

  it('carries Northgate too: the cameras the player has been hiding from all morning', () => {
    expect(uplinkOf('CM-207')).toBe('TX-2');
    const northgate = data.sensors.filter((s) => s.district === 'northgate');
    expect(northgate.length).toBeGreaterThan(0);
    for (const s of northgate) expect(uplinkOf(s.id)).toBe('TX-2');
  });

  it('never says so in words: the membership is topology, not prose', () => {
    const prose = recordsOf('TX-2').join(' ') + recordsOf('MT-R12').join(' ');
    expect(prose).not.toMatch(/CONNECTED TO/);
    expect(prose).not.toMatch(/FOLLOW/);
    expect(prose).not.toMatch(/CM-R0[1-8]/);
  });

  it('gives the office camera the protections the street never got', () => {
    const office = recordsOf('CM-R07').join(' | ');
    expect(office).toMatch(/TX-1/);
    expect(office).toMatch(/NOTIFIED/);
    expect(office).toMatch(/30 DAYS/);
    const street = recordsOf('CM-R04').join(' | ');
    expect(street).toMatch(/90 DAYS/);
    expect(street).not.toMatch(/NOTIFIED/);
  });
});

describe('TX-2 reports what it actually carried', () => {
  it('lists a Northgate camera the player themselves set off', () => {
    const sim = makeSim();
    const cam = sim.sensorById.get('CM-207')!;
    // A real action in Northgate: take out the camera that produced the match.
    place(sim, { x: cam.data.pos.x - 10, y: cam.data.pos.y + 8 });
    step(sim, 0.2);
    shoot(sim, cam.data.pos, cam.data.height);
    expect(cam.state).not.toBe('ONLINE');

    const observed = [...sim.evidence.values()].flatMap((e) => e.observedBy);
    expect(observed).toContain('CM-207');

    const log = resolveRecords(sim.network.get('TX-2')!.records, sim.recordContext());
    expect(log.join('\n')).toMatch(/CM-207 {2}DELIVERED/);
  });

  it('leaves the office camera out of the log even when it is the only witness', () => {
    const sim = makeSim();
    const ctx = () => sim.recordContext();
    // A car in the office yard, in CM-R07's view and nobody else's.
    const car = sim.world.data.props.find((p) => p.kind === 'car' && p.district === 'relay')!;
    expect(watchers(car.pos)).toEqual(['CM-R07']);

    place(sim, { x: car.pos.x + 6, y: car.pos.y + 10 });
    step(sim, 0.2);
    shoot(sim, car.pos);

    const observed = [...sim.evidence.values()].flatMap((e) => e.observedBy);
    expect(observed).toContain('CM-R07');
    expect(resolveRecords(sim.network.get('TX-2')!.records, ctx()).join('\n')).not.toMatch(/CM-R07/);
  });

  it('files the player’s own frames in the same list as the one that stopped Devon', () => {
    const sim = makeSim();
    const cam = sim.sensorById.get('CM-207')!;
    place(sim, { x: cam.data.pos.x - 10, y: cam.data.pos.y + 8 });
    step(sim, 0.2);
    shoot(sim, cam.data.pos, cam.data.height);

    const log = resolveRecords(sim.network.get('TX-2')!.records, sim.recordContext());
    const delivered = log.filter((l) => l.includes('DELIVERED'));
    expect(delivered.length).toBeGreaterThan(1);
    // One chronology, and the morning's match is in it under the same heading
    // and in the same shape as everything the player has just done.
    expect([...delivered].sort()).toEqual(delivered);
    expect(delivered.some((l) => l.includes('0441-07'))).toBe(true);
    const shape = /^\d\d:\d\d:\d\d {2}[A-Z0-9-]+ {2}DELIVERED {2}.+$/;
    for (const l of delivered) expect({ l, ok: shape.test(l) }).toEqual({ l, ok: true });
  });

  it('counts the segments hanging off it rather than quoting a number', () => {
    const provisioned = data.network.segments.filter((s) => s.uplinkId === 'TX-2').length;
    expect(recordsOf('MT-R12')).toContain(`SEGMENTS PROVISIONED TODAY: ${provisioned}`);
    expect(provisioned).toBeGreaterThan(1);
  });
});

describe('TX-2 is infrastructure, and stays infrastructure', () => {
  it('offers nothing but reading, at the rule level rather than in the interface', () => {
    expect(verbsFor('UPLINK')).toEqual(['QUERY', 'TRACE']);
    for (const v of ['LOOP', 'SUPPRESS', 'REROUTE', 'MASK'] as const) {
      expect(verbsFor('UPLINK')).not.toContain(v);
    }
  });

  it('refuses an interference verb aimed at it directly', () => {
    const sim = makeSim();
    place(sim, { x: 493, y: 216 });
    step(sim, 0.2);
    sim.selectNode('TX-2');
    expect(sim.focusNode?.id).toBe('TX-2');
    for (const v of ['LOOP', 'SUPPRESS', 'REROUTE', 'MASK'] as const) {
      expect(sim.canHack(v)).toBe(false);
      expect(sim.startHack(v, 'TX-2')).toBe(false);
      // And the back door: applying it outright changes nothing.
      const before = sim.network.get('TX-2')!.state;
      sim.applyHack(v, 'TX-2');
      expect(sim.network.get('TX-2')!.state).toBe(before);
    }
    expect(sim.network.get('TX-2')!.state).toBe('NOMINAL');
  });

  it('keeps carrying Northgate when its own site segment is degraded', () => {
    const sim = makeSim();
    // MT-R12 is a junction, and junctions do degrade. The uplink does not.
    sim.applyHack('SUPPRESS', 'MT-R12');
    const perimeter = sim.network.segmentNodes('S-X1').map((n) => n.id);
    expect(perimeter).toContain('MT-R12');
    expect(sim.network.get('TX-2')!.state).toBe('NOMINAL');
    expect(sim.sensorById.get('CM-207')!.state).toBe('ONLINE');
  });
});

describe('a segment is the blast radius, and the player can aim at it', () => {
  it('is legible before the shot: the yard advertises which cameras share a relay', () => {
    // Both the VISION world-label and the inspect panel read node.segmentId, and
    // the panel shows it with no hack at all. Segment topology is free.
    for (const s of relay.sensors) expect(node(s.id).segmentId).toBeTruthy();
    const onX3 = relay.sensors.filter((s) => node(s.id).segmentId === 'S-X3').map((s) => s.id);
    expect(onX3.sort()).toEqual(['CM-R03', 'CM-R04', 'CM-R05', 'CM-R06']);
    expect(node('JX-R12').segmentId).toBe('S-X3');
  });

  it('takes down exactly that segment when a bearing lands on JX-R12, and nothing else', () => {
    const sim = makeSim();
    const jx = sim.network.get('JX-R12')!;
    // Standing in the lock-up lane, which is where a player reading segments ends up.
    place(sim, { x: 495, y: 266 });
    step(sim, 0.3);
    let shots = 0;
    while (sim.network.get('JX-R12')!.state === 'NOMINAL' && shots < 8) { shoot(sim, jx.pos, JUNCTION_Z); shots++; }
    expect(sim.network.get('JX-R12')!.state).toBe('DEGRADED');

    const st = (id: string) => sim.sensorById.get(id)!.state;
    for (const id of ['CM-R03', 'CM-R04', 'CM-R05', 'CM-R06']) expect({ id, st: st(id) }).toEqual({ id, st: 'DEGRADED' });
    for (const id of ['CM-R01', 'CM-R02', 'CM-R07', 'CM-R08']) expect({ id, st: st(id) }).toEqual({ id, st: 'ONLINE' });

    // Town-wide: no camera off S-X3 is touched.
    const onX3 = new Set(['CM-R03', 'CM-R04', 'CM-R05', 'CM-R06']);
    for (const s of data.sensors) {
      if (onX3.has(s.id)) continue;
      expect({ id: s.id, degraded: st(s.id) === 'DEGRADED' }).toEqual({ id: s.id, degraded: false });
    }

    // Ninety seconds, exactly as JX-207's record said back in Northgate.
    expect((sim.sensorById.get('CM-R03')!.stateUntil - sim.tick) / 60).toBeCloseTo(90, 0);
    step(sim, 95);
    for (const id of onX3) expect({ id, st: st(id) }).toEqual({ id, st: 'ONLINE' });
  });

  it('costs something: the cameras it blinds see it happen first', () => {
    const sim = makeSim();
    const jx = sim.network.get('JX-R12')!;
    place(sim, { x: 495, y: 266 });
    step(sim, 0.3);
    let shots = 0;
    while (sim.network.get('JX-R12')!.state === 'NOMINAL' && shots < 8) { shoot(sim, jx.pos, JUNCTION_Z); shots++; }
    const ev = [...sim.evidence.values()];
    expect(ev.some((e) => e.label.includes('JX-R12'))).toBe(true);
    expect(ev.flatMap((e) => e.observedBy).length).toBeGreaterThan(0);
  });
});

describe('the Relay 12 chain is walkable from where the player stands', () => {
  it('is six records, each saying something the last did not', () => {
    expect(RELAY_CHAIN.length).toBe(6);
    const texts = RELAY_CHAIN.map((id) => recordsOf(id).join(' | '));
    expect(new Set(texts).size).toBe(6);
    for (const t of texts) expect(t.length).toBeGreaterThan(40);
  });

  it('links each step to the next, so TRACE can follow it', () => {
    for (let i = 1; i < RELAY_CHAIN.length; i++) {
      const a = node(RELAY_CHAIN[i - 1]);
      expect(a.edges).toContain(RELAY_CHAIN[i]);
    }
  });

  it('walks end to end through the player’s actual interaction path', () => {
    const sim = makeSim();
    const stands: Record<string, Vec2> = {
      'JX-CH': { x: 330, y: 434 },
      'TX-2': { x: 493, y: 216 },
      'MT-R12': { x: 534, y: 224 },
      'JX-R12': { x: 495, y: 258 },
      'CM-R07': { x: 496, y: 200 },
    };
    for (const id of RELAY_CHAIN) {
      const n = sim.network.get(id)!;
      if (n.kind === 'SERVICE') {
        // A service has no location: it must already have been traced to.
        expect(sim.reachableServices().map((s) => s.id)).toContain(id);
        sim.selectNode(id);
      } else {
        place(sim, stands[id]);
        step(sim, 0.2);
        sim.selectNode(id);
      }
      expect(sim.focusNode?.id).toBe(id);
      expect(resolveRecords(sim.focusNode!.records, sim.recordContext()).length).toBeGreaterThan(3);
      sim.applyHack('TRACE', id);
      sim.selectNode(null);
    }
  });

  it('reaches the morning’s own record from the far end of the chain', () => {
    const sim = makeSim();
    for (const id of RELAY_CHAIN) sim.applyHack('TRACE', id);
    for (const id of ['SVC-REVIEW', 'SVC-PREDICT', 'SVC-RECORD']) sim.applyHack('TRACE', id);
    expect(sim.reachableServices().map((s) => s.id)).toContain('SVC-RECORD');
  });
});

describe('there are two ways in, and only one of them is watched', () => {
  it('watches East Avenue South and the gate it leads to', () => {
    expect(watchers({ x: 462, y: 215 }).length).toBeGreaterThan(0);
    expect(watchers({ x: 478, y: 198 }).length).toBeGreaterThan(0);
  });

  it('leaves the outfall and the east lane behind it dark', () => {
    const route: Vec2[] = [
      { x: 470, y: 452 },   // the Channel's east apron
      { x: 490, y: 372 },   // the maintenance track north
      { x: 494, y: 332 },
      { x: 524, y: 306 },
      { x: 541, y: 301 },   // through the outfall gap
      { x: 549, y: 276 },   // the slot between the pump house and the fence
      { x: 549, y: 258 },
      { x: 549, y: 244 },   // directly beneath a camera that is facing the other way
      { x: 549, y: 226 },
      { x: 543, y: 221 },   // out at the maintenance terminal
    ];
    for (const p of route) expect({ p, seen: watchers(p) }).toEqual({ p, seen: [] });
  });

  it('paves the alternative without putting it on the road graph', () => {
    // Every step of the route stands on authored surface...
    const route: Vec2[] = [
      { x: 472, y: 446 }, { x: 486, y: 400 }, { x: 492, y: 350 },
      { x: 500, y: 313 }, { x: 530, y: 305 },
    ];
    for (const p of route) {
      expect({ p, surface: world.surfaceAt(p) }).not.toEqual({ p, surface: 'grass' });
    }
    // ...and none of it is anywhere near a road node, so PREDICT cannot run it.
    for (const p of route) {
      const nearest = Math.min(...data.roadNodes.map((n) => Math.hypot(n.pos.x - p.x, n.pos.y - p.y)));
      expect({ p, nearest: nearest > 20 }).toEqual({ p, nearest: true });
    }
  });

  it('puts nothing inside the compound on the road graph', () => {
    for (const n of data.roadNodes) {
      const inside = n.pos.x > YARD.x0 && n.pos.x < YARD.x1 && n.pos.y > YARD.y0 && n.pos.y < YARD.y1;
      expect({ id: n.id, inside }).toEqual({ id: n.id, inside: false });
    }
  });

  it('leaves the outfall gap open in the fence it is a gap in', () => {
    const gapMid = { x: (OUTFALL_GAP.x0 + OUTFALL_GAP.x1) / 2, y: OUTFALL_GAP.y };
    // A 2 m step across the fence line, at head height for a person on a board.
    expect(world.blocked({ x: gapMid.x, y: gapMid.y + 4 }, { x: gapMid.x, y: gapMid.y - 4 }, 1.6)).toBe(false);
    // The same step through the fence itself is not open.
    expect(world.blocked({ x: 500, y: OUTFALL_GAP.y + 4 }, { x: 500, y: OUTFALL_GAP.y - 4 }, 1.6)).toBe(true);
  });
});

describe('attention is finite, and the Channel is how you spend it', () => {
  it('commits the eastern drone, so the Relay 12 approach waits for a farther one', () => {
    // The real asset pool: Bellhaven's three drone pads.
    const pads = data.spawns.dronePads;
    const makeAssets = (): Asset[] => pads.map((p, i) => ({
      id: `DR-${i}`, kind: 'drone' as const, pos: { ...p }, available: true, task: null,
    }));
    const approach = { x: 500, y: 310 };

    const quiet = new Dispatcher();
    const a1 = makeAssets();
    quiet.update(0, [], a1, () => 0);
    quiet.flagAnomaly(approach, 60, 'APPROACH', 60 * 12);
    quiet.update(60, [], a1, () => 0);
    const respondedQuiet = a1.find((a) => a.task?.reason === 'APPROACH')!;

    const noisy = new Dispatcher();
    const a2 = makeAssets();
    // A bin goes over in the Channel first.
    noisy.flagAnomaly({ x: 400, y: 450 }, 0, 'CHANNEL', 60 * 20);
    noisy.update(0, [], a2, () => 0);
    noisy.flagAnomaly(approach, 60, 'APPROACH', 60 * 12);
    noisy.update(60, [], a2, () => 0);
    const respondedNoisy = a2.find((a) => a.task?.reason === 'APPROACH')!;

    // Same nearest drone in both cases — unless the Channel already took it.
    expect(respondedNoisy.id).not.toBe(respondedQuiet.id);
    const d = (a: Asset) => Math.hypot(a.pos.x - approach.x, a.pos.y - approach.y);
    expect(d(respondedNoisy)).toBeGreaterThan(d(respondedQuiet));
  });

  it('flies the eastern corridor at all, so there is something to buy away', () => {
    const east = data.droneRoutes.find((r) => r.some((p) => p.x > 470 && p.y > 240 && p.y < 340));
    expect(east).toBeDefined();
    // It links the Channel to the Relay 12 approach rather than orbiting one of them.
    expect(east!.some((p) => p.y > 360)).toBe(true);
    expect(east!.some((p) => p.y < 280 && p.x > 460)).toBe(true);
  });
});
