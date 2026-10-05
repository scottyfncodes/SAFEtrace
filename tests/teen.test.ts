/**
 * The rider and Devon are fourteen (docs/48). On a figure this size age is
 * read from proportion first and clothes second, so both are pinned: shorter
 * than any adult in town and taller than any child, a head large for the
 * body, shoulders that have not filled out, and a skater's baggy fit.
 */
import { describe, expect, it } from 'vitest';
import { ADULT, DEVON, RIDER, TEEN, castLook, officerLook, residentLook } from '../src/render/characters';

const height = (b: { scale: number }) => b.scale;
const headRatio = (b: { scale: number; headR: number }) => b.headR / b.scale;

describe('the two fourteen-year-olds', () => {
  const adults = [
    ...['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'].map((id) => residentLook(id, 'adult', '#5E7A8C')),
    ...['mara', 'priya', 'courier', 'carvalho', 'brennan'].map((id) => castLook(id, '#5E7A8C')).filter((l) => l !== null),
    officerLook('o1'),
  ];
  const child = residentLook('c1', 'child', '#5E7A8C');

  it('stand between the children and every adult', () => {
    for (const teen of [RIDER, DEVON]) {
      expect(height(teen.body)).toBeGreaterThan(height(child.body));
      for (const a of adults) expect(height(teen.body)).toBeLessThan(height(a!.body));
    }
  });

  it('have heads large for their bodies and shoulders narrower than a grown-up\'s', () => {
    for (const teen of [RIDER, DEVON]) {
      expect(headRatio(teen.body)).toBeGreaterThan(headRatio(ADULT) * 1.15);
      expect(teen.body.shoulder).toBeLessThan(ADULT.shoulder);
      expect(teen.body.limb).toBeLessThan(ADULT.limb);
    }
  });

  it('dress like skaters: baggy, with hair escaping the hat', () => {
    for (const teen of [RIDER, DEVON]) {
      expect(teen.fit).toBe('baggy');
      expect(teen.fringe).toBe(true);
    }
    expect(RIDER.body).toBe(TEEN);
    expect(RIDER.garment).toBe('hoodie');
    // The beanie is dark and the hair is not, so the fringe can be seen.
    expect(RIDER.hair).not.toBe(RIDER.hatColour);
  });
});
