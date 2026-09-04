import { describe, expect, it } from 'vitest';
import { makeSim, place, step } from './harness';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { DRONE } from '../src/sim/drone';
import type { Sim } from '../src/sim/sim';

/**
 * The mobile aiming path, end to end.
 *
 * A first human could see what the slingshot was for and could not land a shot
 * on a drone. These tests reproduce the touch path exactly — a drag direction
 * and a draw amount, no mouse anywhere — and assert the property that was
 * missing: if the game has shown you a lock, the shot goes there.
 */

/** main.ts projects a drag direction 320 screen px out; at zoom ~10 that is 32 m. */
const AIM_PROJECTION_M = 32;

function dragShoot(sim: Sim, angle: number, draw = 1): void {
  const v = { x: Math.cos(angle), y: Math.sin(angle) };
  const at = () => ({
    x: sim.player.pos.x + v.x * AIM_PROJECTION_M,
    y: sim.player.pos.y + v.y * AIM_PROJECTION_M,
  });
  for (let i = 0; i < 50; i++) {
    const it = emptyIntent();
    it.aim = true; it.drawAmount = draw; it.aimVector = v;
    sim.step(TICK_DT, it, at());
  }
  const f = emptyIntent();
  f.aim = true; f.drawAmount = draw; f.aimVector = v;
  f.fire = true; f.firePressed = true;
  sim.step(TICK_DT, f, at());
  for (let i = 0; i < 300 && sim.projectiles.length > 0; i++) {
    sim.step(TICK_DT, emptyIntent(), null);
  }
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

const toward = (sim: Sim, p: { x: number; y: number }, offsetDeg = 0) =>
  Math.atan2(p.y - sim.player.pos.y, p.x - sim.player.pos.x) + (offsetDeg * Math.PI) / 180;

describe('a drone is hittable where a player expects it to be', () => {
  it('is never smaller than its own picture', () => {
    // Drawn as a 1.4 x 1.0 m body with rotors reaching 1.27 m from centre.
    expect(DRONE.hitRadius).toBeGreaterThanOrEqual(1.27);
  });

  it('goes down to a thumb drag from the front', () => {
    const sim = makeSim();
    const d = parkedDrone(sim);
    dragShoot(sim, toward(sim, d.pos));
    expect(d.state).toBe('DESTABILISED');
  });

  it('holds up across the ranges a bearing can actually cross', () => {
    for (const range of [8, 14, 22, 30, 38]) {
      const sim = makeSim();
      const d = parkedDrone(sim, { x: 145, y: 50 }, range);
      dragShoot(sim, toward(sim, d.pos));
      expect({ range, state: d.state }).toEqual({ range, state: 'DESTABILISED' });
    }
  });

  it('holds up at every altitude a drone actually flies at', () => {
    for (const z of [DRONE.investigateAltitude, DRONE.trackAltitude, DRONE.patrolAltitude]) {
      const sim = makeSim();
      const d = parkedDrone(sim);
      d.z = z;
      dragShoot(sim, toward(sim, d.pos));
      expect({ z, state: d.state }).toEqual({ z, state: 'DESTABILISED' });
    }
  });

  it('works on a half-drawn shot, not only a perfect one', () => {
    const sim = makeSim();
    const d = parkedDrone(sim);
    dragShoot(sim, toward(sim, d.pos), 0.5);
    expect(d.state).toBe('DESTABILISED');
  });
});

describe('the lock tells the truth', () => {
  /*
   * The defect this replaces: the character solved the *height* of the arc for
   * whatever was on the line and left the *bearing* wherever the thumb pointed.
   * The acquisition cone was therefore wider than the shot was accurate — past
   * about six degrees the reticle sat on the drone and the bearing went past
   * it. A lock that appears and then misses is worse than no lock.
   */
  it('hits at every angle at which it offers a lock', () => {
    for (const deg of [0, 4, 8, 12, 16]) {
      const sim = makeSim();
      const d = parkedDrone(sim);
      dragShoot(sim, toward(sim, d.pos, deg));
      expect({ deg, lock: sim.aimTarget?.id, state: d.state })
        .toEqual({ deg, lock: 'UAV-01', state: 'DESTABILISED' });
    }
  });

  it('does not claim the drone when the drag is nowhere near it', () => {
    const sim = makeSim();
    const d = parkedDrone(sim);
    dragShoot(sim, toward(sim, d.pos, 30));
    // It may well have found something else out that way — Bellhaven is full of
    // things. What it must not do is show the drone and then miss it.
    expect(sim.aimTarget?.id).not.toBe('UAV-01');
    expect(d.state).not.toBe('DESTABILISED');
  });

  it('names whatever is really in the way, so a stolen lock is visible', () => {
    const sim = makeSim();
    const d = parkedDrone(sim, { x: 145, y: 50 }, 46);
    dragShoot(sim, toward(sim, d.pos));
    // Something nearer on the line takes it. The bracket is on that thing.
    expect(sim.aimTarget).not.toBeNull();
    expect(sim.aimTarget!.id).not.toBe('UAV-01');
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
    dragShoot(sim, toward(sim, d.pos));
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
      dragShoot(sim, toward(sim, jx.pos));
      shots++;
    }
    flush();
    const seg = seen.find((s) => s.lines.some((l) => l.includes('SEGMENT S-X3')));
    expect(seg?.priority).toBe('important');
  });
});
