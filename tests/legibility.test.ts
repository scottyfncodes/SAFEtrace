import { describe, expect, it } from 'vitest';
import { VENEER } from '../src/render/palette';

/**
 * Two figures being confusable at a glance is not a one-time bug, it is a
 * class of bug — this codebase has now shipped it twice, in opposite
 * directions. Pass 30 found that residents and the officer were the same grey
 * on the same silhouette. This pass found that Devon and the officer were both
 * blue: a playtester's first reaction to a screenshot of their own best friend
 * was "I thought that was the cop". Hue is what the eye reads first, before it
 * gets as far as comparing shade or saturation, so hue is what this asserts.
 */
function hue(hex: string): number {
  const s = hex.replace('#', '');
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0; // grey has no hue to collide with
  let h: number;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  return ((h * 60) + 360) % 360;
}

function hueDistance(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b)) % 360;
  return Math.min(d, 360 - d);
}

describe('the people on screen stay tellable apart', () => {
  it('never lets Devon drift back toward the uniform he was mistaken for', () => {
    const d = hueDistance(VENEER.friend, VENEER.uniform);
    // Something like ninety degrees of hue separation is what "obviously a
    // different colour, not a shade of the same one" takes on this wheel.
    expect(d).toBeGreaterThan(60);
  });

  it('keeps Devon out of the officer\'s whole alert vocabulary', () => {
    // The shoulder light goes amber, then red, as a unit closes on the
    // player. Devon sharing either hue would read as him signalling the same
    // thing.
    expect(hueDistance(VENEER.friend, VENEER.responding)).toBeGreaterThan(40);
    expect(hueDistance(VENEER.friend, VENEER.intervening)).toBeGreaterThan(40);
  });
});
