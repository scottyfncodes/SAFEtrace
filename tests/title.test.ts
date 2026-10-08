import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TITLE } from '../src/content/copy';

/*
 * The opening used to be an accessibility dialog in front of the game on
 * every launch. The title is now the town itself, with one verb on it; the
 * options are one labelled control. These hold the shape of that, and the
 * one thing the old dialog existed for: the settings are in force before the
 * advertisement they protect can start.
 */
const main = readFileSync('src/main.ts', 'utf8');
const title = main.slice(main.indexOf('private showTitle('), main.indexOf('private applyLook('));

describe('the title', () => {
  it('opens on the title, not on a preferences card', () => {
    expect(main).toContain('this.showTitle();');
    expect(main).not.toMatch(/showPrefs|Before you begin/);
  });

  it('has one primary verb, and it is the game\'s own', () => {
    expect(TITLE.ride).toBe('Ride');
    expect(title.match(/class="t-ride"/g)?.length).toBe(1);
    // Ride is jobs; the story and a saved afternoon are still reachable.
    expect(title).toMatch(/#title-ride'\)\.addEventListener\('click', \(\) => go\('jobs'\)\)/);
    expect(title).toContain('#title-story');
    expect(title).toContain('#title-continue');
  });

  it('is the real town: the renderer draws it, with the watch layer on', () => {
    expect(title).toContain('this.renderer.titleWatch =');
    expect(title).toContain('this.loop.start()');
  });

  it('keeps the accessibility options one labelled control away', () => {
    expect(title).toContain('id="title-access"');
    expect(TITLE.access).toBe('Accessibility');
    expect(title).toContain('${TITLE.access}');
    for (const id of ['pref-motion', 'pref-colour', 'pref-text']) expect(title).toContain(`id="${id}"`);
  });

  it('honours a system set to reduce motion, and saves before anything plays', () => {
    expect(title).toContain("'(prefers-reduced-motion: reduce)'");
    const go = title.slice(title.indexOf('const go ='));
    expect(go.indexOf('saveSettings(this.settings)')).toBeGreaterThan(-1);
    expect(go.indexOf('saveSettings(this.settings)')).toBeLessThan(go.indexOf('this.startAd()'));
  });
});
