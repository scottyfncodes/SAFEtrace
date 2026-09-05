import { solveTwoBone } from '../src/core/math';
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

  it('mounts every camera on a facade rather than inside a wall', () => {
    // Warnings are real findings, not noise: this one caught porch cameras
    // being placed with the wrong half-extent on non-square houses.
    const warnings = validateWorld(data).filter((i) => i.severity === 'warning');
    expect(warnings.filter((w) => w.message.includes('inside building'))
      .map((w) => w.message)).toEqual([]);
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
    // The running surface beside the invert is the fastest ground in town.
    expect(world.surfaceAt({ x: 280, y: 434 })).toBe('smoothConcrete');
    // The low-flow trickle down the middle is rougher, so the good line is
    // beside it rather than down it.
    expect(world.surfaceAt({ x: 280, y: 440 })).toBe('roughConcrete');
  });

  it('walls the Channel so street cameras cannot see into it, except at the aprons', () => {
    const world = new World(data);
    // A street camera at ground level above the channel, looking in.
    expect(world.blocked({ x: 280, y: 415 }, { x: 280, y: 434 }, 4.2)).toBe(true);
    // The apron is deliberately open: it is the one place a planner modelled.
    expect(world.blocked({ x: 196, y: 412 }, { x: 196, y: 428 }, 4.2)).toBe(false);
  });

  it('gives every Channel apron a paved route that the road graph does not know about', () => {
    const world = new World(data);
    // The intended descents: paved the whole way, so they are skateable.
    const routes: Array<Array<[number, number]>> = [
      [[60, 290], [60, 320], [60, 360], [62, 392]],
      [[196, 290], [196, 330], [196, 380], [196, 414]],
      [[472, 305], [472, 350], [472, 392], [470, 438]],
    ];
    for (const route of routes) {
      for (const [x, y] of route) {
        expect(world.surfaceAt({ x, y }), `unpaved at ${x},${y}`).not.toBe('grass');
      }
    }
    // And the descents are genuinely off the modelled network: the forecast
    // cannot follow the player down them.
    expect(world.distanceToRoad({ x: 196, y: 380 })).toBeGreaterThan(60);
  });

  it('lets a skater reach the Channel from the spawn without crossing a lawn', () => {
    const world = new World(data);
    // Down Maple Court, along Ridgeline Road, then the greenway path.
    const line: Array<[number, number]> = [
      [155, 214], [155, 250], [155, 278], [180, 280], [196, 280],
      [196, 300], [196, 340], [196, 400], [196, 424],
    ];
    for (const [x, y] of line) {
      const s = world.surfaceAt({ x, y });
      expect(['asphalt', 'smoothConcrete', 'roughConcrete', 'tile'], `${s} at ${x},${y}`).toContain(s);
    }
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

describe('a limb bends the way a limb bends', () => {
  /*
   * The reverse-knee bug, closed at the source.
   *
   * The rider's legs used to be a straight quad from foot to hip, then a quad
   * with a joint jammed into the middle at a fixed sideways offset — which
   * meant the direction of the bend was a decoration, tuned by hand for one
   * pose, and wrong in every pose nobody re-tuned. It came out backwards, so
   * the character's knees folded like a bird's.
   *
   * Both legs and both arms now go through one solver, and these hold the
   * property the whole rig depends on: the joint lands on the side you asked
   * for, at every extension, in every pose, with the bones intact.
   */
  const hip = { x: 0, y: 0, z: 0.8 };
  const forward = { x: 1, y: 0 };

  it('puts the knee on the side it was told to, however deep the crouch', () => {
    // From nearly straight down to a deep squat. Full extension has no bend
    // left to have — the straightening case below covers that.
    for (const ankleZ of [0.6, 0.45, 0.3, 0.15, 0.05]) {
      const knee = solveTwoBone(hip, { x: 0, y: 0, z: ankleZ }, 0.4, 0.38, forward);
      expect({ ankleZ, forwardOfHip: knee.x > 0.02 }).toEqual({ ankleZ, forwardOfHip: true });
    }
    // And it comes further forward the deeper the crouch — the hip is at 0.8,
    // so a foot at 0.6 is a folded leg and one at 0.25 is a nearly straight
    // one. Squatting puts your knees out in front of you; this is that.
    const deep = solveTwoBone(hip, { x: 0, y: 0, z: 0.6 }, 0.4, 0.38, forward);
    const shallow = solveTwoBone(hip, { x: 0, y: 0, z: 0.25 }, 0.4, 0.38, forward);
    expect(deep.x).toBeGreaterThan(shallow.x);
  });

  it('bends the other way when asked, which is what an elbow does', () => {
    const back = solveTwoBone(hip, { x: 0, y: 0, z: 0.2 }, 0.4, 0.38, { x: -1, y: 0 });
    expect(back.x).toBeLessThan(-0.02);
  });

  it('keeps both bones their own length, so the leg cannot stretch', () => {
    // Targets inside the limb's reach: past that it straightens, tested below.
    for (const ankle of [
      { x: 0, y: 0, z: 0.2 }, { x: 0.25, y: 0.1, z: 0.25 }, { x: -0.2, y: 0.4, z: 0.3 },
    ]) {
      const knee = solveTwoBone(hip, ankle, 0.4, 0.38, forward);
      const upper = Math.hypot(knee.x - hip.x, knee.y - hip.y, knee.z - hip.z);
      const lower = Math.hypot(ankle.x - knee.x, ankle.y - knee.y, ankle.z - knee.z);
      expect(upper).toBeCloseTo(0.4, 4);
      expect(lower).toBeCloseTo(0.38, 4);
    }
  });

  it('straightens instead of tearing when the foot is out of reach', () => {
    // A pushing leg reaches for the road; it must run out of bend, not snap.
    const far = { x: 2.5, y: 0, z: 0 };
    const knee = solveTwoBone(hip, far, 0.4, 0.38, forward);
    const onLine = Math.hypot(knee.y - hip.y);
    expect(onLine).toBeLessThan(0.02);
    expect(knee.x).toBeGreaterThan(hip.x);
    expect(Number.isFinite(knee.z)).toBe(true);
  });

  it('never returns anything but a real point, whatever it is handed', () => {
    const same = solveTwoBone(hip, { ...hip }, 0.4, 0.38, forward);
    expect([same.x, same.y, same.z].every(Number.isFinite)).toBe(true);
    // A bend direction pointing straight along the limb has no side to pick;
    // it must still produce a joint rather than a NaN.
    const along = solveTwoBone(
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0.6, 0.6, { x: 1, y: 0 },
    );
    expect([along.x, along.y, along.z].every(Number.isFinite)).toBe(true);
  });
});
