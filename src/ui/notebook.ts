/**
 * The notebook: the player's own notes, on the player's own phone.
 *
 * It is not UNDERWATCH. It is lower-case, hand-kept, and it has no score in
 * it. It shows three things: what you are trying to find out, what you have
 * seen and been told, and what you have worked out by putting two of those
 * next to each other. Connecting is the only verb, and a wrong pair costs
 * nothing but a line saying so.
 *
 * It never says which pair to try. It says, per question, whether there is
 * still something to be made of what you already have — which is the
 * difference between "look harder at your notes" and "go outside".
 */
import type { Sim } from '../sim/sim';
import type { ClueDef, DeductionDef } from '../sim/casefile';
import { PHONE } from '../content/copy';
import { riskLabel } from '../sim/surveillance/risk';

export class Notebook {
  private el: HTMLElement;
  private selected: string[] = [];
  private result: { text: string; tone: 'new' | 'known' | 'nothing' } | null = null;
  private fresh: string | null = null;
  open = false;

  constructor(
    host: HTMLElement,
    private sim: Sim,
    private touch: boolean,
    private onClose: () => void,
    private onConnect: (made: boolean) => void = () => {},
  ) {
    this.el = document.createElement('div');
    this.el.id = 'notebook';
    this.el.className = 'hidden';
    host.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const entry = t.closest('[data-entry]') as HTMLElement | null;
      if (t.closest('[data-close]')) { this.hide(); return; }
      if (t.closest('[data-connect]')) { this.connect(); return; }
      if (entry?.dataset.entry) this.pick(entry.dataset.entry);
    });
  }

  show(): void {
    this.open = true;
    this.selected = [];
    this.result = null;
    this.fresh = null;
    this.render();
    this.el.classList.remove('hidden');
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.sim.casefile.markAllSeen();
    this.el.classList.add('hidden');
    this.onClose();
  }

  toggle(): void { if (this.open) this.hide(); else this.show(); }

  /** Keys, while open: Escape/N close, Enter connects. */
  key(code: string): boolean {
    if (!this.open) return false;
    if (code === 'Escape' || code === 'KeyN' || code === 'Tab') { this.hide(); return true; }
    if (code === 'Enter' || code === 'Space') { this.connect(); return true; }
    return true;
  }

  private pick(id: string): void {
    const i = this.selected.indexOf(id);
    if (i >= 0) this.selected.splice(i, 1);
    else {
      this.selected.push(id);
      if (this.selected.length > 2) this.selected.shift();
    }
    this.result = null;
    this.render();
  }

  private connect(): void {
    if (this.selected.length !== 2) return;
    const [a, b] = this.selected;
    const r = this.sim.connectClues(a, b);
    if (r.kind === 'new') {
      this.result = { text: r.deduction.title, tone: 'new' };
      this.fresh = r.deduction.id;
      this.onConnect(true);
    } else if (r.kind === 'known') {
      this.result = { text: `Already worked out: ${r.deduction.title}`, tone: 'known' };
    } else {
      this.result = { text: "Those don't tell you anything together. Not yet, anyway.", tone: 'nothing' };
      this.onConnect(false);
    }
    this.selected = [];
    this.render();
  }

  private render(): void {
    const cf = this.sim.casefile;
    const threads = cf.defs.threads.map((t) => ({ t, ...cf.entriesOn(t.id) }))
      .filter((x) => x.clues.length + x.deductions.length > 0);

    const help = this.selected.length === 0
      ? `${this.touch ? 'Tap' : 'Click'} two things that might belong together.`
      : this.selected.length === 1 ? 'And what goes with it?' : 'Connect them?';

    const body = threads.length === 0
      ? `<div class="nb-empty">${EMPTY_TRACE}<span>Nothing written down yet. It's a nice afternoon.</span>
          <span class="nb-empty-hint">What you see and hear, you write down here.</span></div>`
      : threads.map(({ t, clues, deductions }) => {
        const keyed = cf.defs.deductions.some((d) => d.thread === t.id && d.key);
        const answered = keyed ? cf.threadAnswered(t.id) : deductions.length > 0;
        const open = cf.openConnections(t.id);
        return `
          <section class="nb-thread${answered ? ' answered' : ''}">
            <h3>${esc(t.question)}${answered ? '<span class="nb-status done">✓ Answered</span>' : ''}</h3>
            ${answered ? `<div class="nb-answer">${esc(t.answered)}</div>` : ''}
            ${open > 0 ? `<div class="nb-open">Something here fits together.</div>` : ''}
            <div class="nb-trail">
              ${deductions.map((d) => this.deduction(d)).join('')}
              ${clues.map((c) => this.clue(c)).join('')}
            </div>
          </section>`;
      }).join('');

    const resultLine = this.result
      ? `<div class="nb-result ${this.result.tone}" role="status">${this.result.tone === 'new' ? '<b>Worked out:</b> ' : ''}${esc(this.result.text)}</div>`
      : '';

    const noted = cf.clues.size;
    const made = cf.deductions.size;
    const meta = noted === 0 ? ''
      : `${noted} ${noted === 1 ? 'thing' : 'things'} noted · ${made} ${made === 1 ? 'connection' : 'connections'} made`;
    // The pair being considered, kept in view while the list scrolls.
    const picks = this.selected.length === 0 ? '' : `<div class="nb-picks" aria-live="polite">${
      this.selected.map((id, i) => `<span class="pk"><b>${i + 1}</b><span>${esc(cf.clue(id)?.title ?? '')}</span></span>`)
        .join('<span class="plus">+</span>')}</div>`;

    this.el.innerHTML = `
      <div class="nb-sheet" role="dialog" aria-modal="true" aria-labelledby="nb-title">
        <header>
          <div class="nb-headline">
            <div class="nb-title" id="nb-title">notes</div>
            ${meta ? `<div class="nb-meta">${meta}</div>` : ''}
          </div>
          <button class="nb-close" data-close="1">${this.touch ? 'Close' : 'Close <kbd>N</kbd>'}</button>
        </header>
        <div class="nb-body">${this.scoreNote()}${body}</div>
        <footer>
          ${resultLine}
          ${picks}
          <div class="nb-actions">
            <span class="nb-help">${esc(help)}</span>
            <button class="nb-connect" data-connect="1" ${this.selected.length === 2 ? '' : 'disabled'}>Connect</button>
          </div>
        </footer>
      </div>`;
  }

  /**
   * The number, once found — in the player's own words, at the top of their
   * own notes, because it is a thing they found out rather than a thing the
   * game shows. Before it is found there is nothing here at all.
   */
  private scoreNote(): string {
    const sim = this.sim;
    if (!sim.scoreDiscovered) return '';
    const risk = sim.playerRisk;
    return `<div class="nb-score">${esc(PHONE.notes(Math.round(100 - risk), riskLabel(risk), sim.scoreFoundAt ?? 'a camera'))}</div>`;
  }

  private clue(c: ClueDef): string {
    const cf = this.sim.casefile;
    const sel = this.selected.includes(c.id);
    const wrong = cf.isDisproved(c.id);
    const isNew = !cf.seen.has(c.id);
    const order = this.selected.indexOf(c.id);
    return `
      <button class="nb-entry clue${sel ? ' sel' : ''}${wrong ? ' wrong' : ''}" data-entry="${c.id}" aria-pressed="${sel}">
        ${order >= 0 ? `<i class="nb-pick" aria-hidden="true">${order + 1}</i>` : ''}
        <span class="nb-t">${esc(c.title)}${isNew ? '<i class="nb-new">new</i>' : ''}</span>
        <span class="nb-b">${esc(c.body)}</span>
        <span class="nb-w">${wrong ? "doesn't hold up" : esc(c.where)}</span>
      </button>`;
  }

  private deduction(d: DeductionDef): string {
    const fresh = this.fresh === d.id;
    return `
      <div class="nb-entry deduction${fresh ? ' fresh' : ''}">
        <span class="nb-t">${esc(d.title)}</span>
        <span class="nb-b">${esc(d.body)}</span>
      </div>`;
  }
}

/** A pencil line that has not gone anywhere yet. */
const EMPTY_TRACE = `<svg viewBox="0 0 120 28" fill="none" aria-hidden="true">
  <path d="M4 18c14-10 22 6 36-2s20-10 34-2 18 6 30-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="2 5"/>
  <circle cx="108" cy="10" r="3" stroke="currentColor" stroke-width="1.4"/>
</svg>`;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}
