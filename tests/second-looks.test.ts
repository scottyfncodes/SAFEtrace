import { describe, expect, it } from 'vitest';
import { makeSim, place } from './harness';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import type { Sim } from '../src/sim/sim';
import {
  CLUES, DEDUCTIONS, PLACES, RECORD_CLUES, SECOND_LOOKS, caseStrength, readingFor, resolveEnding,
  type ReportTarget,
} from '../src/content/case';
import { PEOPLE_NAMES, openConversation, type TalkContext } from '../src/content/talk';
import { StoryDirector, initialStoryState, type TalkView } from '../src/content/story';
import { buildBellhaven } from '../src/content/bellhaven';

function directorFor(sim: Sim) {
  const views: Array<TalkView | null> = [];
  const director = new StoryDirector({
    sim,
    hud: { say: () => {}, showTalk: (v: TalkView | null) => views.push(v) } as never,
    audio: { motif: () => {}, peelIn: () => {} } as never,
    renderer: { kick: () => {} } as never,
    playReprise: () => {},
    hint: { vision: 'HOLD Q', inspect: 'PRESS E' },
  });
  director.begin();
  return { director, views };
}

function press(sim: Sim, director: StoryDirector): void {
  const it = emptyIntent();
  it.interactPressed = true;
  sim.step(TICK_DT, it, null);
  director.update();
}

/** Skate up to a place, look at it, read it to the end, and step away: what the player saw. */
function lookAt(sim: Sim, director: StoryDirector, id: string): string {
  const at = sim.placeById(id)!.pos;
  place(sim, { x: at.x + 1.2, y: at.y + 0.6 });
  sim.step(TICK_DT, emptyIntent(), null);
  press(sim, director);
  const text = director.talking?.text ?? '';
  for (let guard = 0; guard < 10 && sim.engagedWith; guard++) press(sim, director);
  return text;
}

const NEW_CLUES = ['c-gallery', 'c-flyer', 'c-ledge'];
const NEW_DEDUCTIONS = ['d-any-of-us', 'd-before'];

describe('second looks, as authored', () => {
  it('stays a handful: a few readings, each of a place that exists in the town', () => {
    expect(SECOND_LOOKS.length).toBeGreaterThan(0);
    expect(SECOND_LOOKS.length).toBeLessThanOrEqual(8);
    const world = buildBellhaven();
    const ids = new Set<string>();
    for (const sl of SECOND_LOOKS) {
      expect(ids.has(sl.id), sl.id).toBe(false);
      ids.add(sl.id);
      expect(PLACES[sl.place], sl.id).toBeDefined();
      expect(world.places.some((p) => p.id === sl.place), sl.id).toBe(true);
      // The thing it waits on is a real entry in the notes.
      const known = CLUES.some((c) => c.id === sl.needs) || DEDUCTIONS.some((d) => d.id === sl.needs);
      expect(known, `${sl.id} waits on ${sl.needs}`).toBe(true);
      if (sl.clue) expect(CLUES.some((c) => c.id === sl.clue), sl.id).toBe(true);
      // And it actually reads differently.
      expect(sl.text.length).toBeGreaterThan(40);
      expect(sl.text).not.toBe(PLACES[sl.place].text);
      // A reading cannot wait on the clue it gives.
      expect(sl.needs).not.toBe(sl.clue);
    }
  });

  it('gives each new clue from one second look and nowhere else', () => {
    const fromPlaces = Object.values(PLACES).map((p) => p.clue).filter(Boolean);
    const fromRecords = Object.values(RECORD_CLUES);
    const fromPeople = new Set<string>();
    for (const id of Object.keys(PEOPLE_NAMES)) {
      for (const matched of [false, true]) for (const released of [false, true]) for (const times of [0, 1, 2]) {
        const ctx: TalkContext = {
          matched, devonStopped: false, devonReleased: released, intervened: false,
          has: () => true, deductions: 5, openConnections: 0, strength: 4, onRecord: false, misled: false,
          report: null, times, toldCarvalho: true,
        };
        for (const l of openConversation(id, ctx).learn ?? []) fromPeople.add(l);
      }
    }
    for (const id of NEW_CLUES) {
      expect(SECOND_LOOKS.filter((sl) => sl.clue === id).length, id).toBe(1);
      expect(fromPlaces.includes(id) || fromRecords.includes(id) || fromPeople.has(id), id).toBe(false);
    }
    // Nothing already in the case is handed out a second time.
    for (const sl of SECOND_LOOKS) if (sl.clue) expect(NEW_CLUES).toContain(sl.clue);
  });

  it('adds connections that are never one of the four the ending is read from', () => {
    for (const id of NEW_DEDUCTIONS) {
      const d = DEDUCTIONS.find((x) => x.id === id)!;
      expect(d, id).toBeDefined();
      expect(d.key ?? false, id).toBe(false);
      expect(d.disproves, id).toBeUndefined();
    }
    expect(DEDUCTIONS.filter((d) => d.key).map((d) => d.id).sort())
      .toEqual(['d-alibi', 'd-hood', 'd-no-burglary', 'd-posterior']);
  });

  it('leaves the ending table exactly as it was', () => {
    const table: Record<ReportTarget, string[]> = {
      priya: ['noted', 'noted', 'noted', 'review', 'review'],
      mara: ['rumour', 'rumour', 'rumour', 'window', 'window'],
      dropped: ['dropped', 'dropped', 'dropped', 'dropped', 'dropped'],
    };
    for (const to of Object.keys(table) as ReportTarget[]) {
      for (let k = 0; k <= 4; k++) {
        expect(resolveEnding(to, { keyFindings: k, onRecord: false, misled: false }), `${to} ${k}`).toBe(table[to][k]);
      }
      expect(resolveEnding(to, { keyFindings: 4, onRecord: true, misled: true })).toBe(table[to][2]);
    }
    expect(caseStrength({ keyFindings: 4, onRecord: true, misled: false })).toBe(3);
  });
});

describe('a place, seen again', () => {
  it('reads plainly until the notes hold what it waits on, then reads as the newest thing it knows', () => {
    const none = () => false;
    for (const sl of SECOND_LOOKS) {
      expect(readingFor(sl.place, none).text).toBe(PLACES[sl.place].text);
      expect(readingFor(sl.place, none).look).toBeUndefined();
      const r = readingFor(sl.place, (id) => id === sl.needs);
      expect(r.look).toBe(sl.id);
      expect(r.text).toBe(sl.text);
    }
  });

  it('earns a pencil tick only at a place already looked at, and loses it once looked at again', () => {
    const sim = makeSim();
    const { director } = directorFor(sim);
    // Before: the gate sign is a gate sign.
    const first = lookAt(sim, director, 'p-enrol');
    expect(first).toMatch(/Opt-out forms/);
    expect(director.freshPlaces()).toEqual([]);

    // Something learned at the far side of town.
    sim.learnClue('c-vision');
    expect(director.freshPlaces()).toEqual(['p-enrol']);
    // Places never stood at do not tick, however much the player knows.
    expect(director.freshPlaces()).not.toContain('p-ledge');

    // Back at the gate, it says something else, and the notes take it down.
    const second = lookAt(sim, director, 'p-enrol');
    expect(second).toMatch(/812/);
    expect(second).toMatch(/Kofi/);
    expect(sim.casefile.has('c-gallery')).toBe(true);
    expect(director.freshPlaces()).toEqual([]);
    // And it keeps saying it: the second look is now how the place reads.
    expect(lookAt(sim, director, 'p-enrol')).toBe(second);
    expect(sim.casefile.clues.size).toBe(2);
  });

  it('shows somebody who already knows the reading on their first look, with no tick at all', () => {
    const sim = makeSim();
    const { director } = directorFor(sim);
    sim.learnClue('c-gallery');
    const text = lookAt(sim, director, 'p-ledge');
    expect(text).toMatch(/KOFI M/);
    expect(sim.casefile.has('c-ledge')).toBe(true);
    expect(director.freshPlaces()).toEqual([]);
  });

  it('follows Kofi from the gate to the noticeboard to the Channel, and the notes make something of it', () => {
    const sim = makeSim();
    const { director } = directorFor(sim);
    sim.learnClue('c-vision');
    sim.learnClue('c-predict');
    sim.learnClue('c-alert');
    lookAt(sim, director, 'p-enrol');
    lookAt(sim, director, 'p-noticeboard');
    lookAt(sim, director, 'p-ledge');
    for (const id of NEW_CLUES) expect(sim.casefile.has(id), id).toBe(true);

    const before = director.standing();
    const any = sim.connectClues('c-gallery', 'c-predict');
    expect(any.kind).toBe('new');
    if (any.kind === 'new') expect(any.deduction.title).toBe('It could have been any of us');
    expect(sim.connectClues('c-ledge', 'c-flyer').kind).toBe('new');
    // Worked out, written down, and worth nothing to the ending.
    expect(director.standing()).toEqual(before);
    expect(sim.casefile.keyFindings).toBe(0);
  });

  it('ticks the doorbell on Maple Court once the burglary is understood, and nothing else changes', () => {
    const sim = makeSim();
    const { director } = directorFor(sim);
    expect(lookAt(sim, director, 'p-doorbell')).toMatch(/This home is protected/);
    sim.learnClue('c-resident');
    sim.learnClue('c-autoreport');
    expect(director.freshPlaces()).toEqual([]);
    expect(sim.connectClues('c-resident', 'c-autoreport').kind).toBe('new');
    expect(director.freshPlaces()).toEqual(['p-doorbell']);
    const text = lookAt(sim, director, 'p-doorbell');
    expect(text).toMatch(/So was No\. 14/);
    expect(director.freshPlaces()).toEqual([]);
  });
});

describe('second looks, kept and come back to', () => {
  it('starts a fresh afternoon with none seen', () => {
    expect(initialStoryState().secondLooks).toEqual([]);
  });

  it('keeps which readings were seen across a save', () => {
    const a = makeSim();
    const da = directorFor(a);
    a.learnClue('c-vision');
    lookAt(a, da.director, 'p-enrol');
    lookAt(a, da.director, 'p-graffiti');
    const snap = JSON.parse(JSON.stringify(da.director.snapshot()));
    const notes = a.casefile.snapshot();

    const b = makeSim();
    const db = directorFor(b);
    b.casefile.restore(notes);
    db.director.restore(snap);
    expect(db.director.state.secondLooks).toEqual(['sl-enrol']);
    expect(db.director.state.looked).toEqual(['p-enrol', 'p-graffiti']);
    expect(db.director.freshPlaces()).toEqual([]);
    // Something learned after coming back still ticks a place seen before leaving.
    b.learnClue('c-drainage');
    b.learnClue('c-cm207');
    expect(b.connectClues('c-drainage', 'c-cm207').kind).toBe('new');
    expect(db.director.freshPlaces()).toEqual(['p-graffiti']);
  });

  it('restores a save made before second looks existed', () => {
    const a = makeSim();
    const da = directorFor(a);
    lookAt(a, da.director, 'p-enrol');
    lookAt(a, da.director, 'p-dropin');
    const snap = JSON.parse(JSON.stringify(da.director.snapshot()));
    delete snap.state.secondLooks;
    const notes = a.casefile.snapshot();

    const b = makeSim();
    const db = directorFor(b);
    b.casefile.restore(notes);
    expect(() => db.director.restore(snap)).not.toThrow();
    expect(db.director.state.secondLooks).toEqual([]);
    expect(db.director.state.looked).toEqual(['p-enrol', 'p-dropin']);
    // The places that player had already stood at can still earn a tick.
    b.learnClue('c-review');
    expect(db.director.freshPlaces()).toEqual(['p-dropin']);
    expect(lookAt(b, db.director, 'p-dropin')).toMatch(/P\. Venn/);
    expect(db.director.freshPlaces()).toEqual([]);
  });
});
