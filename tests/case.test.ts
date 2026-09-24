import { describe, expect, it } from 'vitest';
import { makeSim, place, step } from './harness';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { dist } from '../src/core/math';
import type { Sim } from '../src/sim/sim';
import { Casefile, validateCase } from '../src/sim/casefile';
import {
  CASE, CASE_HOLDS, CLUES, DEDUCTIONS, ENDINGS, ENDING_ORDER, PLACES, RECORD_CLUES,
  caseStrength, resolveEnding,
} from '../src/content/case';
import { PEOPLE_NAMES, chooseOption, openConversation, type TalkContext } from '../src/content/talk';
import { StoryDirector, type TalkView } from '../src/content/story';
import { DEVON_HOME } from '../src/content/cast';
import { buildBellhaven } from '../src/content/bellhaven';
import { resolveRecords } from '../src/sim/worldTypes';

function directorFor(sim: Sim) {
  const said: string[] = [];
  const views: Array<TalkView | null> = [];
  let reprise: string | undefined;
  const director = new StoryDirector({
    sim,
    hud: {
      say: (lines: string[]) => said.push(lines.join(' ')),
      showTalk: (v: TalkView | null) => views.push(v),
    } as never,
    audio: { motif: () => {}, peelIn: () => {} } as never,
    renderer: { kick: () => {} } as never,
    playReprise: (e) => { reprise = e; },
    hint: { vision: 'HOLD Q', inspect: 'PRESS E' },
  });
  director.begin();
  return { director, said, views, reprise: () => reprise };
}

function run(sim: Sim, director: StoryDirector, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) { sim.step(TICK_DT, emptyIntent(), null); director.update(); }
}

function press(sim: Sim, director: StoryDirector): void {
  const it = emptyIntent();
  it.interactPressed = true;
  sim.step(TICK_DT, it, null);
  director.update();
}

/** Walk up to somebody or something and attend to it, the way a player does. */
function attend(sim: Sim, director: StoryDirector, at: { x: number; y: number }): void {
  place(sim, { x: at.x + 1.2, y: at.y + 0.6 });
  sim.step(TICK_DT, emptyIntent(), null);
  press(sim, director);
}

/** Read out a whole conversation, taking the given answers in order. */
function hearOut(sim: Sim, director: StoryDirector, answers: string[] = []): void {
  for (let guard = 0; guard < 30 && sim.engagedWith; guard++) {
    const v = director.talking;
    if (!v) break;
    if (v.choices.length) {
      const next = answers.shift();
      director.choose(next ?? 'leave');
      continue;
    }
    press(sim, director);
  }
}

/** The afternoon up to Devon being stopped, played the way a player plays it. */
function throughTheStop(seed = 0x5afe7ace) {
  const sim = makeSim(seed);
  const d = directorFor(sim);
  place(sim, sim.devonPos);
  run(sim, d.director, 1);
  expect(sim.devonFollowing).toBe(true);
  place(sim, { x: 196, y: 428 });
  sim.devonPos = { x: 191, y: 426 };
  run(sim, d.director, 60);
  expect(d.director.progress).toContain('devon-stopped');
  return { sim, ...d };
}

const standing = (keyFindings: number, onRecord = false, misled = false) => ({ keyFindings, onRecord, misled });

describe('the case, as authored', () => {
  it('is internally consistent', () => {
    expect(validateCase(CASE)).toEqual([]);
  });

  it('has four load-bearing findings, one per question that matters', () => {
    const keys = DEDUCTIONS.filter((d) => d.key);
    expect(keys.length).toBe(4);
    expect(new Set(keys.map((k) => k.thread)).size).toBe(4);
  });

  it('can reach every clue from somewhere a player can actually go', () => {
    const reachable = new Set<string>(['c-match', 'c-with-me', 'c-apron']);
    for (const c of Object.values(RECORD_CLUES)) reachable.add(c);
    for (const p of Object.values(PLACES)) if (p.clue) reachable.add(p.clue);
    // Every person, in every state of the afternoon worth speaking to them in.
    for (const id of Object.keys(PEOPLE_NAMES)) {
      for (const matched of [false, true]) for (const released of [false, true]) for (const times of [0, 1, 2]) {
        const ctx: TalkContext = {
          matched, devonStopped: false, devonReleased: released, intervened: false,
          has: () => false, deductions: 1, openConnections: 0, strength: 0, onRecord: false, misled: false,
          report: null, times, toldCarvalho: false,
        };
        for (const l of openConversation(id, ctx).learn ?? []) reachable.add(l);
      }
    }
    for (const c of CLUES) expect(reachable.has(c.id), `${c.id} cannot be found`).toBe(true);
  });

  it('puts every record clue on a node that says what the clue says', () => {
    const world = buildBellhaven();
    const ctx = { tick: 0, evidence: [], network: world.network, playerIdentity: '4417' };
    const text = (id: string) => resolveRecords(world.network.nodes.find((n) => n.id === id)?.records, ctx).join(' ');
    expect(text('SVC-VISION')).toMatch(/61\.2%/);
    expect(text('SVC-VISION')).toMatch(/HOOD/);
    expect(text('SVC-PREDICT')).toMatch(/61\.2% -> 98\.7%/);
    expect(text('CM-D01')).toMatch(/04:39:52.*ARAYA, DEVON M\./);
    for (const node of Object.keys(RECORD_CLUES)) expect(text(node).length, node).toBeGreaterThan(20);
  });

  it('authors a place in the town for every place it describes, and nothing it does not', () => {
    const world = buildBellhaven();
    const placed = new Set(world.places.map((p) => p.id));
    for (const id of Object.keys(PLACES)) expect(placed.has(id), id).toBe(true);
    for (const p of world.places) {
      expect(PLACES[p.id], p.id).toBeDefined();
      if (p.sceneProp) expect(world.sceneProps.some((s) => s.id === p.sceneProp), p.id).toBe(true);
    }
  });

  it('keeps every person and every place standing somewhere a person could stand', () => {
    const sim = makeSim();
    for (const p of sim.people) expect(sim.world.buildingAt(p.pos), p.id).toBeNull();
    for (const p of sim.places) expect(sim.world.buildingAt(p.pos), p.id).toBeNull();
    expect(sim.world.buildingAt(DEVON_HOME)).toBeNull();
  });
});

describe('the notebook', () => {
  it('connects two things in either order, once', () => {
    const cf = new Casefile(CASE);
    cf.learn('c-vision', 1); cf.learn('c-predict', 2);
    const r = cf.connect('c-predict', 'c-vision', 3);
    expect(r.kind).toBe('new');
    expect(cf.connect('c-vision', 'c-predict', 4).kind).toBe('known');
    expect(cf.keyFindings).toBe(1);
    expect(cf.threadAnswered('match')).toBe(true);
  });

  it('refuses to connect what you do not have, and shrugs at what means nothing', () => {
    const cf = new Casefile(CASE);
    cf.learn('c-match', 1); cf.learn('c-courier', 2);
    expect(cf.connect('c-match', 'c-vision', 3).kind).toBe('unknown-input');
    expect(cf.connect('c-match', 'c-courier', 3).kind).toBe('nothing');
    expect(cf.connect('c-match', 'c-match', 3).kind).toBe('unknown-input');
  });

  it('lets your own reasoning overturn something you were told', () => {
    const cf = new Casefile(CASE);
    cf.learn('c-brennan', 1);
    expect(cf.believesMisinformation(['c-brennan'])).toBe(true);
    cf.learn('c-alert', 2);
    cf.connect('c-alert', 'c-brennan', 3);
    expect(cf.isDisproved('c-brennan')).toBe(true);
    expect(cf.believesMisinformation(['c-brennan'])).toBe(false);
  });

  it('says there is something to connect without saying what', () => {
    const cf = new Casefile(CASE);
    cf.learn('c-parcel', 1);
    expect(cf.openConnections()).toBe(0);
    cf.learn('c-autoreport', 2);
    expect(cf.openConnections('burglary')).toBe(1);
    expect(cf.openConnections('match')).toBe(0);
  });

  it('survives being written down and read back', () => {
    const a = new Casefile(CASE);
    a.learn('c-vision', 1); a.learn('c-predict', 2); a.connect('c-vision', 'c-predict', 3); a.markAllSeen();
    const b = new Casefile(CASE);
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    expect([...b.clues.keys()]).toEqual(['c-vision', 'c-predict']);
    expect(b.keyFindings).toBe(1);
    expect(b.unseen).toBe(0);
  });
});

describe('how it ends is read off the notes', () => {
  it('holds only when enough of the case is actually made', () => {
    expect(resolveEnding('priya', standing(CASE_HOLDS))).toBe('review');
    expect(resolveEnding('priya', standing(CASE_HOLDS - 1))).toBe('noted');
    expect(resolveEnding('mara', standing(4))).toBe('window');
    expect(resolveEnding('mara', standing(2))).toBe('rumour');
    expect(resolveEnding('dropped', standing(4))).toBe('dropped');
  });

  it('charges for being on file, and for repeating something you could have disproved', () => {
    expect(caseStrength(standing(3, true))).toBe(2);
    expect(caseStrength(standing(3, false, true))).toBe(2);
    expect(resolveEnding('priya', standing(3, true))).toBe('noted');
    expect(resolveEnding('priya', standing(4, true))).toBe('review');
    expect(caseStrength(standing(0, true, true))).toBe(0);
  });

  it('has an ending for every outcome, each with its own last word', () => {
    expect(ENDING_ORDER.length).toBe(5);
    const titles = new Set(ENDING_ORDER.map((e) => ENDINGS[e].title));
    expect(titles.size).toBe(5);
    for (const id of ENDING_ORDER) expect(ENDINGS[id].epilogue.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the afternoon, as a player plays it', () => {
  it('does not start the incident for a player who never went and found Devon', () => {
    const sim = makeSim();
    const { director } = directorFor(sim);
    place(sim, { x: 196, y: 428 });
    run(sim, director, 60);
    expect(director.progress).not.toContain('incident');
    expect(sim.incidents.length).toBe(0);
  });

  it('writes down the two things the player is sure of when the match lands', () => {
    const { sim } = throughTheStop();
    expect(sim.casefile.has('c-match')).toBe(true);
    expect(sim.casefile.has('c-with-me')).toBe(true);
    // And Northgate has changed, for anybody who goes to look.
    expect(sim.placeById('p-parcel')!.visible).toBe(true);
    expect(sim.person('carvalho')!.visible).toBe(true);
    expect(sim.devonMarked).toBe(true);
  });

  it('sends somebody to stand with Devon, and he is still there to be seen', () => {
    const { sim, director } = throughTheStop();
    const officer = sim.person('officer')!;
    expect(officer.visible).toBe(true);
    run(sim, director, 12);
    expect(dist(officer.pos, sim.devonPos)).toBeLessThan(3);
    expect(sim.devonVisible).toBe(true);
  });

  it('puts the player on file for speaking up, and gives them the apron camera for it', () => {
    const { sim, director } = throughTheStop();
    run(sim, director, 12);
    const officer = sim.person('officer')!;
    attend(sim, director, officer.pos);
    expect(sim.engagedWith?.id).toBe('officer');
    hearOut(sim, director, ['intervene']);
    expect(director.state.intervened).toBe(true);
    expect(sim.playerSubject.priorContacts).toBe(1);
    run(sim, director, 7);
    expect(sim.casefile.has('c-apron')).toBe(true);
  });

  it('leaves the player off the record for standing back, and Devon tells them later instead', () => {
    const { sim, director } = throughTheStop();
    run(sim, director, 50);
    expect(director.state.intervened).toBe(false);
    expect(sim.playerSubject.priorContacts).toBe(0);
    expect(sim.casefile.has('c-apron')).toBe(false);
    run(sim, director, 20);
    expect(sim.devonVisible).toBe(true);
    expect(dist(sim.devonPos, DEVON_HOME)).toBeLessThan(0.5);
    attend(sim, director, sim.devonPos);
    hearOut(sim, director);
    expect(sim.casefile.has('c-apron')).toBe(true);
  });

  it('lets a player work the burglary out from a doorstep, a parcel and a conversation', () => {
    const { sim, director } = throughTheStop();
    attend(sim, director, sim.placeById('p-panel')!.pos);
    hearOut(sim, director);
    attend(sim, director, sim.placeById('p-parcel')!.pos);
    hearOut(sim, director);
    expect(sim.casefile.has('c-autoreport')).toBe(true);
    expect(sim.casefile.has('c-parcel')).toBe(true);
    expect(sim.connectClues('c-parcel', 'c-autoreport').kind).toBe('new');
    // And telling Mrs. Carvalho where her parcel went changes what she says.
    attend(sim, director, sim.person('carvalho')!.pos);
    hearOut(sim, director, ['parcel']);
    expect(director.state.toldCarvalho).toBe(true);
    expect(sim.casefile.has('c-resident')).toBe(true);
  });

  it('ends the conversation when the player skates away from it', () => {
    const { sim, director, views } = throughTheStop();
    attend(sim, director, sim.person('brennan')!.pos);
    expect(sim.engagedWith).not.toBeNull();
    place(sim, { x: 60, y: 66 });
    step(sim, 0.1);
    expect(sim.engagedWith).toBeNull();
    expect(views[views.length - 1]).toBeNull();
  });

  it('takes a made case to Priya and gets a review, and comes back round to the advertisement', () => {
    const { sim, director, reprise } = throughTheStop();
    run(sim, director, 70);
    for (const c of ['c-vision', 'c-predict', 'c-drainage', 'c-cm207', 'c-parcel', 'c-autoreport']) sim.learnClue(c);
    sim.connectClues('c-vision', 'c-predict');
    sim.connectClues('c-drainage', 'c-cm207');
    sim.connectClues('c-parcel', 'c-autoreport');
    const priya = sim.person('priya')!;
    expect(priya.visible).toBe(true);
    attend(sim, director, priya.pos);
    hearOut(sim, director, ['show', 'review']);
    expect(director.state.report).toBe('priya');
    expect(director.state.ending).toBe('review');
    run(sim, director, 14);
    expect(reprise()).toBe('review');
  });

  it('reads a thin case, or one with a false eyewitness in it, as thin', () => {
    const { sim, director } = throughTheStop();
    run(sim, director, 70);
    for (const c of ['c-vision', 'c-predict', 'c-drainage', 'c-cm207', 'c-parcel', 'c-autoreport', 'c-brennan']) sim.learnClue(c);
    sim.connectClues('c-vision', 'c-predict');
    sim.connectClues('c-drainage', 'c-cm207');
    sim.connectClues('c-parcel', 'c-autoreport');
    attend(sim, director, sim.person('mara')!.pos);
    hearOut(sim, director, ['show', 'window']);
    expect(director.state.ending).toBe('rumour');
    run(sim, director, 6);
    expect(sim.placeById('p-window-case')!.visible).toBe(true);
  });

  it('only decides once', () => {
    const { sim, director } = throughTheStop();
    director.report('dropped');
    director.report('priya');
    expect(director.state.report).toBe('dropped');
    expect(director.state.ending).toBe('dropped');
    void sim;
  });

  it('offers no decision to somebody with nothing in their notes but the match', () => {
    const ctx: TalkContext = {
      matched: true, devonStopped: false, devonReleased: true, intervened: false,
      has: () => false, deductions: 0, openConnections: 0, strength: 0, onRecord: false, misled: false,
      report: null, times: 1, toldCarvalho: false,
    };
    for (const id of ['mara', 'priya']) {
      const ids = (openConversation(id, ctx).choices ?? []).map((c) => c.id);
      expect(ids).not.toContain('show');
    }
    // Devon can always be told you will let it go: dropping it needs nothing.
    expect((openConversation('devon', ctx).choices ?? []).map((c) => c.id)).toContain('drop');
    expect(chooseOption('devon', 'drop', ctx).effect.kind).toBe('none');
    expect(chooseOption('devon', 'drop-confirm', ctx).effect).toEqual({ kind: 'report', to: 'dropped' });
  });
});

describe('a town that has heard about Devon', () => {
  it('looks at him as it passes', () => {
    const sim = makeSim();
    sim.devonMarked = true;
    const n = sim.npcs[0];
    sim.devonPos = { x: n.pos.x + 3, y: n.pos.y };
    sim.devon.pos = { ...sim.devonPos };
    step(sim, 0.2);
    expect(n.glancing ?? 0).toBeGreaterThan(0);
    // Briefly, and then they get on with their afternoon.
    step(sim, 3);
    expect(n.glancing ?? 0).toBe(0);
  });
});

describe('an afternoon kept and come back to', () => {
  it('restores what happened as the state of the town, without replaying it', () => {
    const a = throughTheStop();
    run(a.sim, a.director, 70);
    a.sim.learnClue('c-parcel');
    const snap = JSON.parse(JSON.stringify(a.director.snapshot()));
    const notes = a.sim.casefile.snapshot();

    const sim = makeSim();
    const b = directorFor(sim);
    sim.casefile.restore(notes);
    b.director.restore(snap);
    const beats: string[] = [];
    sim.bus.on('story:beat', (e) => beats.push(e.id));
    run(sim, b.director, 5);
    // Nothing that already happened happens again.
    expect(beats).not.toContain('the-match');
    expect(beats).not.toContain('devon-stopped');
    expect(sim.incidents.length).toBe(0);
    // But the town is the town it was.
    expect(sim.visionUnlocked).toBe(true);
    expect(sim.devonVisible).toBe(true);
    expect(dist(sim.devonPos, DEVON_HOME)).toBeLessThan(0.5);
    expect(sim.placeById('p-tape')!.visible).toBe(true);
    expect(sim.person('priya')!.visible).toBe(true);
    expect(sim.casefile.has('c-parcel')).toBe(true);
  });
});

describe('what you overhear', () => {
  it('is the town talking about the part of the afternoon it is in', () => {
    const sim = makeSim();
    const { director } = directorFor(sim);
    const heard: string[] = [];
    sim.bus.on('story:overheard', (e) => heard.push(e.id));
    // Stand still next to somebody for a while.
    const n = sim.npcs[4];
    for (let i = 0; i < 60 * 40; i++) {
      place(sim, { x: n.pos.x + 2, y: n.pos.y });
      sim.step(TICK_DT, emptyIntent(), null);
      director.update();
    }
    expect(heard.length).toBeGreaterThan(0);
    const phases = new Set(heard.map((id) => id));
    for (const id of phases) expect(id.startsWith('b-')).toBe(true);
    // Before anything has happened, nobody is talking about Devon.
    expect(heard).not.toContain('b-photo');
    expect(heard).not.toContain('b-kid');
  });

  it('never says the same thing twice, and is quiet for a skater going flat out', () => {
    const sim = makeSim();
    const { director } = directorFor(sim);
    const heard: string[] = [];
    sim.bus.on('story:overheard', (e) => heard.push(e.id));
    const n = sim.npcs[4];
    for (let i = 0; i < 60 * 30; i++) {
      place(sim, { x: n.pos.x + 2, y: n.pos.y }, { x: 11, y: 0 });
      sim.step(TICK_DT, emptyIntent(), null);
      director.update();
    }
    expect(heard).toEqual([]);
  });
});

describe('the afternoon for a player who has not found Devon', () => {
  it('has him text them where he is, once', () => {
    const sim = makeSim();
    const { director, said } = directorFor(sim);
    run(sim, director, 30);
    expect(director.progress).toContain('devon-texts');
    expect(said.filter((l) => l.includes('where are you')).length).toBe(1);
  });
});
