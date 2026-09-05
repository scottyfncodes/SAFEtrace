import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * These are cheap, and they protect the property that makes everything else
 * testable: the simulation is pure, so it can be stepped headlessly.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const simFiles = walk('src/sim');
const read = (f: string) => readFileSync(f, 'utf8');

describe('architecture', () => {
  it('has simulation files to check', () => {
    expect(simFiles.length).toBeGreaterThan(10);
  });

  it('keeps the simulation free of presentation imports', () => {
    const offenders: string[] = [];
    for (const f of simFiles) {
      const src = read(f);
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1];
        if (/(^|\/)(render|ui|audio)\//.test(spec) || /\.css$/.test(spec)) {
          offenders.push(`${f} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the simulation free of the DOM', () => {
    const offenders: string[] = [];
    for (const f of simFiles) {
      const src = read(f);
      // Comments and strings are not code; strip line comments before scanning.
      const code = src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
      if (/\b(document|window|localStorage|requestAnimationFrame)\b/.test(code)) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('bans Math.random and Date.now in the simulation, so runs are reproducible', () => {
    const offenders: string[] = [];
    for (const f of simFiles) {
      const code = read(f).replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
      if (/Math\.random|Date\.now|performance\.now/.test(code)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  /*
   * The eye button was removed once and came back, because "removed" meant a
   * conditional that stopped firing rather than code that stopped existing.
   * These are the cheapest possible statement that it is gone: there is no
   * button id, no touch role, no control-visual field and no glyph branch for
   * it anywhere in the input or presentation layers, so there is nothing left
   * for a component or state regression to switch back on.
   */
  it('has no eye button anywhere in the input or HUD layers', () => {
    const offenders: string[] = [];
    for (const f of [...walk('src/core'), ...walk('src/render'), ...walk('src/ui')]) {
      const code = read(f).replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
      // A control called vision: an id in a list, a role, a case, a field.
      for (const pat of [/'vision'/, /\bid === 'vision'/, /setVisionAvailable/, /visionHeld/]) {
        if (pat.test(code)) offenders.push(`${f}: ${pat}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives the pursuit exactly one way to start', () => {
    /*
     * `wantedUntil` is the file being open, and an open file is what sends
     * somebody. It used to be written from wherever an offence happened, so a
     * pursuit could begin without anything knowing it had begun. Every writer
     * now goes through Sim.reportOffence, which is also what tells the state
     * machine where the pursuit starts from.
     */
    const writers: string[] = [];
    for (const f of simFiles) {
      const code = read(f).replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
      for (const m of code.matchAll(/(\w+)\.wantedUntil\s*=/g)) writers.push(`${f}: ${m[0]}`);
    }
    // One in Sim.reportOffence, one in the pursuit machine's CLEAR state.
    expect(writers).toEqual([
      'src/sim/sim.ts: track.wantedUntil =',
      'src/sim/surveillance/pursuit.ts: track.wantedUntil =',
    ]);
  });

  it('keeps every player-visible SAFEtrace string in one file', () => {
    // Tone control: this voice must be edited as a single document or it drifts.
    const offenders: string[] = [];
    for (const f of [...simFiles, ...walk('src/render')]) {
      if (f.includes('content/copy')) continue;
      const code = read(f).replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
      // Long ALL-CAPS sentences are SAFEtrace speech and belong in copy.ts.
      for (const m of code.matchAll(/'([A-Z][A-Z ]{18,})'/g)) {
        offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
