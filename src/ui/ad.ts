/**
 * The opening advertisement.
 *
 * It is not a video and it is not a title screen. It is the game's own renderer
 * performing an advertisement, in the real Bellhaven, with a scripted camera —
 * so the final shot of the ad is the first frame of play, with no cut.
 *
 * The reprise later is the same script, the same music, the same words, with
 * annotations. The advertisement has not changed. The player has.
 */
import { easeInOutCubic } from '../core/math';
import type { Renderer } from '../render/renderer';
import type { Audio } from '../audio/audio';
import { AD_SCRIPT, AD_REPRISE_ANNOTATIONS, type AdBeat } from '../content/copy';
import type { Sim } from '../sim/sim';

const MARK = `
<svg class="mark" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1.5" y="1.5" width="61" height="61" rx="17" stroke="white" stroke-opacity="0.85" stroke-width="2.4"/>
  <circle cx="32" cy="43" r="3.4" fill="white"/>
  <path d="M20 36c3.2-4.6 7.2-7 12-7s8.8 2.4 12 7" stroke="white" stroke-width="2.6" stroke-linecap="round" opacity="0.9"/>
  <path d="M13.5 27.5C18.6 20 24.9 16 32 16s13.4 4 18.5 11.5" stroke="white" stroke-width="2.6" stroke-linecap="round" opacity="0.6"/>
</svg>`;

const WORDMARK = '<b>SAFE</b><span>trace</span><sup>™</sup>';

export class Advertisement {
  private el: HTMLElement;
  private beat = 0;
  private t = 0;
  private running = false;
  private done = false;
  private reprise = false;
  private script: AdBeat[] = AD_SCRIPT;
  private onDone: (() => void) | null = null;

  constructor(
    host: HTMLElement,
    private renderer: Renderer,
    private sim: Sim,
    private audio: Audio,
  ) {
    this.el = document.createElement('div');
    this.el.id = 'ad';
    this.el.className = 'hidden';
    host.appendChild(this.el);
  }

  play(opts: { reprise?: boolean; onDone?: () => void } = {}): void {
    this.reprise = opts.reprise ?? false;
    this.onDone = opts.onDone ?? null;
    this.beat = 0;
    this.t = 0;
    this.running = true;
    this.done = false;
    this.el.classList.remove('hidden');
    this.renderer.cam.scripted = {
      pos: { x: this.script[0].look.x, y: this.script[0].look.y },
      zoom: this.script[0].look.zoom,
    };
    this.renderer.cam.pos = { ...this.renderer.cam.scripted.pos };
    this.renderer.cam.zoom = this.script[0].look.zoom;
    this.renderBeat();
  }

  get active(): boolean { return this.running; }

  skip(): void { if (this.running) this.finish(); }

  update(dt: number): void {
    if (!this.running) return;
    this.t += dt;
    const beat = this.script[this.beat];
    if (!beat) { this.finish(); return; }

    // Slow drift within a beat, so every shot is moving. Nothing in this
    // advertisement is ever still, because stillness looks like surveillance.
    const k = easeInOutCubic(Math.min(1, this.t / beat.seconds));
    const drift = 1 - k * 0.06;
    this.renderer.cam.scripted = {
      pos: { x: beat.look.x + k * 6, y: beat.look.y - k * 3 },
      zoom: beat.look.zoom * drift,
    };

    // The reprise runs with machine vision held open the whole way.
    if (this.reprise) {
      this.sim.visionBlend = Math.min(1, this.sim.visionBlend + dt * 1.6);
    }

    if (this.t >= beat.seconds) {
      this.beat++;
      this.t = 0;
      if (this.beat >= this.script.length) { this.finish(); return; }
      this.renderBeat();
    }
  }

  private renderBeat(): void {
    const beat = this.script[this.beat];
    if (!beat) return;

    if (beat.wordmark) {
      this.audio.motif(1);
      this.el.innerHTML = `
        <div class="centre">
          ${MARK}
          <div class="brandmark">${WORDMARK}</div>
          <div class="tagline">Nothing should go unseen.</div>
          ${this.annotation()}
        </div>
        <div class="skip">Esc to skip</div>`;
      return;
    }

    if (beat.title) {
      this.el.innerHTML = `
        <div class="centre">
          <div class="titlecard">SAFETRACE<sup>™</sup></div>
        </div>`;
      return;
    }

    this.el.innerHTML = `
      <div class="copy">
        <h1>${beat.headline ?? ''}</h1>
        <p>${beat.sub ?? ''}</p>
        ${this.annotation()}
      </div>
      <div class="skip">Esc to skip</div>`;
  }

  /**
   * On the reprise the words do not change. Only a line of the system's own
   * bookkeeping is added underneath, and that is enough.
   */
  private annotation(): string {
    if (!this.reprise) return '';
    const a = AD_REPRISE_ANNOTATIONS[this.beat];
    return a ? `<div class="annotation">${a}</div>` : '';
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.running = false;
    this.el.classList.add('hidden');
    this.renderer.cam.scripted = null;
    this.onDone?.();
  }
}
