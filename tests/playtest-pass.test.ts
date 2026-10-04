/**
 * The playtest fix pass: what six sessions of real input found, pinned.
 *
 * The stop happens in front of the player or not at all; the machine is
 * quiet until it has something to say and never says a number; a stone is a
 * noise and not an emergency; moving cannot reach DRONE_DISPATCH; reading a
 * record is not lingering; a record can be traced from wherever it was
 * found; and the first thing in reach is the thing you walked up to.
 */
import { describe, expect, it } from 'vitest';
import { interact, makeSim, makeUnlockedSim, place, shootAt, skate, step } from './harness';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { dist } from '../src/core/math';
import type { Sim } from '../src/sim/sim';
import { StoryDirector, type TalkView } from '../src/content/story';
import { inChannel } from '../src/content/bellhaven';
import { BEHAVIOUR_CEILING } from '../src/sim/surveillance/risk';
import type { UnderwatchMessage } from '../src/sim/events';

function directorFor(sim: Sim) {
  const said: string[] = [];
  const cards: UnderwatchMessage[] = [];
  sim.bus.on('underwatch:message', (m) => cards.push(m));
  const director = new StoryDirector({
    sim,
    hud: { say: (lines: string[]) => said.push(lines.join(' ')), showTalk: (_v: TalkView | null) => {} } as never,
    audio: { motif: () => {}, peelIn: () => {} } as never,
    renderer: { kick: () => {}, speak: () => {} } as never,
    playReprise: () => {},
    hint: { vision: 'HOLD Q', inspect: 'PRESS E' },
  });
  director.begin();
  return { director, said, cards };
}

function run(sim: Sim, director: StoryDirector, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) { sim.step(TICK_DT, emptyIntent(), null); director.update(); }
}

/** Both of them down at the apron, Devon following. */
function inTheChannel(seed = 0x5afe7ace) {
  const sim = makeSim(seed);
  const d = directorFor(sim);
  place(sim, sim.devonPos);
  run(sim, d.director, 1);
  expect(sim.devonFollowing).toBe(true);
  place(sim, { x: 196, y: 428 });
  sim.devonPos = { x: 191, y: 426 };
  return { sim, ...d };
}

describe('the afternoon turns in front of the player', () => {
  it('does not turn the instant a wheel touches the apron', () => {
    const { sim, director } = inTheChannel();
    run(sim, director, 20);
    expect(director.progress).not.toContain('incident');
    run(sim, director, 25);
    expect(director.progress).toContain('incident');
  });

  it('turns sooner for a player who makes it to the bridge Devon named', () => {
    const { sim, director } = inTheChannel();
    run(sim, director, 9);
    place(sim, { x: 160, y: 421 });
    sim.devonPos = { x: 165, y: 423 };
    run(sim, director, 2);
    expect(director.progress).toContain('incident');
  });

  it('stops Devon next to the player, not wherever the last stretch left him', () => {
    const { sim, director } = inTheChannel();
    run(sim, director, 70);
    expect(director.progress).toContain('devon-stopped');
    // He was closing in when it began: the stop is at the player's elbow.
    expect(dist(sim.devonPos, sim.player.pos)).toBeLessThan(7);
  });

  it('walks the officer in down the apron and along the floor, never through the wall', () => {
    const { sim, director } = inTheChannel();
    // Well east of the apron, between the walls: the case that used to leave
    // the officer standing on the grass outside for the whole stop.
    place(sim, { x: 240, y: 434 });
    sim.devonPos = { x: 236, y: 433 };
    run(sim, director, 70);
    expect(director.state.stopBeganAt).toBeGreaterThan(0);
    const officer = sim.person('officer')!;
    expect(officer.visible).toBe(true);
    let insideOnce = false;
    for (let i = 0; i < 60 * 25; i++) {
      sim.step(TICK_DT, emptyIntent(), null); director.update();
      if (inChannel(officer.pos)) insideOnce = true;
    }
    expect(insideOnce).toBe(true);
    expect(dist(officer.pos, sim.devonPos)).toBeLessThan(3);
    expect(inChannel(officer.pos)).toBe(true);
  });

  it('does not start the clock on a stop nobody is there to see', () => {
    const { sim, director } = inTheChannel();
    run(sim, director, 70);
    expect(sim.devonStopped).toBe(true);
    // The player skates a hundred metres off and stays there.
    place(sim, { x: 320, y: 444 });
    run(sim, director, 60);
    expect(director.state.stopClockAt).toBe(-1);
    expect(sim.devonStopped).toBe(true);
    expect(director.state.intervened).toBeNull();
    // And back, in sight of it: now it runs its course.
    place(sim, { x: sim.devonPos.x + 4, y: sim.devonPos.y - 2 });
    run(sim, director, 2);
    expect(director.state.stopClockAt).toBeGreaterThan(0);
    run(sim, director, 46);
    expect(sim.devonStopped).toBe(false);
  });

  it('says what walking up to the officer is', () => {
    const { sim, director } = inTheChannel();
    run(sim, director, 85);
    const officer = sim.person('officer')!;
    place(sim, { x: officer.pos.x + 1.5, y: officer.pos.y + 0.5 });
    step(sim, 0.2);
    expect(sim.interest?.id).toBe('officer');
    expect(sim.interest?.verb).toBe('SPEAK UP');
  });
});

describe('the machine is quiet until it has something to say', () => {
  it('lets CARE speak first: no CITY card for standing on a lawn in view of a camera', () => {
    const sim = makeSim();
    const { director, cards } = directorFor(sim);
    // In view of the Maple Court south camera, on the grass, not moving.
    place(sim, { x: 152, y: 291 });
    run(sim, director, 40);
    expect(cards.filter((m) => m.register === 'SYSTEM')).toEqual([]);
  });

  it('never prints a predictive-risk percentage on a card', () => {
    const sim = makeUnlockedSim();
    const { director, cards } = directorFor(sim);
    place(sim, { x: 300, y: 442 });
    run(sim, director, 30);
    place(sim, { x: 152, y: 291 });
    run(sim, director, 30);
    expect(cards.length).toBeGreaterThan(0);
    for (const m of cards) for (const l of m.lines) expect(l).not.toMatch(/PREDICTIVE RISK|\d+%/);
  });

  it('says a judgement once, and not again for a long while', () => {
    const sim = makeUnlockedSim();
    const { director, cards } = directorFor(sim);
    place(sim, { x: 300, y: 442 });
    run(sim, director, 100);
    const routes = cards.filter((m) => m.lines[0] === 'UNUSUAL ROUTE DETECTED');
    expect(routes.length).toBe(1);
  });

  it('holds its tongue for the whole of the stop', () => {
    const { sim, director, cards } = inTheChannel();
    run(sim, director, 70);
    const before = cards.length;
    place(sim, { x: 300, y: 442 });
    run(sim, director, 30);
    const routine = /UNUSUAL ROUTE|EXTENDED PRESENCE|INTERMITTENT COVERAGE|VELOCITY ADVISORY|PROXIMATE|MONITORING INITIATED/;
    const during = cards.slice(before).filter((m) => m.register === 'SYSTEM' && routine.test(m.lines[0]));
    expect(during.map((m) => m.lines.join(' | '))).toEqual([]);
  });
});

describe('the ladder is priced the way the design says', () => {
  it('a stone into a bin is a noise: heard, written down, and nobody sent', () => {
    const sim = makeUnlockedSim();
    place(sim, { x: 155, y: 270 });
    const before = sim.escalation;
    shootAt(sim, { x: 140, y: 285 });
    expect(sim.dispatcher.activeAnomalies.length).toBe(0);
    step(sim, 3);
    expect([...sim.evidence.values()].some((e) => e.kind === 'NOISE')).toBe(true);
    expect(sim.escalation).toBe(before === 'PASSIVE' ? 'PASSIVE' : before);
    expect(sim.playerTrack.flags.has('PROXIMITY_TO_EVIDENCE')).toBe(false);
  });

  it('moving cannot reach DRONE_DISPATCH, however unusual the route', () => {
    const sim = makeUnlockedSim();
    // Off the road graph, in view, fast, then still: everything an afternoon does.
    place(sim, { x: 300, y: 442 });
    let worst = 0;
    for (let i = 0; i < 40; i++) { skate(sim, 1); worst = Math.max(worst, sim.playerRisk); }
    place(sim, { x: 152, y: 291 });
    for (let i = 0; i < 40; i++) { step(sim, 1); worst = Math.max(worst, sim.playerRisk); }
    expect(worst).toBeLessThanOrEqual(BEHAVIOUR_CEILING);
    expect(['PASSIVE', 'MONITORING']).toContain(sim.escalation);
  });

  it('reading a record is not lingering', () => {
    const sim = makeUnlockedSim();
    // Under CM-207, held by it, panel open.
    place(sim, { x: 146, y: 94 });
    step(sim, 0.5);
    expect(interact(sim)).toBe(true);
    expect(sim.focusNode?.id).toBe('CM-207');
    step(sim, 15);
    expect(sim.playerTrack.flags.has('LOITERING')).toBe(false);
    // Put it away and just stand there, and it is.
    sim.dismissFocus();
    step(sim, 15);
    expect(sim.playerTrack.confidence).toBeGreaterThan(0.25);
    expect(sim.playerTrack.flags.has('LOITERING')).toBe(true);
  });
});

describe('the record chain cannot dead-end', () => {
  it('traces a record from wherever it was found, and reaches the review and the file', () => {
    const sim = makeUnlockedSim();
    place(sim, { x: 146, y: 94 });
    step(sim, 0.5);
    expect(interact(sim)).toBe(true);
    const hack = (verb: 'QUERY' | 'TRACE', id: string) => {
      expect(sim.startHack(verb, id)).toBe(true);
      step(sim, 2.5);
      expect(sim.hack).toBeNull();
    };
    hack('QUERY', 'CM-207');
    hack('TRACE', 'CM-207');
    expect(sim.network.get('SVC-VISION')!.discovered).toBe(true);
    sim.selectNode('SVC-VISION');
    step(sim, 0.1);
    expect(sim.focusNode?.id).toBe('SVC-VISION');
    // Two hundred and fifty metres from where the record "is".
    hack('TRACE', 'SVC-VISION');
    expect(sim.network.get('SVC-REVIEW')!.discovered).toBe(true);
    sim.selectNode('SVC-PREDICT');
    step(sim, 0.1);
    hack('TRACE', 'SVC-PREDICT');
    expect(sim.network.get('SVC-RECORD')!.discovered).toBe(true);
    for (const id of ['SVC-REVIEW', 'SVC-RECORD']) { sim.selectNode(id); step(sim, 0.1); expect(sim.readNodes.has(id)).toBe(true); }
  });
});

describe('the thing you walked up to is the thing you get', () => {
  it('a doorstep in reach beats the friend at your shoulder', () => {
    const sim = makeSim();
    sim.meetDevon();
    sim.showPlace('p-parcel', true);
    const parcel = sim.placeById('p-parcel')!;
    place(sim, { x: parcel.pos.x + 0.5, y: parcel.pos.y + 1.6 });
    sim.devonPos = { x: sim.player.pos.x + 1.5, y: sim.player.pos.y + 1.0 };
    step(sim, 0.2);
    expect(sim.interest?.id).toBe('p-parcel');
  });

  it('the courier stands at a door long enough to be spoken to', () => {
    const sim = makeSim();
    const courier = sim.person('courier')!;
    courier.visible = true;
    let stillFor = 0, longest = 0;
    let last = { ...courier.pos };
    for (let i = 0; i < 60 * 90; i++) {
      sim.step(TICK_DT, emptyIntent(), null);
      if (dist(courier.pos, last) < 0.01) stillFor++; else { longest = Math.max(longest, stillFor); stillFor = 0; }
      last = { ...courier.pos };
    }
    expect(Math.max(longest, stillFor)).toBeGreaterThanOrEqual(60 * 5);
  });
});
