/**
 * Trouble on the glass: how hot you are, the moment you are caught, and the
 * long walk until your mom gives the board back.
 *
 * The heat meter is five pips under the corner buttons, and it is not there
 * at all while you are clear. Grounded, the same place says so and counts
 * down. Busted is a card, because being caught should stop you for a second.
 */
import { HEAT_NAMES, type Trouble } from '../sim/trouble';

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class TroubleHud {
  private el: HTMLElement;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'heat';
    this.el.className = 'hidden';
    this.el.setAttribute('aria-live', 'polite');
    host.appendChild(this.el);
  }

  update(t: Trouble | null): void {
    if (!t) { this.el.className = 'hidden'; return; }
    if (t.isGrounded) {
      this.el.className = 'grounded';
      this.el.innerHTML = `<b>GROUNDED</b><span class="h-time">${clock(t.groundedLeft)}</span><span class="h-sub">no board · no sling</span>`;
      return;
    }
    const lvl = t.level;
    if (t.heat <= 0.01) { this.el.className = 'hidden'; return; }
    const pips = Array.from({ length: 5 }, (_, i) => {
      const fill = Math.max(0, Math.min(1, t.heat - i));
      return `<i class="pip${fill >= 1 ? ' on' : ''}"><u style="width:${Math.round(fill * 100)}%"></u></i>`;
    }).join('');
    const cooling = t.unseenFor > 3 && lvl > 0;
    this.el.className = `lvl-${lvl}${cooling ? ' cooling' : ''}`;
    this.el.innerHTML = `<b>HEAT</b><span class="pips">${pips}</span><span class="h-name">${HEAT_NAMES[lvl]}</span>`;
  }
}

/** The card for being caught. Stops the world until it is read. */
export class BustedCard {
  private el: HTMLElement;
  open = false;
  private onClose: () => void = () => {};

  constructor(host: HTMLElement, private touch: boolean) {
    this.el = document.createElement('div');
    this.el.id = 'busted';
    this.el.className = 'hidden';
    host.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act="ok"]')) this.hide();
    });
  }

  show(seconds: number, busts: number, onClose: () => void): void {
    this.open = true;
    this.onClose = onClose;
    const again = busts > 1 ? `<p class="b-again">That's ${busts} times. It gets longer every time.</p>` : '';
    this.el.innerHTML = `
      <div class="b-card" role="dialog" aria-modal="true" aria-labelledby="b-title">
        <div class="jb-eyebrow">CAUGHT</div>
        <h2 id="b-title">BUSTED</h2>
        <p>An officer walks you home. Your parents are waiting on the step, and they take your <b>board</b> and your <b>slingshot</b>.</p>
        <p class="b-term">Grounded for <b>${clock(seconds)}</b>: on foot, nothing to throw, until your mom gives it all back.</p>
        ${again}
        <button class="jb-go" data-act="ok">OK${this.touch ? '' : ' <kbd>Enter</kbd>'}</button>
      </div>`;
    this.el.classList.remove('hidden');
  }

  key(code: string): boolean {
    if (!this.open) return false;
    if (code === 'Enter' || code === 'Space' || code === 'Escape') this.hide();
    return true;
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    this.onClose();
  }
}

/** What the level change says out loud, and how loud. */
export const LEVEL_CALL: Record<number, { text: string; tone: 'info' | 'warn' | 'alarm' | 'good' }> = {
  0: { text: 'HEAT OFF', tone: 'good' },
  1: { text: 'SOMEBODY CALLED IT IN', tone: 'info' },
  2: { text: 'OFFICER RESPONDING', tone: 'warn' },
  3: { text: 'WANTED — RUN', tone: 'alarm' },
  4: { text: 'PURSUIT', tone: 'alarm' },
  5: { text: 'LOCKDOWN', tone: 'alarm' },
};

export const MOM_RETURNS = 'MOM GAVE IT ALL BACK';
export const YELPS = ['OW!', 'HEY!', 'OI!', 'WHAT THE—', 'OW! WHO DID THAT?'];
