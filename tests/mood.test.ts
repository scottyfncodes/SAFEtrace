import { describe, expect, it } from 'vitest';
import { NEUTRAL, START, moodFrom, moodOf, readMood } from '../src/render/mood';
import { buildBellhaven } from '../src/content/bellhaven';
import { Sim } from '../src/sim/sim';

/*
 * The town's mood (docs/41): the more the system has control, the darker;
 * every bit of sabotage and uncovering brightens it. These hold the shape of
 * that number — which way each input pushes it, that it is bounded, that it
 * is read from the simulation without touching it.
 */
describe('the mood of the town', () => {
  it("begins partially owned: the town is the system's before the player does anything", () => {
    const m = moodFrom(NEUTRAL);
    expect(m.grip).toBe(0);
    expect(m.cut).toBe(0);
    expect(m.control).toBe(START);
    // Slightly owned, not dark: there is somewhere for pressure to go.
    expect(START).toBeGreaterThan(0.2);
    expect(START).toBeLessThan(0.45);
  });

  it('gives the first sabotage an immediate, outsized relief', () => {
    // pressure -> identify -> sabotage -> relief -> deeper infiltration.
    const pressure = moodFrom({ ...NEUTRAL, risk: 35, level: 'MONITORING', scrutiny: 0.3 });
    const identified = moodFrom({ ...NEUTRAL, risk: 35, level: 'MONITORING', scrutiny: 0.3, sensorsKnown: 6, clues: 1 });
    const sabotage = moodFrom({ ...NEUTRAL, risk: 35, level: 'MONITORING', scrutiny: 0.3, sensorsKnown: 6, clues: 1, nodesCut: 1 });
    const deeper = moodFrom({ ...NEUTRAL, risk: 35, level: 'MONITORING', scrutiny: 0.3, sensorsKnown: 6, clues: 1, nodesCut: 3 });
    expect(pressure.control).toBeGreaterThan(START);
    expect(identified.control).toBeLessThan(pressure.control);
    // The first node is the biggest single step the player can take...
    const first = identified.control - sabotage.control;
    expect(first).toBeGreaterThan(0.18);
    expect(first).toBeGreaterThan(identified.control - moodFrom({ ...NEUTRAL, risk: 35, level: 'MONITORING', scrutiny: 0.3, sensorsKnown: 12, clues: 3 }).control);
    // ...and from a fresh afternoon it alone takes the town most of the way back to ordinary.
    expect(moodFrom({ ...NEUTRAL, nodesCut: 1 }).control).toBeLessThan(START * 0.4);
    // Going deeper keeps peeling ownership away, with each node worth less than the first.
    expect(deeper.control).toBeLessThan(sabotage.control);
    expect(sabotage.control - deeper.control).toBeLessThan(first * 2);
  });

  it('darkens as the system takes hold', () => {
    // Kept below the cap: the town starts partly owned, so there is less room.
    const risk = moodFrom({ ...NEUTRAL, risk: 30 }).control;
    const ladder = moodFrom({ ...NEUTRAL, risk: 30, level: 'PATROL_DISPATCH' }).control;
    const looked = moodFrom({ ...NEUTRAL, risk: 30, level: 'PATROL_DISPATCH', scrutiny: 0.5 }).control;
    const seen = moodFrom({ ...NEUTRAL, risk: 30, level: 'PATROL_DISPATCH', scrutiny: 0.5, observed: true, unitsActing: 1 }).control;
    expect(seen).toBeLessThan(1);
    expect(risk).toBeGreaterThan(START);
    expect(ladder).toBeGreaterThan(risk);
    expect(looked).toBeGreaterThan(ladder);
    expect(seen).toBeGreaterThan(looked);
  });

  it('brightens with every bit of sabotage and uncovering', () => {
    const base = { ...NEUTRAL, risk: 40, level: 'MONITORING' as const };
    const start = moodFrom(base).control;
    const oneNode = moodFrom({ ...base, nodesCut: 1 }).control;
    const twoNodes = moodFrom({ ...base, nodesCut: 2 }).control;
    const noticed = moodFrom({ ...base, nodesCut: 2, sensorsKnown: 10 }).control;
    const written = moodFrom({ ...base, nodesCut: 2, sensorsKnown: 10, clues: 4 }).control;
    const vision = moodFrom({ ...base, nodesCut: 2, sensorsKnown: 10, clues: 4, vision: true }).control;
    expect(oneNode).toBeLessThan(start);
    expect(twoNodes).toBeLessThan(oneNode);
    expect(noticed).toBeLessThan(twoNodes);
    expect(written).toBeLessThan(noticed);
    expect(vision).toBeLessThan(written);
  });

  it('lets a cut town go properly light, and an owned one properly dark', () => {
    const lit = moodFrom({ ...NEUTRAL, nodesCut: 8, sensorsKnown: 36, clues: 12, vision: true });
    const owned = moodFrom({ ...NEUTRAL, risk: 95, level: 'INTERVENTION', scrutiny: 1, observed: true, unitsActing: 3 });
    expect(lit.control).toBeLessThan(-0.7);
    expect(owned.control).toBeGreaterThan(0.7);
    expect(lit.control).toBeGreaterThanOrEqual(-1);
    expect(owned.control).toBeLessThanOrEqual(1);
  });

  it('is louder for sabotage than for the same risk', () => {
    // Half the nodes looped outweighs a middling risk score: the town has
    // visibly been taken from the system, and looks less owned than it did
    // at the start of the afternoon even while the player is wanted.
    const m = moodFrom({ ...NEUTRAL, risk: 45, level: 'DRONE_DISPATCH', nodesCut: 5 });
    expect(m.control).toBeLessThan(START);
  });

  it('reads a fresh afternoon as partly owned, and reads without writing', () => {
    const sim = new Sim(buildBellhaven());
    const before = JSON.stringify(readMood(sim));
    const m = moodOf(sim);
    expect(Math.abs(m.control - START)).toBeLessThan(0.12);
    expect(JSON.stringify(readMood(sim))).toBe(before);
    expect(sim.tick).toBe(0);
  });
});
