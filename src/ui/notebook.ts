/**
 * The notebook: the player's own notes, on the player's own phone.
 *
 * It is not SAFEtrace. It is lower-case, hand-kept, and it has no score in
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
      ? `<div class="nb-empty">Nothing written down yet. It's a nice afternoon.</div>`
      : threads.map(({ t, clues, deductions }) => {
        const keyed = cf.defs.deductions.some((d) => d.thread === t.id && d.key);
        const answered = keyed ? cf.threadAnswered(t.id) : deductions.length > 0;
        const open = cf.openConnections(t.id);
        return `
          <section class="nb-thread${answered ? ' answered' : ''}">
            <h3>${esc(t.question)}</h3>
            ${answered ? `<div class="nb-answer">${esc(t.answered)}</div>` : ''}
            ${open > 0 ? `<div class="nb-open">Something here fits together.</div>` : ''}
            ${deductions.map((d) => this.deduction(d)).join('')}
            ${clues.map((c) => this.clue(c)).join('')}
          </section>`;
      }).join('');

    const resultLine = this.result
      ? `<div class="nb-result ${this.result.tone}">${this.result.tone === 'new' ? '<b>Worked out:</b> ' : ''}${esc(this.result.text)}</div>`
      : '';

    this.el.innerHTML = `
      <div class="nb-sheet" role="dialog" aria-label="Notes">
        <header>
          <div class="nb-title">notes</div>
          <button class="nb-close" data-close="1">${this.touch ? 'Close' : 'Close · N'}</button>
        </header>
        <div class="nb-body">${body}</div>
        <footer>
          ${resultLine}
          <div class="nb-actions">
            <span class="nb-help">${esc(help)}</span>
            <button class="nb-connect" data-connect="1" ${this.selected.length === 2 ? '' : 'disabled'}>Connect</button>
          </div>
        </footer>
      </div>`;
  }

  private clue(c: ClueDef): string {
    const cf = this.sim.casefile;
    const sel = this.selected.includes(c.id);
    const wrong = cf.isDisproved(c.id);
    const isNew = !cf.seen.has(c.id);
    return `
      <button class="nb-entry clue${sel ? ' sel' : ''}${wrong ? ' wrong' : ''}" data-entry="${c.id}">
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

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}
