/**
 * SAFETRACE™ — entry point.
 *
 * Wires the deterministic simulation to presentation. Nothing in src/sim knows
 * this file exists.
 */
import './ui/styles.css';
// Imported after the base sheet: media queries carry no extra specificity, so
// the mobile overrides only win if they come later in source order.
import './ui/mobile.css';
import { InputManager, emptyIntent, mergeIntent, type Intent } from './core/input';
import { TouchAdapter, TouchEngine, isTouchPrimary } from './core/touch';
import { Loop } from './core/loop';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { buildBellhaven } from './content/bellhaven';
import { validateWorld } from './sim/world';
import { Sim } from './sim/sim';
import { Renderer } from './render/renderer';
import { Audio } from './audio/audio';
import { Hud, availableVerbs } from './ui/hud';
import { Advertisement } from './ui/ad';
import { StoryDirector } from './content/story';
import { VERBS, type HackVerb } from './sim/surveillance/network';
import { dist } from './core/math';

/** How close the player must be to reach into a node, in metres. */
const NODE_REACH = 16;

type Phase = 'prefs' | 'ad' | 'play' | 'reprise';

class Game {
  private settings: Settings = loadSettings();
  private sim: Sim;
  private renderer: Renderer;
  private audio: Audio;
  private hud: Hud;
  private ad: Advertisement;
  private story: StoryDirector;
  private input = new InputManager();
  private touch = new TouchEngine();
  private touchAdapter = new TouchAdapter(this.touch);
  private loop: Loop;
  private touchPrimary = isTouchPrimary();
  private phase: Phase = 'prefs';
  private intent: Intent = emptyIntent();
  private verbKeys = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    const worldData = buildBellhaven();

    // Structural assertions over the shipped town, in dev.
    if (import.meta.env.DEV) {
      for (const issue of validateWorld(worldData)) {
        const log = issue.severity === 'error' ? console.error : console.warn;
        log(`[world] ${issue.severity}: ${issue.message}`);
      }
    }

    this.sim = new Sim(worldData);
    this.renderer = new Renderer(canvas, this.sim, this.settings);
    this.audio = new Audio(this.settings);
    this.hud = new Hud(uiRoot, this.sim, this.settings, this.touchPrimary, (verb, nodeId) => {
      if (this.sim.hack) this.sim.cancelHack();
      else this.sim.startHack(verb, nodeId);
    });
    this.ad = new Advertisement(document.body, this.renderer, this.audio, this.touchPrimary);
    this.story = new StoryDirector({
      sim: this.sim,
      hud: this.hud,
      audio: this.audio,
      renderer: this.renderer,
      playReprise: () => this.playReprise(),
    });

    // Touch is another adapter, not a different game. Keyboard and mouse stay
    // attached so a phone with a keyboard, or a desktop with a touchscreen,
    // both simply work.
    this.input.attach(window);
    this.input.options.holdToAim = this.settings.holdToAim;
    this.input.options.holdForVision = this.settings.holdForVision;
    this.touchAdapter.attach(window);
    this.syncViewport();

    this.bindAudio();
    this.bindKeys();

    const onViewportChange = () => this.syncViewport();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    // Browser chrome sliding in and out changes the usable height without a
    // resize event on iOS, so the visual viewport is the authority.
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.touch.reset(); } else { this.audio.resume(); }
    });
    // iOS suspends the audio context aggressively, and only a real gesture may
    // wake it. Every touch is one.
    window.addEventListener('pointerdown', () => this.audio.resume(), { passive: true });

    this.loop = new Loop({
      fixed: (dt) => this.fixed(dt),
      render: (_alpha, dt) => this.render(dt),
    });

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).safetrace = {
        sim: this.sim, renderer: this.renderer, story: this.story, settings: this.settings,
      };
    }

    this.showPrefs();
  }

  /**
   * One place that owns the relationship between the CSS viewport, the canvas
   * backing store, and the touch zones. Everything downstream measures in CSS
   * pixels, so device pixel ratio never leaks into gameplay.
   */
  private syncViewport(): void {
    this.renderer.resize();
    const cs = getComputedStyle(document.documentElement);
    const inset = (name: string) => parseFloat(cs.getPropertyValue(name)) || 0;
    this.touch.setViewport({
      w: this.renderer.w,
      h: this.renderer.h,
      safe: {
        top: inset('--safe-top'),
        right: inset('--safe-right'),
        bottom: inset('--safe-bottom'),
        left: inset('--safe-left'),
      },
    });
    document.documentElement.classList.toggle('touch', this.touchPrimary);
  }

  // ------------------------------------------------------------------ startup

  /**
   * Not a game menu: a device-level accessibility prompt, dismissed in one
   * keypress. It exists because the sequence about to run is exactly the one
   * these options are for.
   */
  private showPrefs(): void {
    const el = document.createElement('div');
    el.id = 'prefs';
    el.innerHTML = `
      <div class="card">
        <h2>Before you begin</h2>
        <p class="muted">These can be changed at any time.</p>
        <label><input type="checkbox" id="pref-motion"> Reduce motion and flashing</label>
        <label><input type="checkbox" id="pref-colour"> Colour-blind safe palette</label>
        <label><input type="checkbox" id="pref-text"> Larger text</label>
        <div class="go" id="pref-go">Continue</div>
      </div>`;
    document.body.appendChild(el);

    const go = () => {
      this.settings.reduceMotion = (el.querySelector('#pref-motion') as HTMLInputElement).checked;
      this.settings.transitionIntensity = this.settings.reduceMotion ? 0.25 : 1;
      this.settings.colourSafeMachine = (el.querySelector('#pref-colour') as HTMLInputElement).checked;
      this.settings.textScale = (el.querySelector('#pref-text') as HTMLInputElement).checked ? 1.2 : 1;
      document.documentElement.style.setProperty('--text-scale', String(this.settings.textScale));
      saveSettings(this.settings);
      el.classList.add('hidden');
      window.setTimeout(() => el.remove(), 520);
      this.audio.start();
      this.startAd();
    };

    el.querySelector('#pref-go')!.addEventListener('click', go);
    window.addEventListener('keydown', function once(e) {
      if (e.code === 'Enter' || e.code === 'Space') {
        window.removeEventListener('keydown', once);
        go();
      }
    });
  }

  private startAd(): void {
    this.phase = 'ad';
    this.hud.setVisible(false);
    this.loop.start();
    this.ad.play({
      onDone: () => {
        this.phase = 'play';
        this.hud.setVisible(true);
        this.renderer.cam.scripted = null;
      },
    });
  }

  private playReprise(): void {
    this.phase = 'reprise';
    this.hud.setVisible(false);
    this.ad.play({
      reprise: true,
      onDone: () => {
        this.phase = 'play';
        this.hud.setVisible(true);
      },
    });
  }

  // -------------------------------------------------------------------- input

  private bindKeys(): void {
    // Number keys select a verb on the focused node. In-world, in real time,
    // with a drone possibly already on its way.
    for (let i = 1; i <= 6; i++) this.verbKeys.set(`Digit${i}`, i - 1);

    window.addEventListener('keydown', (e) => {
      if (this.phase === 'ad' || this.phase === 'reprise') {
        if (e.code === 'Escape') this.ad.skip();
        return;
      }
      if (e.code === 'F3') {
        this.settings.showDebug = !this.settings.showDebug;
        saveSettings(this.settings);
        return;
      }
      const slot = this.verbKeys.get(e.code);
      if (slot === undefined) return;
      const node = this.sim.focusNode;
      if (!node) return;
      const verbs = availableVerbs(node);
      const verb = verbs[slot] as HackVerb | undefined;
      if (!verb) return;
      if (this.sim.hack) this.sim.cancelHack();
      else this.sim.startHack(verb, node.id);
      e.preventDefault();
    });
  }

  private bindAudio(): void {
    const bus = this.sim.bus;
    bus.on('player:push', () => this.audio.push());
    bus.on('player:pop', () => this.audio.pop());
    bus.on('player:land', ({ speed }) => {
      this.audio.land(Math.min(1, speed / 12));
      this.renderer.kick(0.06 + Math.min(0.1, speed / 120));
    });
    bus.on('player:bail', ({ pos }) => {
      this.audio.bail();
      this.renderer.kick(0.5);
      this.renderer.ripple(pos, 0.6);
    });
    bus.on('player:fire', () => this.audio.fire());
    bus.on('player:collect', () => this.audio.collect());
    bus.on('projectile:impact', ({ kind, pos }) => {
      if (kind === 'cameraLens' || kind === 'drone' || kind === 'junction') this.audio.impactMetal();
      else this.audio.impactSoft();
      this.renderer.ripple(pos, 0.5);
    });
    bus.on('noise:event', ({ pos, label }) => {
      if (label === 'VEHICLE ALARM') this.audio.alarm(); else this.audio.noise();
      this.renderer.ripple(pos, 1.5);
    });
    bus.on('safetrace:message', ({ register }) => {
      // The same three notes in the advertisement and in the moment a unit is
      // routed to intercept you. It is never altered.
      this.audio.motif(register === 'SYSTEM' ? 0.5 : 0.35);
    });
    bus.on('hack:started', () => this.audio.hackTick());
    bus.on('hack:completed', () => this.audio.hackDone());
    bus.on('drone:destabilised', () => { this.audio.impactMetal(); this.renderer.kick(0.3); });
    bus.on('veneer:crack', () => { this.audio.peelIn(); this.renderer.kick(0.25); });
    bus.on('vision:unlocked', () => this.audio.motif(0.8));
    bus.on('patrol:contact', () => this.renderer.kick(0.2));
    bus.on('escalation:changed', ({ to }) => {
      if (to === 'INTERVENTION') this.renderer.kick(0.18);
    });
  }

  // --------------------------------------------------------------------- tick

  private fixed(dt: number): void {
    this.intent = mergeIntent(this.input.sample(), this.touch.sample());
    const tap = this.touch.takeTap();

    if (this.phase === 'ad' || this.phase === 'reprise') {
      // A tap anywhere skips, the same as Escape. The world keeps running
      // underneath the advertisement, because it is the same world.
      if (this.intent.skip) this.ad.skip();
      this.sim.step(dt, emptyIntent(), null);
      return;
    }

    if (tap) this.resolveTap(tap);
    this.sim.step(dt, this.intent, this.aimPoint());
    this.story.update();
  }

  /**
   * Where the player is aiming, in world space.
   *
   * A pointer device names a place. A drawn slingshot names a direction, so the
   * point is projected out from the player along it — which is what the
   * ballistic solver wants either way.
   */
  private aimPoint(): { x: number; y: number } | null {
    const v = this.intent.aimVector;
    if (v) {
      const origin = this.renderer.cam.toScreen(this.sim.player.pos, this.renderer.w, this.renderer.h);
      return this.renderer.screenToWorld({ x: origin.x + v.x * 320, y: origin.y + v.y * 320 });
    }
    return this.intent.pointerActive ? this.renderer.screenToWorld(this.intent.pointer) : null;
  }

  /**
   * A tap in the world is a request to touch a piece of the network. The graph
   * is a place, so reaching into it is a matter of putting a finger on it.
   */
  private resolveTap(screen: { x: number; y: number }): void {
    const world = this.renderer.screenToWorld(screen);
    const node = this.sim.network.nearest(world, 90 / Math.max(1, this.renderer.cam.zoom) + 3);
    if (node && dist(node.pos, this.sim.player.pos) <= NODE_REACH) {
      this.sim.selectNode(node.id);
      this.audio.hackTick();
    } else if (this.sim.hack) {
      this.sim.cancelHack();
    } else {
      this.sim.selectNode(null);
    }
  }

  private render(dt: number): void {
    if (this.phase === 'ad' || this.phase === 'reprise') this.ad.update(dt);
    this.renderer.controlVisual = this.touchPrimary || this.touch.engaged ? this.touch.visual : null;
    this.renderer.render(dt);
    this.hud.update(dt);

    const p = this.sim.player;
    this.audio.update(
      p.speed, this.sim.playerMaxSpeed,
      this.sim.world.surfaceAt(p.pos),
      p.stance !== 'AIR' && p.onBoard,
      this.sim.visionBlend, p.flow,
    );
    this.audio.duck(this.sim.visionBlend);
  }
}

// ---------------------------------------------------------------------- boot

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
const ui = document.getElementById('ui');
if (canvas && ui) {
  new Game(canvas, ui);
} else {
  console.error('SAFETRACE: missing #game canvas or #ui root');
}

export { VERBS };
