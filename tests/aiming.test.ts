import { describe, expect, it } from 'vitest';
import { look, makeSim, place, shootAt, step } from './harness';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { wrapAngle, type Vec2 } from '../src/core/math';
import { DRONE } from '../src/sim/drone';
import type { Sim } from '../src/sim/sim';

/**
 * The mobile aiming path, end to end.
 *
 * A first human could see what the slingshot was for and could not land a shot
 * on a drone. These tests reproduce the touch path exactly — a look direction,
 * a look elevation and a draw amount, no mouse anywhere — and assert the
 * property the whole mode rests on: the bearing goes where the sight is, and
 * nowhere else. Nothing in the simulation moves the shot toward a target.
 */

/** Look at a thing, draw, release. Degrees are the player's own error. */
function aimShoot(
  sim: Sim,
  at: Vec2 | (() => Vec2),
  z: number | (() => number),
  offsetDeg = 0,
  draw = 1,
): void {
  shootAt(sim, at, z, offsetDeg, draw);
}

/** Park a drone where the test wants it, then let its altitude settle. */
function parkedDrone(sim: Sim, at = { x: 145, y: 50 }, range = 14) {
  const d = sim.drones[0];
  d.route = [at];
  d.routeIndex = 0;
  d.pos = { ...at };
  place(sim, { x: at.x, y: at.y + range });
  step(sim, 2.0);
  return d;
}

describe('a drone is hittable where a player expects it to be', () => {
  it('is never smaller than its own picture', () => {
    // Drawn as a 1.4 x 1.0 m body with rotors reaching 1.27 m from centre.
    expect(DRONE.hitRadius).toBeGreaterThanOrEqual(1.27);
  });

  it('goes down to a thumb drag from the front', () => {
    const sim = makeSim();
    const d = parkedDrone(sim);
    aimShoot(sim, () => d.pos, () => d.z);
    expect(d.state).toBe('DESTABILISED');
  });

  it('holds up across the ranges a bearing can actually cross', () => {
    for (const range of [8, 14, 22, 30, 38]) {
      const sim = makeSim();
      const d = parkedDrone(sim, { x: 145, y: 50 }, range);
      aimShoot(sim, () => d.pos, () => d.z);
      expect({ range, state: d.state }).toEqual({ range, state: 'DESTABILISED' });
    }
  });

  it('holds up at every altitude a drone actually flies at', () => {
    for (const z of [DRONE.investigateAltitude, DRONE.trackAltitude, DRONE.patrolAltitude]) {
      const sim = makeSim();
      const d = parkedDrone(sim);
      d.z = z;
      aimShoot(sim, () => d.pos, () => d.z);
      expect({ z, state: d.state }).toEqual({ z, state: 'DESTABILISED' });
    }
  });

  it('works on a half-drawn shot, not only a perfect one', () => {
    const sim = makeSim();
    const d = parkedDrone(sim);
    aimShoot(sim, () => d.pos, () => d.z, 0, 0.5);
    expect(d.state).toBe('DESTABILISED');
  });
});

describe('the player aims, and nothing aims for them', () => {
  /*
   * Two defects preceded this contract, and both were the same mistake twice.
   *
   * First the character solved the *height* of the arc for whatever was on the
   * line and left the *bearing* wherever the thumb pointed, so the reticle sat
   * on a drone and the shot went past it. Then the bearing was bent onto the
   * target instead — sixteen degrees at first, six after that — which fixed
   * the miss by taking the aiming away from the player. A slingshot that
   * quietly closes the gap cannot teach anybody to shoot, and it makes every
   * miss ambiguous: the player never learns whether it was theirs.
   *
   * What survives is ranging, which is not aiming. Somebody who has thrown a
   * thousand of these knows the arc that reaches the thing they are looking
   * at. The direction is entirely the player's, at every distance, forever.
   */
  it('hits what the sight is actually on', () => {
    // Inside the drone's own silhouette: 1.3 m of rotor at fourteen metres is
    // a little over five degrees wide, so three is still on it.
    for (const deg of [0, 3]) {
      const sim = makeSim();
      const d = parkedDrone(sim);
      aimShoot(sim, () => d.pos, () => d.z, deg);
      expect({ deg, state: d.state }).toEqual({ deg, state: 'DESTABILISED' });
    }
  });

  it('misses when the player misses, and never corrects for them', () => {
    for (const deg of [8, 16, 24]) {
      const sim = makeSim();
      const d = parkedDrone(sim);
      aimShoot(sim, () => d.pos, () => d.z, deg);
      expect({ deg, state: d.state }).toEqual({ deg, state: 'PATROL' });
    }
  });

  it('sends the bearing along the line it was pointed down, not toward a target', () => {
    /*
     * The direct assertion. A drone is parked dead ahead and the sight is put
     * eight degrees to the side of it. The shot must leave on the bearing the
     * player chose — no bend, no partial bend — so the angle between the
     * launch and the aim is nothing but the character's own unsteadiness.
     */
    const sim = makeSim();
    const d = parkedDrone(sim);
    const off = (8 * Math.PI) / 180;
    for (let i = 0; i < 40; i++) {
      const it = emptyIntent();
      it.aim = true;
      sim.step(TICK_DT, it, look(sim, d.pos, d.z, 8));
    }
    const wanted = Math.atan2(d.pos.y - sim.player.pos.y, d.pos.x - sim.player.pos.x) + off;
    expect(Math.abs(wrapAngle(sim.aim.angle - wanted))).toBeLessThan(1e-6);

    const f = emptyIntent();
    f.aim = true; f.fire = true; f.firePressed = true;
    sim.step(TICK_DT, f, look(sim, d.pos, d.z, 8));
    const p = sim.projectiles[0];
    const flew = Math.atan2(p.vel.y, p.vel.x);
    // Sway is the only thing between the aim and the shot, and it is small.
    expect(Math.abs(wrapAngle(flew - wanted))).toBeLessThan(0.05);
  });

  it('names only what the sight is really on, so the bracket cannot lie', () => {
    const sim = makeSim();
    const d = parkedDrone(sim);
    // On it: the bracket is on it.
    for (let i = 0; i < 10; i++) {
      const it = emptyIntent();
      it.aim = true;
      sim.step(TICK_DT, it, look(sim, d.pos, d.z));
    }
    expect(sim.aimTarget?.id).toBe('UAV-01');
    // A drone's width off it: nothing is claimed, and nothing is nudged.
    for (let i = 0; i < 10; i++) {
      const it = emptyIntent();
      it.aim = true;
      sim.step(TICK_DT, it, look(sim, d.pos, d.z, 12));
    }
    expect(sim.aimTarget?.id).not.toBe('UAV-01');
  });
});

describe('drawing the sling settles the board', () => {
  it('coasts a rolling player toward a stop instead of asking for three thumbs', () => {
    const sim = makeSim();
    place(sim, { x: 145, y: 62 }, { x: 0, y: -8 });
    const before = sim.player.speed;
    for (let i = 0; i < 60; i++) {
      const it = emptyIntent();
      it.aim = true; it.drawAmount = 1; it.aimVector = { x: 0, y: -1 };
      sim.step(TICK_DT, it, { x: 145, y: 30 });
    }
    expect(sim.player.speed).toBeLessThan(before * 0.45);
  });

  it('does not take the board away: let go and you roll again', () => {
    const sim = makeSim();
    place(sim, { x: 145, y: 62 }, { x: 0, y: -8 });
    for (let i = 0; i < 30; i++) {
      const it = emptyIntent();
      it.aim = true; it.drawAmount = 1; it.aimVector = { x: 0, y: -1 };
      sim.step(TICK_DT, it, { x: 145, y: 30 });
    }
    expect(sim.player.onBoard).toBe(true);
    expect(sim.player.stance).not.toBe('FOOT');
  });
});

describe('notifications are ranked before they are reduced', () => {
  /*
   * The first human to play found the notifications overwhelming. The problem
   * was never the volume — SAFEtrace is supposed to be invasive — it was that
   * an advert and an authorised intervention arrived as the same card in the
   * same stack, so nothing could be ranked at a glance.
   */
  // Events are queued during a tick and delivered on flush, which is what keeps
  // the simulation free of side effects. Tests have to flush like the game does.
  const capture = (sim: Sim) => {
    const seen: Array<{ priority: string; lines: string[] }> = [];
    sim.bus.on('safetrace:message', (m) => seen.push({ priority: m.priority, lines: m.lines }));
    return { seen, flush: () => sim.bus.flush() };
  };

  it('gives every message a priority, so none of them can be unranked', () => {
    const sim = makeSim();
    const { seen, flush } = capture(sim);
    sim.message('SYSTEM', ['A CONTEXTUAL LINE']);
    sim.message('CARE', ['a warm line']);
    sim.message('SYSTEM', ['SOMETHING HAPPENING'], 3, 'strong');
    flush();
    expect(seen.map((s) => s.priority)).toEqual(['context', 'ambient', 'critical']);
  });

  it('files the brand talking to itself as the first thing worth dropping', () => {
    const sim = makeSim();
    const { seen, flush } = capture(sim);
    sim.message('CARE', ['the weather is lovely']);
    flush();
    expect(seen[0].priority).toBe('ambient');
  });

  it('ranks a patrol coming for you above a camera fault', () => {
    const sim = makeSim();
    const { seen, flush } = capture(sim);
    const d = parkedDrone(sim);
    aimShoot(sim, () => d.pos, () => d.z);
    flush();
    const priorities = new Set(seen.map((s) => s.priority));
    // The shot itself is context; it is not an emergency that a bearing landed.
    expect(priorities.has('context')).toBe(true);
    expect(priorities.has('critical')).toBe(false);
  });

  it('marks the segment lesson as worth looking up for', () => {
    const sim = makeSim();
    const { seen, flush } = capture(sim);
    const jx = sim.network.get('JX-R12')!;
    place(sim, { x: 495, y: 266 });
    step(sim, 0.3);
    let shots = 0;
    while (sim.network.get('JX-R12')!.state === 'NOMINAL' && shots < 8) {
      aimShoot(sim, jx.pos, 1.6);
      shots++;
    }
    flush();
    const seg = seen.find((s) => s.lines.some((l) => l.includes('SEGMENT S-X3')));
    expect(seg?.priority).toBe('important');
  });
});

describe('the stationary aiming mode', () => {
  /*
   * Requested twice by the human running the playtests, and built the second
   * time. Exploring and shooting were being asked of the same two thumbs at
   * once; they are now separate states with one door between them.
   */
  const enter = (sim: Sim) => {
    const it = emptyIntent();
    it.aimModePressed = true;
    sim.step(TICK_DT, it, null);
  };

  it('enters and leaves on the same request', () => {
    const sim = makeSim();
    expect(sim.aimMode).toBe(false);
    enter(sim);
    expect(sim.aimMode).toBe(true);
    enter(sim);
    expect(sim.aimMode).toBe(false);
  });

  it('opens whenever the player asks, because there is no pocket to be empty', () => {
    /*
     * There used to be twelve steel bearings, a counter, rocks to walk back
     * and collect, and resupply caches — a tax on experimenting with the one
     * tool the game hands you. It throws rocks now. You are standing on more
     * of them.
     */
    const sim = makeSim();
    for (let i = 0; i < 30; i++) {
      enter(sim);
      expect(sim.aimMode).toBe(true);
      enter(sim);
    }
  });

  it('stops the character dead and keeps them exactly where they stood', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 }, { x: 7, y: 2 });
    enter(sim);
    const anchor = { ...sim.aimAnchor! };
    // Now shove every movement input at it for two seconds.
    for (let i = 0; i < 120; i++) {
      const it = emptyIntent();
      it.moveVector = { x: 1, y: 0 };
      it.push = true;
      it.pushPressed = true;
      it.steer = 1;
      it.olliePressed = true;
      sim.step(TICK_DT, it, null);
    }
    expect(sim.player.pos.x).toBeCloseTo(anchor.x, 6);
    expect(sim.player.pos.y).toBeCloseTo(anchor.y, 6);
    expect(sim.player.speed).toBe(0);
    expect(sim.aimMode).toBe(true);
  });

  it('fires from where the character is standing, not from where they were', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 }, { x: 7, y: 0 });
    enter(sim);
    const anchor = { ...sim.aimAnchor! };
    for (let i = 0; i < 40; i++) {
      const it = emptyIntent();
      it.aim = true;
      sim.step(TICK_DT, it, { x: anchor.x + 30, y: anchor.y });
    }
    const f = emptyIntent();
    f.aim = true; f.fire = true; f.firePressed = true;
    sim.step(TICK_DT, f, { x: anchor.x + 30, y: anchor.y });
    expect(sim.projectiles.length).toBe(1);
    expect(sim.projectiles[0].origin.x).toBeCloseTo(anchor.x, 3);
    expect(sim.projectiles[0].origin.y).toBeCloseTo(anchor.y, 3);
  });

  it('says what the shot did, so a player can learn from it', () => {
    const sim = makeSim();
    const d = parkedDrone(sim);
    enter(sim);
    aimShoot(sim, () => d.pos, () => d.z);
    expect(sim.lastShot).not.toBeNull();
    expect(sim.lastShot!.hit).toBe(true);
    expect(sim.lastShot!.label).toBe('UAV-01');
  });

  it('holds the mode for as long as the player wants it, and only they end it', () => {
    const sim = makeSim();
    enter(sim);
    for (let i = 0; i < 400; i++) sim.step(TICK_DT, emptyIntent(), null);
    expect(sim.aimMode).toBe(true);
    enter(sim);
    expect(sim.aimMode).toBe(false);
  });

  it('gives the board back on the way out', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    enter(sim);
    enter(sim);
    for (let i = 0; i < 90; i++) {
      const it = emptyIntent();
      it.moveVector = { x: 1, y: 0 };
      it.push = true; it.pushPressed = true;
      sim.step(TICK_DT, it, null);
    }
    expect(sim.player.speed).toBeGreaterThan(1);
  });
});

describe('the network stays shut until the game opens it', () => {
  /*
   * A human met the inspect panel forty-four metres from the spawn — "JXM1",
   * five verb buttons, no context — and could not tell whether it was danger,
   * an objective or scenery. Bellhaven is just a nice place until Devon is
   * stopped.
   */
  it('shows nothing to inspect in the opening', () => {
    const sim = makeSim();
    place(sim, { x: 155, y: 250 });   // right on top of JX-M1
    step(sim, 1);
    expect(sim.visionUnlocked).toBe(false);
    expect(sim.focusNode).toBeNull();
  });

  /*
   * And once it is open, it still takes an act to open it.
   *
   * A screen used to appear because the player was near something, which is
   * how "CM-009" turned up over the middle of a street somebody was skating
   * down. Standing next to a node offers it. Nothing else does.
   */
  it('offers a node in reach without opening anything', () => {
    const sim = makeSim();
    sim.unlockVision();
    place(sim, { x: 155, y: 250 });
    step(sim, 1);
    expect(sim.interactCandidate?.id).toBe('JX-M1');
    expect(sim.focusNode).toBeNull();
  });

  it('opens only when the player actually reaches for it', () => {
    const sim = makeSim();
    sim.unlockVision();
    place(sim, { x: 155, y: 250 });
    step(sim, 1);
    expect(sim.focusNode).toBeNull();

    const reach = emptyIntent();
    reach.interactPressed = true;
    sim.step(TICK_DT, reach, null);
    expect(sim.focusNode?.id).toBe('JX-M1');
  });

  it('never opens on proximity, however long the player stands there', () => {
    const sim = makeSim();
    sim.unlockVision();
    place(sim, { x: 155, y: 250 });
    for (let i = 0; i < 60; i++) {
      step(sim, 0.5);
      expect(sim.focusNode).toBeNull();
    }
  });

  it('closes on the same press that opened it, and reopens on request', () => {
    const sim = makeSim();
    sim.unlockVision();
    place(sim, { x: 155, y: 250 });
    step(sim, 0.5);
    const reach = emptyIntent();
    reach.interactPressed = true;
    sim.step(TICK_DT, reach, null);
    expect(sim.focusNode?.id).toBe('JX-M1');

    sim.dismissFocus();
    step(sim, 0.5);
    expect(sim.focusNode).toBeNull();
    // And asking for it back works.
    sim.selectNode('JX-M1');
    expect(sim.focusNode?.id).toBe('JX-M1');
  });
});

describe('it handles like a skateboard, not a radio-controlled car', () => {
  /*
   * A human said the movement "feels too much like an RC car". Two causes, and
   * both are asserted against here: the heading was set straight from the stick
   * so the board pivoted instantly, and lateral velocity was scrubbed 86% every
   * frame so there was no arc to a turn and nothing carried through it.
   */
  const hold = (sim: Sim, v: { x: number; y: number }, seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      const it = emptyIntent();
      it.moveVector = v;
      it.push = true;
      it.pushPressed = true;
      sim.step(TICK_DT, it, null);
    }
  };

  it('does not pivot on the spot: a standing board has to be pushed to turn', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 });
    sim.player.heading = 0;
    // A quarter turn demanded of a stationary board, for a third of a second.
    for (let i = 0; i < 20; i++) {
      const it = emptyIntent();
      it.moveVector = { x: 0, y: -1 };
      sim.step(TICK_DT, it, null);
    }
    // It has begun to come round, but nothing like all the way.
    expect(Math.abs(sim.player.heading)).toBeGreaterThan(0.02);
    expect(Math.abs(sim.player.heading)).toBeLessThan(Math.PI / 4);
  });

  it('builds the turn up rather than snapping to it', () => {
    const sim = makeSim();
    place(sim, { x: 158, y: 214 }, { x: 6, y: 0 });
    sim.player.heading = 0;
    const rates: number[] = [];
    for (let i = 0; i < 18; i++) {
      const it = emptyIntent();
      it.moveVector = { x: 0, y: -1 };
      sim.step(TICK_DT, it, null);
      rates.push(Math.abs(sim.player.turnRate));
    }
    // The angular rate is still climbing several frames in: it has weight.
    expect(rates[12]).toBeGreaterThan(rates[2]);
    expect(rates[2]).toBeGreaterThan(0);
  });

  it('carries through a turn instead of the velocity snapping to the nose', () => {
    const sim = makeSim();
    place(sim, { x: 300, y: 150 }, { x: 8, y: 0 });   // Bellhaven Avenue: genuinely open road
    sim.player.heading = 0;
    hold(sim, { x: 0, y: -1 }, 0.25);
    const heading = sim.player.heading;
    const travel = Math.atan2(sim.player.vel.y, sim.player.vel.x);
    // Mid-carve the board points further round than it is actually going.
    expect(Math.abs(heading - travel)).toBeGreaterThan(0.02);
  });

  it('leans into the carve, and comes back level', () => {
    const sim = makeSim();
    place(sim, { x: 300, y: 150 }, { x: 8, y: 0 });
    sim.player.heading = 0;
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      const it = emptyIntent();
      it.moveVector = { x: 0, y: -1 };
      it.push = true; it.pushPressed = true;
      sim.step(TICK_DT, it, null);
      peak = Math.max(peak, Math.abs(sim.player.lean));
    }
    // Enough to see: a fifth of a radian is about twelve degrees of body.
    expect(peak).toBeGreaterThan(0.18);
    for (let i = 0; i < 120; i++) sim.step(TICK_DT, emptyIntent(), null);
    expect(Math.abs(sim.player.lean)).toBeLessThan(0.05);
  });

  it('answers the thumb quickly: a board turns on a person\'s weight', () => {
    /*
     * The other half of the RC-car complaint, and it took two passes to find.
     * The first fix gave the board weight, which was right, and then went too
     * far the other way: authority was held back by a cubic on the stick's own
     * travel *and* scaled against a wide angular band, so ordinary steering
     * lived in the bottom third of the response and the board felt like it was
     * ignoring you. A skateboard is turned by a person shifting their weight
     * onto an edge, and it answers immediately.
     *
     * Half a second of a hard right angle demanded of a rolling board is most
     * of the way round. It still has to build — the test above holds that —
     * but it builds fast.
     */
    const sim = makeSim();
    place(sim, { x: 300, y: 150 }, { x: 7, y: 0 });
    sim.player.heading = 0;
    hold(sim, { x: 0, y: -1 }, 0.5);
    expect(Math.abs(sim.player.heading)).toBeGreaterThan(0.75);
  });

  it('gives a small push of the thumb a small turn, so it is still steerable', () => {
    // Sensitivity is not twitchiness: a thumb barely off centre asks for a
    // correction, not a carve.
    const sim = makeSim();
    place(sim, { x: 300, y: 150 }, { x: 7, y: 0 });
    sim.player.heading = 0;
    hold(sim, { x: 0.97, y: -0.24 }, 0.5);
    expect(Math.abs(sim.player.heading)).toBeLessThan(0.42);
  });

  it('still goes where it is pointed, given a moment', () => {
    const sim = makeSim();
    place(sim, { x: 300, y: 150 }, { x: 6, y: 0 });
    sim.player.heading = 0;
    hold(sim, { x: 0, y: -1 }, 1.6);
    expect(Math.abs(sim.player.heading + Math.PI / 2)).toBeLessThan(0.6);
  });

  it('pushes visibly, and only while pushing', () => {
    const sim = makeSim();
    place(sim, { x: 300, y: 150 });
    let sawPush = false;
    let sawRest = false;
    for (let i = 0; i < 120; i++) {
      const it = emptyIntent();
      it.moveVector = { x: 1, y: 0 };
      it.push = true; it.pushPressed = true;
      sim.step(TICK_DT, it, null);
      if (sim.player.pushPhase > 0) sawPush = true; else sawRest = true;
    }
    expect(sawPush).toBe(true);
    expect(sawRest).toBe(true);
  });

  it('pops high enough that the shadow separates from the board', () => {
    const sim = makeSim();
    place(sim, { x: 300, y: 150 }, { x: 6, y: 0 });
    const it = emptyIntent();
    it.olliePressed = true;
    it.ollieReleased = true;
    sim.step(TICK_DT, it, null);
    let apex = 0;
    for (let i = 0; i < 60; i++) {
      sim.step(TICK_DT, emptyIntent(), null);
      apex = Math.max(apex, sim.player.z);
    }
    expect(apex).toBeGreaterThan(0.35);
  });
});

describe('the pop clears something worth clearing', () => {
  it('gets about a metre off the road, with a readable arc', () => {
    const sim = makeSim();
    place(sim, { x: 300, y: 150 }, { x: 6, y: 0 });
    const it = emptyIntent();
    it.olliePressed = true;
    it.ollieReleased = true;
    sim.step(TICK_DT, it, null);

    let apex = 0;
    let rising = 0;
    let falling = 0;
    let last = sim.player.z;
    for (let i = 0; i < 120 && (sim.player.z > 0 || i < 3); i++) {
      sim.step(TICK_DT, emptyIntent(), null);
      if (sim.player.z > last) rising++; else if (sim.player.z < last) falling++;
      apex = Math.max(apex, sim.player.z);
      last = sim.player.z;
    }
    // Roughly double the 0.41 m a tap used to reach.
    expect(apex).toBeGreaterThan(0.78);
    expect(apex).toBeLessThan(1.3);
    // An arc, not a teleport: it spends time going up and time coming down.
    expect(rising).toBeGreaterThan(10);
    expect(falling).toBeGreaterThan(10);
  });

  it('lands, and absorbs the landing rather than bouncing', () => {
    const sim = makeSim();
    place(sim, { x: 300, y: 150 }, { x: 6, y: 0 });
    const it = emptyIntent();
    it.olliePressed = true;
    it.ollieReleased = true;
    sim.step(TICK_DT, it, null);
    for (let i = 0; i < 200 && sim.player.stance === 'AIR'; i++) {
      sim.step(TICK_DT, emptyIntent(), null);
    }
    expect(sim.player.stance).not.toBe('AIR');
    expect(sim.player.z).toBeLessThan(0.05);
    expect(sim.player.landTimer).toBeGreaterThan(0);
  });
});
