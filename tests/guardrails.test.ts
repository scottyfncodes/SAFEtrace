import { describe, expect, it } from 'vitest';
import { buildBellhaven } from '../src/content/bellhaven';
import { STABLE_IDS, validateWorld } from '../src/sim/world';
import type { WorldData } from '../src/sim/worldTypes';

/**
 * A guardrail that only ever passes proves nothing. Each of these breaks the
 * shipped town in the exact way a hand-authoring mistake breaks it, and asserts
 * the validator notices.
 *
 * Every failure mode below is real: each shipped at least once while a district
 * was being authored by hand, and each was caught by eye rather than by tooling.
 *
 * The clone below goes through JSON, so a node whose records are computed at
 * read time loses them. That is fine and deliberate: the validator checks
 * structure, and structure is exactly what survives the round trip.
 */
const clone = (): WorldData => JSON.parse(JSON.stringify(buildBellhaven())) as WorldData;
const errorsOf = (d: WorldData) => validateWorld(d).filter((i) => i.severity === 'error').map((i) => i.message);

describe('authoring guardrails fail on bad content', () => {
  it('the shipped town is clean, so every failure below is the injected one', () => {
    expect(errorsOf(clone())).toEqual([]);
  });

  it('catches a camera boxed in by the structure it is mounted behind', () => {
    const d = clone();
    // Drop a shed directly in front of the alley camera, the way a bus shelter
    // once sat in front of its own camera.
    const cam = d.sensors.find((s) => s.label === 'SABLE LANE — MID')!;
    d.buildings.push({
      id: 'TEST-BOX', kind: 'shed', height: 4, wall: '#fff', roof: '#fff',
      district: 'northgate', nodeIds: [],
      poly: [
        { x: cam.pos.x - 8, y: cam.pos.y - 9 }, { x: cam.pos.x + 8, y: cam.pos.y - 9 },
        { x: cam.pos.x + 8, y: cam.pos.y - 1 }, { x: cam.pos.x - 8, y: cam.pos.y - 1 },
      ],
    });
    expect(errorsOf(d).some((m) => m.includes('can see no open ground'))).toBe(true);
  });

  it('catches a node authored inside the building it is meant to hang on', () => {
    const d = clone();
    // TX-2 shipped in the middle of the relay hut: it drew, it validated, and
    // it was selectable from one point on the hut's boundary. Put it back.
    const hall = d.buildings.find((b) => b.label === 'RELAY 12')!;
    const c = hall.poly.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
    d.network.nodes.find((n) => n.id === 'TX-2')!.pos = c;
    expect(errorsOf(d).some((m) => m.includes('TX-2') && m.includes('unreachable'))).toBe(true);
  });

  it('does not mistake a junction on a wall for one buried in it', () => {
    // MT-R12 hangs on the hall's east face. That is a mount, not a mistake.
    expect(errorsOf(clone()).some((m) => m.includes('unreachable'))).toBe(false);
  });

  it('catches a district authored twice', () => {
    const d = clone();
    // Exactly the duplicated terrace row, reproduced.
    const terraces = d.buildings.filter((b) => (b.label ?? '').startsWith('TERRACE'));
    expect(terraces.length).toBeGreaterThan(0);
    for (const t of terraces) d.buildings.push({ ...t, id: `${t.id}-dup` });
    expect(errorsOf(d).some((m) => m.includes('occupy the same ground'))).toBe(true);
  });

  it('does not demand a road in districts that are off the graph on purpose', () => {
    // The Channel has no roads, and that is the design rather than a mistake.
    // A per-district reachability rule would only encode an exception, so the
    // validator checks global graph connectivity instead.
    const d = buildBellhaven();
    const channelBuildings = d.buildings.filter((b) => b.district === 'channel');
    expect(channelBuildings.length).toBeGreaterThan(10);
    expect(d.roadNodes.some((n) => n.district === 'channel')).toBe(false);
    expect(errorsOf(d)).toEqual([]);
  });

  it('catches a story-critical identifier going missing when content is reordered', () => {
    const d = clone();
    const cm = d.sensors.find((s) => s.id === 'CM-207')!;
    cm.id = 'CM-999';
    const node = d.network.nodes.find((n) => n.id === 'CM-207')!;
    node.id = 'CM-999';
    expect(errorsOf(d).some((m) => m.includes('CM-207') && m.includes('stable identifier'))).toBe(true);
  });

  it('warns when a district has buildings but nothing watching them', () => {
    const d = clone();
    d.sensors = d.sensors.filter((s) => s.district !== 'northgate');
    const warnings = validateWorld(d).filter((i) => i.severity === 'warning').map((i) => i.message);
    expect(warnings.some((m) => m.includes('northgate') && m.includes('no sensors'))).toBe(true);
  });

  it('names every identifier the story and the tests depend on', () => {
    const d = buildBellhaven();
    for (const id of STABLE_IDS) {
      const found = d.network.nodes.some((n) => n.id === id) || d.sensors.some((s) => s.id === id);
      expect(found, `${id} must be authored with an explicit id, never generated`).toBe(true);
    }
  });

  it('does not mistake an ordinary wall-mounted camera for a blind one', () => {
    // Almost every camera in Bellhaven is bolted to a building. If the check
    // could not tell that from being boxed in, it would be useless.
    const d = buildBellhaven();
    const porches = d.sensors.filter((s) => s.kind === 'porch');
    expect(porches.length).toBeGreaterThan(10);
    expect(errorsOf(d)).toEqual([]);
  });
});
