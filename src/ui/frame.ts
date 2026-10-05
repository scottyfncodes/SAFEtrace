/**
 * The observation frame.
 *
 * Four corner brackets at the edge of the glass, and one line of the system's
 * own bookkeeping along the bottom: whether it is recording you, which camera
 * has you, the clock, the quality of its picture, and what it has decided to
 * do about you. It is the one piece of interface that says, in every frame,
 * that the player is looking *through* something that is also looking back.
 *
 * Everything on it is read off the simulation; nothing is invented for
 * atmosphere. REC lights only while a sensor genuinely has the rider in its
 * picture, the camera id is the sensor's own, and the state is the exposure
 * level in a job or the pursuit machine in the story. When nobody is
 * looking, the frame is four dim corners and a clock — and that quiet is the
 * point, because it is what changes when you are seen.
 *
 * The DOM is written only when a value changes, so a frame that is not
 * changing costs nothing per tick.
 */
import type { Sim } from '../sim/sim';
import { FRAME } from '../content/copy';
import { ICON } from './icons';

/** The four watch states the frame can be in, in rising order. */
export type WatchState = 'UNSEEN' | 'SPOTTED' | 'TRACKED' | 'UNDERWATCH';

/** The afternoon's clock starts here; the simulation keeps the seconds. */
const CLOCK_START = 16 * 3600 + 2 * 60;

const pad2 = (n: number): string => String(n).padStart(2, '0');

export class ObservationFrame {
  private el: HTMLElement;
  private rec: HTMLElement;
  private cam: HTMLElement;
  private clock: HTMLElement;
  private sig: HTMLElement;
  private state: HTMLElement;
  private sweep: HTMLElement;

  private lastRec = false;
  private lastCam = '';
  private lastClock = '';
  private lastBars = -1;
  private lastState: WatchState | '' = '';
  /** A job supplies its own level; the story reads the pursuit instead. */
  override: WatchState | null = null;
  private sweepTimer = 0;
  /** A held reading — the match — that outranks the watch state for a few seconds. */
  private held: { label: string; left: number } | null = null;

  /**
   * The system being sure of something: the state tag reads the match and
   * the corners take the colour of certainty, then it hands back.
   */
  hold(label: string, seconds: number): void {
    this.held = { label, left: seconds };
    this.lastState = '';
    this.el.dataset.watch = 'match';
    this.state.textContent = label;
    this.pulse('scan');
  }

  /** 0..1: how hard the system is looking, for the sound of the town. */
  get watchLevel(): number {
    return this.held ? 1 : this.lastState === '' ? 0 : RANK[this.lastState] / 3;
  }

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'frame';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML =
      `<i class="fc tl"></i><i class="fc tr"></i><i class="fc bl"></i><i class="fc br"></i>` +
      `<div class="f-sweep"></div>` +
      `<div class="f-read">` +
        `<span class="f-rec"><i></i>${FRAME.rec}</span>` +
        `<span class="f-cam">${ICON.camera}<b></b></span>` +
        `<span class="f-clock"></span>` +
        `<span class="f-sig"><i></i><i></i><i></i><i></i></span>` +
        `<span class="f-state"></span>` +
      `</div>`;
    host.prepend(this.el);
    this.rec = this.el.querySelector('.f-rec')!;
    this.cam = this.el.querySelector('.f-cam b')!;
    this.clock = this.el.querySelector('.f-clock')!;
    this.sig = this.el.querySelector('.f-sig')!;
    this.state = this.el.querySelector('.f-state')!;
    this.sweep = this.el.querySelector('.f-sweep')!;
  }

  /** Hidden with the rest of the HUD, and while a full-screen sheet is up. */
  setVisible(on: boolean): void { this.el.classList.toggle('hidden', !on); }

  /**
   * One pass of the system reading the picture: a line travels down the
   * glass once. Used when its state changes, never on a loop.
   */
  pulse(kind: 'scan' | 'lost' = 'scan'): void {
    this.sweep.className = 'f-sweep';
    void this.sweep.offsetWidth;
    this.sweep.className = `f-sweep on ${kind}`;
    this.sweepTimer = 0.6;
  }

  update(sim: Sim, dt: number): void {
    if (this.sweepTimer > 0) {
      this.sweepTimer -= dt;
      if (this.sweepTimer <= 0) this.sweep.className = 'f-sweep';
    }

    const sight = sim.playerSightings();
    const rec = sight.ids.length > 0;
    if (rec !== this.lastRec) {
      this.lastRec = rec;
      this.rec.classList.toggle('on', rec);
    }

    const cam = rec ? FRAME.camera(sight.ids[0]) : FRAME.noCamera;
    if (cam !== this.lastCam) {
      this.lastCam = cam;
      this.cam.textContent = cam;
      this.cam.parentElement!.classList.toggle('none', !rec);
    }

    const secs = CLOCK_START + Math.floor(sim.tick / 60);
    const clock = `${pad2(Math.floor(secs / 3600) % 24)}:${pad2(Math.floor(secs / 60) % 60)}:${pad2(secs % 60)}`;
    if (clock !== this.lastClock) {
      this.lastClock = clock;
      this.clock.textContent = clock;
    }

    // Picture quality, in bars: none without a fix, and never all four for
    // a glimpse — the top bar is a camera that has you square on.
    const bars = !rec ? 0 : sight.quality > 0.85 ? 4 : sight.quality > 0.55 ? 3 : sight.quality > 0.25 ? 2 : 1;
    if (bars !== this.lastBars) {
      this.lastBars = bars;
      this.sig.dataset.bars = String(bars);
    }

    if (this.held) {
      this.held.left -= dt;
      if (this.held.left > 0) return;
      this.held = null;
    }
    const state = this.override ?? storyState(sim, rec);
    if (state !== this.lastState) {
      const was = this.lastState;
      this.lastState = state;
      this.el.dataset.watch = state.toLowerCase();
      this.state.textContent = FRAME.state[state];
      // Climbing a rung is the system reading you again; dropping off the
      // top of the ladder is it losing you. Either way, one pass of the line.
      if (was !== '') this.pulse(rank(state) < rank(was) ? 'lost' : 'scan');
      else if (this.el.dataset.watch !== 'unseen') this.pulse('scan');
    }
  }
}

const RANK: Record<WatchState, number> = { UNSEEN: 0, SPOTTED: 1, TRACKED: 2, UNDERWATCH: 3 };
const rank = (s: WatchState): number => RANK[s];

/**
 * The story has no exposure meter; it has the pursuit machine, which is
 * the honest answer to "what is the system doing about me". Being seen with
 * nothing open against you is OBSERVED; a file being worked is TRACKING;
 * something with a live fix on you is the top of the ladder.
 */
function storyState(sim: Sim, observed: boolean): WatchState {
  switch (sim.pursuit) {
    case 'PURSUING': return 'UNDERWATCH';
    case 'ALERT': case 'LOST': case 'SEARCHING': return 'TRACKED';
    default: return observed ? 'SPOTTED' : 'UNSEEN';
  }
}
