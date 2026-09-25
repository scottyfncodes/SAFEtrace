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
  ['Q', 'plan — stop and read the town; click to pin where you are going; move to leave it'], ['N', 'notes'], ['Esc', 'this menu'],
];
const TOUCH: Array<[string, string]> = [
  ['Left thumb', 'push the way you want to go'], ['Drag on empty glass', 'look around'],
  ['TRICK', 'tap to flip the board, hold to grab it'],
  ['SLING', 'hold to draw — you keep skating; pull the pouch to aim, let go to throw'],
  ['PLAN', 'stop and read the map; tap it to pin where you are going; push off to leave'],
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
      }
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
      .map(([k, v]) => `<div class="ctl"><kbd>${k}</kbd><span>${v}</span></div>`).join('');
    const endings = ENDING_ORDER.map((id) => seen.includes(id)
      ? `<li>${ENDINGS[id].title}</li>`
      : '<li class="unseen">—</li>').join('');
    this.el.innerHTML = `
      <div class="menu-card" role="dialog" aria-label="Paused">
        <div class="menu-head">
          <div class="menu-title">Paused</div>
          <div class="menu-sub">Bellhaven waits for you.</div>
        </div>
        <div class="menu-actions">
          <button data-act="resume" class="primary">Resume</button>
          <button data-act="notes">Notes</button>
        </div>
        <div class="menu-cols">
          <section>
            <h4>Settings</h4>
            <label><input type="checkbox" data-set="motion" ${s.reduceMotion ? 'checked' : ''}> Reduce motion and flashing</label>
            <label><input type="checkbox" data-set="colour" ${s.colourSafeMachine ? 'checked' : ''}> Colour-blind safe palette</label>
            <label><input type="checkbox" data-set="text" ${s.textScale > 1 ? 'checked' : ''}> Larger text</label>
            <label><input type="checkbox" data-set="shake" ${s.cameraShake > 0 ? 'checked' : ''}> Camera shake</label>
            ${this.touch ? `<label><input type="checkbox" data-set="classic" ${s.classicSling ? 'checked' : ''}> Classic slingshot (stop, and aim from the eyes)</label>` : ''}
            <label class="range">Volume <input type="range" min="0" max="1" step="0.05" value="${s.masterVolume}" data-set="volume"></label>
          </section>
          <section>
            <h4>Controls</h4>
            <div class="ctls">${rows}</div>
          </section>
        </div>
        <section class="menu-endings">
          <h4>Endings found · ${seen.length} of ${ENDING_ORDER.length}</h4>
          <ul>${endings}</ul>
        </section>
        <div class="menu-foot">
          <button data-act="new" class="${this.confirmNew ? 'danger' : 'quiet'}">${this.confirmNew ? 'This forgets today. Start over?' : 'Start a new afternoon'}</button>
        </div>
      </div>`;
  }
}
