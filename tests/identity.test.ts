import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The observation system (docs/46): the interface is one instrument, and
 * these are the cheapest statements of what makes it one. Panels are
 * squared, every glyph comes from the one icon set, the frame says only
 * what the simulation says, and nothing on it runs forever.
 */
const read = (f: string) => readFileSync(f, 'utf8');
const css = read('src/ui/styles.css') + '\n' + read('src/ui/jobs.css') + '\n' + read('src/ui/mobile.css');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
const uiFiles = readdirSync('src/ui').filter((f) => f.endsWith('.ts')).map((f) => `src/ui/${f}`);

describe('the observation system', () => {
  it('rounds nothing further than a hairline', () => {
    // Dots and the switch knob may be round; a panel or a button may not.
    for (const m of code.matchAll(/border-radius:\s*([^;]+);/g)) {
      const v = m[1].trim();
      if (v === '50%') continue;
      expect({ v, ok: /^var\(--r-(xs|sm|md|lg|pill)\)$|^0$/.test(v) }).toEqual({ v, ok: true });
    }
    for (const r of ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-pill']) {
      const px = Number(code.match(new RegExp(`${r}:\\s*(\\d+)px`))?.[1]);
      expect({ r, px: px <= 2 }).toEqual({ r, px: true });
    }
  });

  it('draws every glyph from the one icon set', () => {
    for (const f of uiFiles) {
      const src = read(f).replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
      // Emoji-style and dingbat glyphs are what the set replaces.
      expect({ f, glyphs: /[✎✓✔✕▸►■●]/.test(src) }).toEqual({ f, glyphs: false });
    }
    expect(read('src/ui/icons.ts')).toMatch(/stroke-width="1\.5"/);
  });

  it('keeps the frame honest: REC, the camera and the state come from the simulation', () => {
    const frame = read('src/ui/frame.ts');
    expect(frame).toMatch(/sim\.playerSightings\(\)/);
    expect(frame).toMatch(/sim\.pursuit/);
    expect(frame).toMatch(/sim\.tick/);
    // And its words live with the rest of the system's voice.
    expect(read('src/content/copy.ts')).toMatch(/export const FRAME/);
  });

  it('paints the scanlines only while something has you, and loops only the REC light', () => {
    expect(code).toMatch(/#frame\[data-watch="unseen"\]::before[^{]*\{[^}]*visibility:\s*hidden/);
    const loops = [...code.matchAll(/^[^\n{]*#frame[^\n{]*\{[^}]*infinite[^}]*\}/gm)].map((m) => m[0]);
    expect(loops.every((l) => l.includes('.f-rec.on'))).toBe(true);
  });

  it('never writes the frame when nothing changed', () => {
    const frame = read('src/ui/frame.ts');
    for (const field of ['lastRec', 'lastCam', 'lastClock', 'lastBars', 'lastState']) expect(frame).toContain(field);
  });
});
