/**
 * How the afternoon ended.
 *
 * It arrives after the advertisement has played again, unchanged. It says
 * what happened next, in the past tense, as if somebody were telling you
 * later — and then it says what you had actually worked out, because the
 * ending was read off those notes and a player deserves to see the page it
 * was read from.
 */
import type { Sim } from '../sim/sim';
import { ENDINGS, ENDING_ORDER, type EndingId } from '../content/case';

export class EndingCard {
  private el: HTMLElement;
  open = false;

  constructor(
    host: HTMLElement,
    private sim: Sim,
    private actions: { keepSkating(): void; newAfternoon(): void },
  ) {
    this.el = document.createElement('div');
    this.el.id = 'ending';
    this.el.className = 'hidden';
    host.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const act = ((e.target as HTMLElement).closest('[data-act]') as HTMLElement | null)?.dataset.act;
      if (act === 'keep') { this.hide(); this.actions.keepSkating(); }
      if (act === 'new') this.actions.newAfternoon();
    });
  }

  show(id: EndingId, seen: string[]): void {
    const e = ENDINGS[id];
    const cf = this.sim.casefile;
    const keys = cf.defs.deductions.filter((d) => d.key);
    const findings = keys.map((d) => cf.deductions.has(d.id)
      ? `<li class="got">${d.title}</li>`
      : '<li class="missed">something you never put together</li>').join('');
    const others = ENDING_ORDER.length - seen.length;
    this.el.innerHTML = `
      <div class="end-card">
        <div class="end-kicker">The afternoon ends</div>
        <h2>${e.title}</h2>
        <div class="end-body">${e.epilogue.map((l) => `<p>${l}</p>`).join('')}</div>
        <div class="end-case">
          <h4>What you worked out</h4>
          <ul>${findings}</ul>
          <div class="end-count">${cf.clues.size} things noted · ${cf.deductions.size} connections made</div>
        </div>
        <div class="end-seen">Endings found: ${seen.length} of ${ENDING_ORDER.length}${others > 0 ? ' — the afternoon can end other ways.' : '.'}</div>
        <div class="end-actions">
          <button data-act="keep">Keep skating</button>
          <button data-act="new" class="primary">A new afternoon</button>
        </div>
      </div>`;
    this.open = true;
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.open = false;
    this.el.classList.add('hidden');
  }
}
