import { describe, expect, it } from 'vitest';
import { NEUTRAL, moodFrom, moodOf, readMood } from '../src/render/mood';
import { buildBellhaven } from '../src/content/bellhaven';
import { Sim } from '../src/sim/sim';

/*
 * The town's mood (docs/41): the more the system has control, the darker;
 * every bit of sabotage and uncovering brightens it. These hold the shape of
 * that number — which way each input pushes it, that it is bounded, that it
 * is read from the simulation without touching it.
 */
describe('the mood of the town', () => {
  it('is ordinary when nothing has happened', () => {
    const m = moodFrom(NEUTRAL);
    expect(m.grip).toBe(0);
    expect(m.cut).toBe(0);
    expect(m.control).toBe(0);
  });

  it('darkens as the system takes hold', () => {
    const risk = moodFrom({ ...NEUTRAL, risk: 60 }).control;
    const ladder = moodFrom({ ...NEUTRAL, risk: 60, level: 'PATROL_DISPATCH' }).control;
    const looked = moodFrom({ ...NEUTRAL, risk: 60, level: 'PATROL_DISPATCH', scrutiny: 0.8 }).control;
    const seen = moodFrom({ ...NEUTRAL, risk: 60, level: 'PATROL_DISPATCH', scrutiny: 0.8, observed: true, unitsActing: 2 }).control;
    expect(risk).toBeGreaterThan(0);
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
    // visibly been taken from the system, and it should look it.
    const m = moodFrom({ ...NEUTRAL, risk: 45, level: 'DRONE_DISPATCH', nodesCut: 5 });
    expect(m.control).toBeLessThan(0);
  });

  it('reads a fresh afternoon as ordinary, and reads without writing', () => {
    const sim = new Sim(buildBellhaven());
    const before = JSON.stringify(readMood(sim));
    const m = moodOf(sim);
    expect(Math.abs(m.control)).toBeLessThan(0.15);
    expect(JSON.stringify(readMood(sim))).toBe(before);
    expect(sim.tick).toBe(0);
  });
});
