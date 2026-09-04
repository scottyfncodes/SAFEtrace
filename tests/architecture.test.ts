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
