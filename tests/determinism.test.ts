import { describe, expect, it } from 'vitest';
import { emptyIntent } from '../src/core/input';
import { TICK_DT } from '../src/core/loop';
import { Rng } from '../src/core/rng';
import { hashState, makeSim } from './harness';

/**
 * Determinism is not a feature for players. It is a tool: it makes surveillance
 * bugs reproducible, which matters enormously for a system this emergent.
 */
describe('determinism', () => {
  it('produces identical state from identical seeds and identical input', () => {
    const run = () => {
      const sim = makeSim(1234);
      const scripted = new Rng(99);
      const hashes: string[] = [];
      for (let i = 0; i < 3600; i++) {
        const intent = emptyIntent();
        intent.steer = scripted.range(-1, 1);
        intent.push = scripted.chance(0.5);
        intent.pushPressed = i % 25 === 0;
        intent.olliePressed = i % 180 === 0;
        intent.ollieReleased = i % 180 === 8;
        sim.step(TICK_DT, intent, null);
        if (i % 600 === 0) hashes.push(hashState(sim));
      }
      hashes.push(hashState(sim));
      return hashes;
    };
    expect(run()).toEqual(run());
  });

  it('diverges with a different seed, proving the seed is actually used', () => {
    const run = (seed: number) => {
      const sim = makeSim(seed);
      for (let i = 0; i < 600; i++) sim.step(TICK_DT, emptyIntent(), null);
      return hashState(sim);
    };
    expect(run(1)).not.toEqual(run(2));
  });

  it('gives the seeded RNG a stable sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 200; i++) expect(a.next()).toBe(b.next());
  });
});
