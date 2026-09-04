import { describe, expect, it } from 'vitest';
import { buildBellhaven } from '../src/content/bellhaven';
import { validateWorld, World } from '../src/sim/world';

const data = buildBellhaven();

describe('Bellhaven content validation', () => {
  it('passes structural validation with no errors', () => {
    const issues = validateWorld(data);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.map((e) => e.message)).toEqual([]);
  });

  it('meets the density targets in the world design doc', () => {
    expect(data.buildings.length).toBeGreaterThanOrEqual(40);
    expect(data.sensors.length).toBeGreaterThanOrEqual(25);
    expect(data.network.segments.length).toBeGreaterThanOrEqual(5);
    expect(data.covers.length).toBeGreaterThanOrEqual(8);
    expect(data.features.length).toBeGreaterThanOrEqual(8);
  });

  it('has a connected road graph reaching every district', () => {
    const world = new World(data);
    const from = world.nearestRoadNode(data.spawns.player, 60);
    expect(from).not.toBeNull();
    for (const d of data.districts) {
      const to = world.nearestRoadNode(d.centre, 200);
      expect(to, `no road node near ${d.id}`).not.toBeNull();
      const path = world.path(from!.id, to!.id);
      expect(path.length, `no route to ${d.id}`).toBeGreaterThan(0);
    }
  });

  it('keeps the Channel off the road graph, which is where freedom lives', () => {
    const world = new World(data);
    // Deep inside the drainage channel, far from any modelled route.
    expect(world.distanceToRoad({ x: 280, y: 440 })).toBeGreaterThan(40);
    expect(world.surfaceAt({ x: 280, y: 440 })).toBe('smoothConcrete');
  });

  it('provides overhead cover that defeats drones', () => {
    const world = new World(data);
    expect(world.underCover({ x: 500, y: 100 })).not.toBeNull(); // parking decks
    expect(world.underCover({ x: 150, y: 420 })).not.toBeNull(); // culvert
    expect(world.underCover({ x: 300, y: 200 })).toBeNull();     // open street
  });

  it('has the story camera on the segment the records describe', () => {
    const cm207 = data.network.nodes.find((n) => n.id === 'CM-207');
    expect(cm207).toBeDefined();
    expect(cm207!.segmentId).toBe('S-N2');
    const seg = data.network.segments.find((s) => s.id === 'S-N2');
    expect(seg!.uplinkId).toBe('TX-2');
    expect(cm207!.edges).toContain('SVC-VISION');
  });
});
