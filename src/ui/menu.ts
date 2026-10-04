/**
 * The pause menu.
 *
 * The preferences card promised "these can be changed at any time", and for
 * the whole life of the game so far there was nowhere to change them. This is
 * that place, plus the controls, the notes, and a way to start over. It
 * stops the world while it is open: nothing in Bellhaven should happen to a
 * player who is reading a settings screen.
 */
import type { Settings } from '../core/settings';
import { ENDINGS, ENDING_ORDER } from '../content/case';

export interface MenuActions {
  resume(): void;
  notes(): void;
  newAfternoon(): void;
  applySettings(): void;
}

const KEYS: Array<[string, string]> = [
  ['W', 'push (hold to keep pushing)'], ['A D', 'carve'], ['Space', 'ollie (hold to load)'], ['S', 'brake / slide'],
  ['R', 'trick'], ['G', 'grab'], ['Shift', 'step off the board'], ['Right mouse drag', 'look around'],
  ['Left mouse', 'slingshot: drag back from anywhere and let go — or point at a thing and hold'],
  ['F', 'steady aim: stand still and look down the sling (mouse or A D W S to aim)'],
  ['E', 'talk, look, reach into a node'], ['1–3', 'answer'],
  ['Q', 'plan — tap to open, click to pin where you are going (or hold to peek)'], ['N', 'notes'], ['Esc', 'this menu'],
];
const TOUCH: Array<[string, string]> = [
  ['Left thumb', 'push the way you want to go'], ['Drag on empty glass', 'look around'],
  ['TRICK', 'tap to flip the board, hold to grab it'],
  ['SLING', 'press it, slide down to pull back, let go to throw'],
  ['PLAN', 'the map: tap it to pin where you are going, and follow the pin'],
  ['Tap a person or thing', 'talk, look, reach in'], ['Notes', 'what you know'],
];

export class Menu {
  private el: HTMLElement;
  open = false;
  private confirmNew = false;

  constructor(
    host: HTMLElement,
    private settings: Settings,
    private touch: boolean,
    private actions: MenuActions,
    private endingsSeen: () => string[],
  ) {
    this.el = document.createElement('div');
    this.el.id = 'menu';
    this.el.className = 'hidden';
    host.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const act = (t.closest('[data-act]') as HTMLElement | null)?.dataset.act;
      if (act === 'resume') this.hide();
      else if (act === 'notes') { this.hide(false); this.actions.notes(); }
      else if (act === 'new') {
        if (this.confirmNew) { this.actions.newAfternoon(); return; }
        this.confirmNew = true;
        this.render();
      } else if (act === 'keep') {
        // Backing out of the confirmation is only ever a way back to the
        // first step: the second press is still the only thing that forgets.
        this.confirmNew = false;
        this.render();
      }
    });
    // The volume readout follows the slider while it is dragged; the value
    // itself is still only applied on change, as it always was.
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.set !== 'volume') return;
      const out = this.el.querySelector('output[data-for="volume"]');
      if (out) out.textContent = `${Math.round(Number(t.value) * 100)}%`;
    });
    this.el.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      const s = this.settings;
      switch (t.dataset.set) {
        case 'motion':
          s.reduceMotion = t.checked;
          s.transitionIntensity = t.checked ? 0.25 : 1;
          break;
        case 'colour': s.colourSafeMachine = t.checked; break;
        case 'text': s.textScale = t.checked ? 1.2 : 1; break;
        case 'shake': s.cameraShake = t.checked ? 1 : 0; break;
        case 'classic': s.classicSling = t.checked; break;
        case 'volume': s.masterVolume = Number(t.value); break;
      }
      this.actions.applySettings();
    });
  }

  show(): void {
    this.open = true;
    this.confirmNew = false;
    this.render();
    this.el.classList.remove('hidden');
  }

  hide(resume = true): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    if (resume) this.actions.resume();
  }

  key(code: string): boolean {
    if (!this.open) return false;
    if (code === 'Escape' || code === 'KeyP') this.hide();
    return true;
  }

  private render(): void {
    const s = this.settings;
    const seen = this.endingsSeen();
    const rows = (this.touch ? TOUCH : KEYS)
      .map(([k, v]) => this.touch
        ? `<div class="ctl"><span class="gesture">${k}</span><span>${v}</span></div>`
        : `<div class="ctl"><kbd>${k}</kbd><span>${v}</span></div>`).join('');
    const endings = ENDING_ORDER.map((id, i) => seen.includes(id)
      ? `<li data-n="${String(i + 1).padStart(2, '0')}">${ENDINGS[id].title}</li>`
      : `<li class="unseen" data-n="${String(i + 1).padStart(2, '0')}">Not found yet</li>`).join('');
    const toggle = (key: string, on: boolean, label: string, hint = '') => `
      <label class="setting"><span class="s-label">${label}${hint ? `<span class="s-hint">${hint}</span>` : ''}</span>
        <input class="switch" type="checkbox" role="switch" data-set="${key}" ${on ? 'checked' : ''}></label>`;
    this.el.innerHTML = `
      <div class="menu-card" role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <div class="menu-head">
          <div>
            <div class="st-title" aria-hidden="true"><div><b>SAFE</b><span>TRACE</span></div></div>
            <div class="menu-title" id="menu-title">Paused</div>
            <div class="menu-sub">Bellhaven waits for you.</div>
          </div>
          <div class="menu-actions">
            <button data-act="notes">Notes</button>
            <button data-act="resume" class="primary">Resume</button>
          </div>
        </div>
        <div class="menu-cols">
          <section aria-labelledby="menu-settings">
            <h4 id="menu-settings">Settings</h4>
            ${toggle('motion', s.reduceMotion, 'Reduce motion and flashing')}
            ${toggle('colour', s.colourSafeMachine, 'Colour-blind safe palette')}
            ${toggle('text', s.textScale > 1, 'Larger text')}
            ${toggle('shake', s.cameraShake > 0, 'Camera shake')}
            <label class="setting range"><span class="s-label">Volume</span>
              <input type="range" min="0" max="1" step="0.05" value="${s.masterVolume}" data-set="volume" aria-label="Volume">
              <output data-for="volume">${Math.round(s.masterVolume * 100)}%</output></label>
            <section class="menu-endings" aria-labelledby="menu-endings">
              <h4 id="menu-endings">Endings found · ${seen.length} of ${ENDING_ORDER.length}</h4>
              <ol>${endings}</ol>
            </section>
          </section>
          <section aria-labelledby="menu-controls">
            <h4 id="menu-controls">Controls</h4>
            <div class="ctls${this.touch ? ' touch' : ''}">${rows}</div>
          </section>
        </div>
        <div class="menu-foot">
          ${this.confirmNew
            ? `<span class="confirm-note" role="alert">This forgets today. Start over?</span>
               <button data-act="keep" class="quiet">Keep this afternoon</button>
               <button data-act="new" class="danger">Start over</button>`
            : '<button data-act="new" class="quiet">Start a new afternoon</button>'}
        </div>
      </div>`;
  }
}
