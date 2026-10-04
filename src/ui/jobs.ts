/**
 * The jobs layer's screens: the board, the brief, the run's HUD, and the
 * result.
 *
 * Styled as the city's own navigation and surveillance terminal rather than a
 * game menu: monospace, ink panels, one cyan rule, the player's own colour for
 * the things that are theirs. The board and the result stop the world; the
 * run's HUD never asks for a thing and keeps quiet until it matters — while
 * nothing is looking, it is three short lines at the top of the glass.
 */
import { JOBS, jobUnlocked } from '../content/jobs';
import { JOB } from '../content/copy';
import type { JobDef } from '../sim/jobs/types';
import type { JobRun, Callout } from '../sim/jobs/run';
import type { JobRecord } from '../core/save';
import type { RunResult } from '../sim/jobs/score';
import { exposureShare } from '../sim/jobs/exposure';
import { wrapAngle } from '../core/math';
import { PERKS, repFor, type PerkDef } from '../sim/jobs/kit';

/** Rep from whatever the records hold. */
export const repOf = (recs: Record<string, JobRecord>): number => repFor(Object.values(recs).map((r) => r.grade));

export const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60), c = Math.floor((s * 10) % 10);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}.${c}`;
};
const fmtClock = (s: number): string => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const num = (n: number): string => Math.round(n).toLocaleString('en-GB');
const pad2 = (n: number): string => String(n).padStart(2, '0');

const KIND_NOTE: Record<JobDef['kind'], string> = {
  COURIER: 'Get it there.',
  TAG: 'Get up there and mark it.',
  EXTRACTION: 'Get in, take it, get out.',
  PHOTOGRAPH: 'Get the angle.',
  SABOTAGE: 'Put them out.',
  GHOST: 'Unseen, or it did not happen.',
  SPEEDRUN: 'Against the clock.',
  GETAWAY: 'Start hot. Get clear.',
};

/** Where the run is headed: every point named, in order. */
const destinationOf = (j: JobDef): string =>
  j.stages.map((s) => (s.points.length ? s.points.map((p) => p.label).join(' + ') : s.verb)).join(' → ');

// ---------------------------------------------------------------------- board

export interface BoardActions {
  start(def: JobDef): void;
  story(): void;
  close(): void;
}

export class JobBoard {
  private el: HTMLElement;
  open = false;
  private picked: JobDef | null = null;
  private focusIndex = 0;

  constructor(host: HTMLElement, private touch: boolean, private actions: BoardActions,
    private records: () => Record<string, JobRecord>, private canClose: () => boolean) {
    this.el = document.createElement('div');
    this.el.id = 'jobs-board';
    this.el.className = 'hidden';
    host.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'pick') { const j = JOBS.find((x) => x.id === t.dataset.id); if (j) this.brief(j); }
      else if (act === 'go' && this.picked) this.go(this.picked);
      else if (act === 'back') { this.picked = null; this.render(); }
      else if (act === 'story') this.actions.story();
      else if (act === 'close') this.hide(true);
    });
  }

  private get finished(): number { return Object.keys(this.records()).length; }

  show(pick: JobDef | null = null): void {
    this.open = true;
    this.picked = pick;
    this.render();
    this.el.classList.remove('hidden');
  }

  hide(resume = false): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    if (resume) this.actions.close();
  }

  private brief(j: JobDef): void {
    if (!jobUnlocked(j, this.finished)) return;
    this.picked = j;
    this.render();
  }

  private go(j: JobDef): void {
    this.hide();
    this.actions.start(j);
  }

  /** Keys while the board is up. Returns true if the key was the board's. */
  key(code: string): boolean {
    if (!this.open) return false;
    const open = JOBS.filter((j) => jobUnlocked(j, this.finished));
    if (this.picked) {
      if (code === 'Enter' || code === 'Space') this.go(this.picked);
      else if (code === 'Escape' || code === 'Backspace') { this.picked = null; this.render(); }
      return true;
    }
    if (code === 'ArrowDown' || code === 'KeyS') { this.focusIndex = Math.min(open.length - 1, this.focusIndex + 1); this.render(); }
    else if (code === 'ArrowUp' || code === 'KeyW') { this.focusIndex = Math.max(0, this.focusIndex - 1); this.render(); }
    else if (code === 'Enter' || code === 'Space') { const j = open[this.focusIndex]; if (j) this.brief(j); }
    else if (code === 'Escape' && this.canClose()) this.hide(true);
    else if (code.startsWith('Digit')) {
      const j = JOBS.find((x) => x.number === Number(code.slice(5)));
      if (j) this.brief(j);
    }
    return true;
  }

  private render(): void {
    const recs = this.records();
    const fin = this.finished;
    if (this.picked) { this.el.innerHTML = this.briefHtml(this.picked, recs[this.picked.id]); return; }
    const open = JOBS.filter((j) => jobUnlocked(j, fin));
    const rows = JOBS.map((j) => {
      const unlocked = jobUnlocked(j, fin);
      const r = recs[j.id];
      const focus = unlocked && open[this.focusIndex] === j;
      return `<button class="job-row${unlocked ? '' : ' locked'}${focus ? ' focus' : ''}" data-act="pick" data-id="${j.id}" ${unlocked ? '' : 'disabled'}>
        <span class="jr-num">JOB ${pad2(j.number)}</span>
        <span class="jr-kind k-${j.kind.toLowerCase()}">${j.kind}</span>
        <span class="jr-title">${unlocked ? j.title : 'LOCKED — FINISH ANOTHER JOB'}</span>
        <span class="jr-meta">${unlocked ? `${j.start.label} · ${j.threat}` : ''}</span>
        <span class="jr-best">${r ? `<b class="g-${r.grade}">${r.grade}</b>${r.ghost ? '<i>GHOST</i>' : ''}<em>${fmtTime(r.time)}</em>` : unlocked ? '<em>—</em>' : ''}</span>
      </button>`;
    }).join('');
    this.el.innerHTML = `
      <div class="jb-card" role="dialog" aria-modal="true" aria-labelledby="jb-title">
        <div class="jb-head">
          <div class="st-title" aria-hidden="true"><div><b>UNDER</b><span>WATCH</span></div></div>
          <div class="jb-sub">
            <div class="jb-eyebrow">JOB BOARD · BELLHAVEN</div>
            <h2 id="jb-title">Skate the city. Stay off the grid.</h2>
          </div>
        </div>
        ${this.kitHtml(recs)}
        <div class="jb-list">${rows}</div>
        <div class="jb-foot">
          <span class="jb-hint">${this.touch ? 'Tap a job' : '<kbd>↑</kbd><kbd>↓</kbd> pick · <kbd>Enter</kbd> brief · <kbd>1</kbd>–<kbd>9</kbd> jump'}</span>
          <span class="jb-links">
            <button class="jb-link" data-act="story">The afternoon (story)</button>
            ${this.canClose() ? '<button class="jb-link" data-act="close">Free skate</button>' : ''}
          </span>
        </div>
      </div>`;
  }

  /** The kit: what rep has opened, and what the next one needs. */
  private kitHtml(recs: Record<string, JobRecord>): string {
    const rep = repOf(recs);
    const perks = PERKS.map((p) => `<span class="perk${rep >= p.rep ? ' on' : ''}" title="${p.does}">
      <b>${p.name}</b><small>${rep >= p.rep ? p.does : `REP ${p.rep}`}</small></span>`).join('');
    return `<div class="jb-kit"><span class="jb-rep">REP <b>${rep}</b></span>${perks}</div>`;
  }

  private briefHtml(j: JobDef, r: JobRecord | undefined): string {
    const dest = destinationOf(j);
    return `
      <div class="jb-card brief" role="dialog" aria-modal="true" aria-labelledby="jb-brief-title">
        <div class="jb-eyebrow">JOB ${pad2(j.number)} · <span class="k-${j.kind.toLowerCase()}">${j.kind}</span></div>
        <h2 id="jb-brief-title" class="brief-title">${j.title}</h2>
        <p class="brief-line">${j.brief}</p>
        <dl class="brief-facts">
          <div><dt>Start</dt><dd>${j.start.label}</dd></div>
          <div><dt>${j.stages.length > 1 ? 'Route' : 'Destination'}</dt><dd>${dest}</dd></div>
          <div><dt>Threat</dt><dd>${j.threat}</dd></div>
          <div><dt>Time</dt><dd>${fmtClock(j.target)} <small>target</small></dd></div>
          ${r ? `<div><dt>Best</dt><dd><b class="g-${r.grade}">${r.grade}</b> ${num(r.total)} · ${fmtTime(r.time)} · seen ${pct(r.exposure)}${r.ghost ? ' · GHOST' : ''}</dd></div>` : ''}
        </dl>
        <p class="brief-kind">${KIND_NOTE[j.kind]} ${j.kind === 'GHOST' ? 'Exposure counts double.' : 'Being seen never ends a job — it starts a chase.'}</p>
        <div class="brief-actions">
          <button class="jb-go" data-act="go">GO${this.touch ? '' : ' <kbd>Enter</kbd>'}</button>
          <button class="jb-link" data-act="back">Back to the board</button>
        </div>
      </div>`;
  }
}

// ------------------------------------------------------------------------ hud

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const nameOf = (id: string, kind: 'cam' | 'drone' | 'unit'): string => {
  const n = id.replace(/^[A-Z]+-/, '');
  return kind === 'cam' ? `CAM ${n}` : kind === 'drone' ? `DRONE ${n}` : `UNIT ${n}`;
};

/**
 * The run, at the top of the glass.
 *
 *   JOB 07 · COURIER                                   00:41 / 01:00
 *   GET TO: OKONJO CYCLE & BOARD  · 140 m
 *   [ UNSEEN ]
 *
 * and, only once something has looked: the exposure bar, and who is looking
 * and which way they are — CAM 22 →, DRONE 02 ↑.
 */
export class JobHud {
  private el: HTMLElement;
  private callout: HTMLElement;
  private toast: HTMLElement;
  private calloutTimer = 0;
  private toastAt = -1;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'job-hud';
    this.el.className = 'hidden';
    this.el.setAttribute('aria-live', 'polite');
    host.appendChild(this.el);
    this.callout = document.createElement('div');
    this.callout.id = 'job-callout';
    host.appendChild(this.callout);
    this.toast = document.createElement('div');
    this.toast.id = 'job-move';
    host.appendChild(this.toast);
  }

  setVisible(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
    if (!on) { this.callout.className = ''; this.toast.className = ''; }
  }

  say(c: Callout): void {
    this.callout.textContent = c.text;
    this.callout.className = '';
    void this.callout.offsetWidth;   // restart the animation
    this.callout.className = `show t-${c.tone}`;
    this.calloutTimer = c.tone === 'alarm' ? 2.2 : 1.6;
  }

  update(run: JobRun, dt: number, player: { x: number; y: number }, camYaw: number): void {
    this.calloutTimer -= dt;
    if (this.calloutTimer <= 0 && this.callout.classList.contains('show')) this.callout.className = '';
    const d = run.def;
    const st = run.stage;
    const next = run.nextPoint();
    const e = run.exposure;
    const level = e.level;
    const over = run.elapsed > d.target;
    const rel = (p: { x: number; y: number }) => {
      const a = wrapAngle(Math.atan2(p.y - player.y, p.x - player.x) - camYaw);
      return ARROWS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
    };
    let objective = '';
    if (st) {
      if (st.points.length === 0) objective = `${st.verb}`;
      else if (st.mode === 'all') {
        const left = run.remaining();
        objective = `${st.verb}: ${left.map((p) => p.label).join(' · ')} <small>${st.points.length - left.length}/${st.points.length}</small>`;
      } else objective = `${st.verb}: ${next?.label ?? ''}`;
      if (next) objective += ` <span class="jh-dist">${rel(next.pos)} ${Math.round(Math.hypot(next.pos.x - player.x, next.pos.y - player.y))} m${next.minZ !== undefined ? ' · ROOF' : ''}</span>`;
      if (st.loseSignal && level !== 'TRACKED' && level !== 'UNDERWATCH') objective = `${st.verb} <span class="jh-dist">${JOB.run.lost}</span>`;
    }
    // Who is looking: what has you now, and what the chase has sent.
    const seenBy = run.watchers.slice(0, 3).map((w) => `<span class="w w-${w.kind}">${nameOf(w.id, w.kind)} ${rel(w.pos)}</span>`);
    for (const h of run.hunterDrones()) {
      if (run.watchers.some((w) => w.id === h.id)) continue;
      seenBy.push(`<span class="w w-hunt">${nameOf(h.id, 'drone')} ${rel(h.pos)}</span>`);
    }
    const quiet = level === 'UNSEEN' && seenBy.length === 0;
    const pending = run.tally.pending > 0 ? `<span class="jh-chain">CHAIN ${num(run.tally.pending)} ×${run.tally.multiplier}</span>` : '';
    this.el.className = `lvl-${level.toLowerCase()}${quiet ? ' quiet' : ''}`;
    this.el.innerHTML = `
      <div class="jh-top"><span class="jh-job">JOB ${pad2(d.number)} · ${d.kind}</span>
        <span class="jh-time${over ? ' over' : ''}">${fmtClock(run.elapsed)} <small>/ ${fmtClock(d.target)}</small></span></div>
      <div class="jh-obj">${objective}</div>
      <div class="jh-exp">
        <span class="jh-level">${JOB.level[level]}</span>
        <span class="jh-bar"><i style="width:${Math.round(e.value)}%"></i></span>
        <span class="jh-pct">${pct(exposureShare(e))} SEEN</span>
        ${pending}
      </div>
      ${seenBy.length ? `<div class="jh-watch">${seenBy.join('')}</div>` : ''}`;

    const m = run.lastMove;
    if (m && m.at !== this.toastAt) {
      this.toastAt = m.at;
      this.toast.textContent = `+${num(m.points)}${m.multiplier > 1 ? ` ×${m.multiplier}` : ''} ${m.label}`;
      this.toast.className = '';
      void this.toast.offsetWidth;
      this.toast.className = 'show';
    }
  }
}

// -------------------------------------------------------------------- results

export interface ResultActions { retry(): void; next(): void; board(): void; }

export class JobResults {
  private el: HTMLElement;
  open = false;
  private hasNext = false;

  constructor(host: HTMLElement, private touch: boolean, private actions: ResultActions) {
    this.el = document.createElement('div');
    this.el.id = 'job-results';
    this.el.className = 'hidden';
    host.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const act = ((e.target as HTMLElement).closest('[data-act]') as HTMLElement | null)?.dataset.act;
      if (act === 'retry') { this.hide(); this.actions.retry(); }
      else if (act === 'next') { this.hide(); this.actions.next(); }
      else if (act === 'board') { this.hide(); this.actions.board(); }
    });
  }

  key(code: string): boolean {
    if (!this.open) return false;
    if (code === 'Enter' || code === 'KeyT' || code === 'Space') { this.hide(); this.actions.retry(); }
    else if (code === 'KeyN' && this.hasNext) { this.hide(); this.actions.next(); }
    else if (code === 'Escape' || code === 'KeyB') { this.hide(); this.actions.board(); }
    return true;
  }

  show(
    def: JobDef, r: RunResult, rec: JobRecord, bests: string[], hasNext: boolean,
    extra: { launches: number; tricks: number; roofs: number; bestChain: number }, unlocked: readonly PerkDef[] = [],
  ): void {
    this.open = true;
    this.hasNext = hasNext;
    const best = (k: string) => (bests.includes(k) && rec.runs > 1 ? '<span class="nb">BEST</span>' : '');
    const k = this.touch ? '' : ' <kbd>';
    this.el.innerHTML = `
      <div class="jr-card" role="dialog" aria-modal="true" aria-labelledby="jr-title">
        <div class="jb-eyebrow">JOB ${pad2(def.number)} · ${def.kind} · COMPLETE</div>
        <h2 id="jr-title" class="brief-title">${def.title}</h2>
        <div class="jr-grade g-${r.grade}">${r.grade}${r.ghost ? '<small>GHOST</small>' : ''}</div>
        <div class="jr-total">${num(r.total)} ${best('total')}</div>
        <dl class="jr-stats">
          <div><dt>Style</dt><dd>${num(r.style)} ${best('style')}</dd></div>
          <div><dt>Time</dt><dd>${fmtTime(r.time)} <small>/ ${fmtClock(def.target)}</small> ${best('time')}</dd></div>
          <div><dt>Exposure</dt><dd>${pct(r.exposure)} ${best('exposure')}</dd></div>
          <div><dt>Flow</dt><dd>${pct(r.flow)} ${best('flow')}</dd></div>
        </dl>
        <p class="jr-line">${extra.launches} launch${extra.launches === 1 ? '' : 'es'} · ${extra.tricks} trick${extra.tricks === 1 ? '' : 's'} · ${extra.roofs} roof${extra.roofs === 1 ? '' : 's'} · best chain ${num(extra.bestChain)}${r.escapes ? ` · ${r.escapes} signal${r.escapes === 1 ? '' : 's'} lost` : ''}</p>
        ${unlocked.map((p) => `<p class="jr-unlock"><span class="nb">NEW KIT</span> <b>${p.name}</b> — ${p.does}</p>`).join('')}
        <p class="jr-best-line">Best: <b class="g-${rec.grade}">${rec.grade}</b> ${num(rec.total)} · ${fmtTime(rec.time)} · seen ${pct(rec.exposure)} · run ${rec.runs}</p>
        <div class="brief-actions">
          <button class="jb-go" data-act="retry">RUN IT AGAIN${k ? `${k}Enter</kbd>` : ''}</button>
          ${hasNext ? `<button class="jb-go quiet" data-act="next">NEXT JOB${k ? `${k}N</kbd>` : ''}</button>` : ''}
          <button class="jb-link" data-act="board">Job board${k ? `${k}Esc</kbd>` : ''}</button>
        </div>
      </div>`;
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.open = false;
    this.el.classList.add('hidden');
  }
}
