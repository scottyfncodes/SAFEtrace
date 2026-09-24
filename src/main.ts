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
import { PerspectiveRenderer } from './render/perspective';
import { Audio } from './audio/audio';
import { Hud, availableVerbs } from './ui/hud';
import { Advertisement } from './ui/ad';
import { StoryDirector } from './content/story';
import { VERBS, type HackVerb } from './sim/surveillance/network';
import { HINTS } from './content/copy';
import { dist, damp } from './core/math';
import { Notebook } from './ui/notebook';
import { Menu } from './ui/menu';
import { EndingCard } from './ui/ending';
import {
  clearAfternoon, loadAfternoon, loadEndingsSeen, recordEndingSeen, saveAfternoon, type SavedAfternoon,
} from './core/save';
import type { EndingId } from './content/case';
import type { StorySnapshot } from './content/story';

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
  /** Where the character is looking while stood still, in world radians. */
  private aimYaw = 0;
  /** Where the thumb has asked them to look. The view eases onto this. */
  private lookTargetYaw = 0;
  private lookTargetPitch = 0.06;
  private loop: Loop;
  private touchPrimary = isTouchPrimary();
  private phase: Phase = 'prefs';
  private intent: Intent = emptyIntent();
  private verbKeys = new Map<string, number>();
  private notebook: Notebook;
  private menu: Menu;
  private ending: EndingCard;
  /** Nothing in Bellhaven happens while the player is reading a menu. */
  private get paused(): boolean { return this.notebook.open || this.menu.open || this.ending.open; }
  private saveDue = 0;

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
    // The world's contextual prompt names the thing the player will actually
    // do, on the device they are actually holding.
    this.renderer.interactVerb = this.touchPrimary ? 'TAP' : 'E';
    this.ad = new Advertisement(document.body, this.renderer, this.audio, this.touchPrimary);
    this.story = new StoryDirector({
      sim: this.sim,
      hud: this.hud,
      audio: this.audio,
      renderer: this.renderer,
      playReprise: (ending) => this.playReprise(ending),
      hint: this.touchPrimary ? HINTS.touch : HINTS.keyboard,
    });

    this.hud.talkHandlers = {
      advance: () => this.story.advance(),
      choose: (id) => this.story.choose(id),
    };
    this.hud.onButton = (which) => {
      if (this.phase !== 'play') return;
      if (which === 'notes') this.openNotebook(); else this.openMenu();
    };
    this.notebook = new Notebook(document.body, this.sim, this.touchPrimary, () => this.resumeFromOverlay(),
      (made) => { if (!made) this.audio.hackTick(); });
    this.menu = new Menu(document.body, this.settings, this.touchPrimary, {
      resume: () => this.resumeFromOverlay(),
      notes: () => this.openNotebook(),
      newAfternoon: () => this.newAfternoon(),
      applySettings: () => this.applySettings(),
    }, loadEndingsSeen);
    this.ending = new EndingCard(document.body, this.sim, {
      keepSkating: () => this.resumeFromOverlay(),
      newAfternoon: () => this.newAfternoon(),
    });

    // Touch is another adapter, not a different game. Keyboard and mouse stay
    // attached so a phone with a keyboard, or a desktop with a touchscreen,
    // both simply work.
    this.input.attach(window);
    this.input.options.holdToAim = this.settings.holdToAim;
    this.input.options.holdForPlanView = this.settings.holdForPlanView;
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
        // The touch layout is geometry, and geometry is worth being able to
        // measure on a real device rather than reasoning about from a diagram.
        touch: this.touch,
      };
    }

    this.bindPersistence();
    document.getElementById('boot')?.remove();
    this.showPrefs();
  }

  // ------------------------------------------------------------- overlays

  private openNotebook(): void {
    if (this.menu.open) this.menu.hide(false);
    this.clearHeldInput();
    this.notebook.show();
    this.audio.hackTick();
  }

  private openMenu(): void {
    if (this.notebook.open) this.notebook.hide();
    this.clearHeldInput();
    this.menu.show();
  }

  private resumeFromOverlay(): void {
    this.touch.reset();
  }

  /** Anything held when a menu opened is let go of; nothing fires on the way back. */
  private clearHeldInput(): void {
    this.touch.reset();
    this.sim.exitAimMode();
  }

  private applySettings(): void {
    document.documentElement.style.setProperty('--text-scale', String(this.settings.textScale));
    this.audio.applySettings();
    saveSettings(this.settings);
  }

  private newAfternoon(): void {
    clearAfternoon();
    window.location.reload();
  }

  // ---------------------------------------------------------- persistence

  /**
   * The afternoon is written down whenever something in it changes — a beat,
   * a note, a decision — and at most every few seconds. Never during the
   * advertisement, which is not the afternoon yet.
   */
  private bindPersistence(): void {
    const mark = () => { if (this.phase === 'play') this.saveDue = Math.max(this.saveDue, 1); };
    this.sim.bus.on('story:beat', mark);
    this.sim.bus.on('case:clue', mark);
    this.sim.bus.on('case:deduction', mark);
    this.sim.bus.on('talk:closed', mark);
    window.addEventListener('pagehide', () => this.persist());
  }

  private persist(): void {
    if (this.phase !== 'play' && this.phase !== 'reprise') return;
    if (this.story.progress.length === 0) return;
    const sim = this.sim;
    const revealed: string[] = [];
    for (const n of sim.network.nodes.values()) if (n.discovered) revealed.push(n.id);
    const s: SavedAfternoon = {
      v: 1,
      savedAt: Date.now(),
      story: this.story.snapshot(),
      casefile: sim.casefile.snapshot(),
      player: { x: sim.player.pos.x, y: sim.player.pos.y, heading: sim.player.heading },
      readNodes: [...sim.readNodes],
      discoveredNodes: [...sim.discoveredNodes],
      revealed,
      priorContacts: sim.playerSubject.priorContacts,
      label: this.progressLabel(),
    };
    saveAfternoon(s);
  }

  private progressLabel(): string {
    const st = this.story.state;
    if (st.report) return 'After the decision';
    if (st.devonReleasedAt > 0 && this.sim.tick >= st.devonReleasedAt) return `Investigating · ${this.sim.casefile.clues.size} notes`;
    if (st.devonReleasedAt > 0) return 'Devon is being stopped';
    if (st.matchFiredAt > 0) return 'After the match';
    if (st.metDevonAt > 0) return 'With Devon';
    return 'Maple Court';
  }

  private restore(save: SavedAfternoon): void {
    const sim = this.sim;
    sim.player.pos = { x: save.player.x, y: save.player.y };
    sim.player.heading = save.player.heading;
    sim.player.vel = { x: 0, y: 0 };
    sim.player.speed = 0;
    for (const id of save.readNodes) sim.readNodes.add(id);
    for (const id of save.discoveredNodes) sim.discoveredNodes.add(id);
    for (const id of save.revealed) { const n = sim.network.get(id); if (n) n.discovered = true; }
    sim.playerSubject.priorContacts = save.priorContacts;
    sim.casefile.restore(save.casefile);
    this.story.restore(save.story as StorySnapshot);
    if (sim.devonFollowing && sim.devonVisible) {
      sim.devonPos = { x: sim.player.pos.x - Math.cos(sim.player.heading) * 5.5, y: sim.player.pos.y - Math.sin(sim.player.heading) * 5.5 };
    }
    this.renderer.chase.reset(sim);
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
    const safe = {
      top: inset('--safe-top'),
      right: inset('--safe-right'),
      bottom: inset('--safe-bottom'),
      left: inset('--safe-left'),
    };
    this.touch.setViewport({ w: this.renderer.w, h: this.renderer.h, safe });
    // The canvas draws its own controls and its own frame, so it needs the
    // same insets the stylesheet gives the DOM layer.
    this.renderer.safe = safe;
    this.publishControlBox();
    document.documentElement.classList.toggle('touch', this.touchPrimary);
  }

  /**
   * Tell the stylesheet where the thumbs are.
   *
   * The controls are drawn on the canvas and the panels are DOM, so the two
   * layers had no way to know about each other — and they collided. On a
   * 375x629 phone the node panel's own touch surface sat exactly on top of the
   * PLAN button and swallowed every press of it, which is invisible on a
   * desktop viewport and total on a phone.
   *
   * Publishing the cluster's bounding box as custom properties makes the touch
   * layout the single source of truth for both layers: move a button in
   * `TOUCH_TUNING` and the panels move out of its way on their own.
   */
  private publishControlBox(): void {
    const style = document.documentElement.style;
    if (!this.touchPrimary) {
      style.setProperty('--control-right', '0px');
      style.setProperty('--control-top', '0px');
      style.setProperty('--pad-right', '0px');
      return;
    }
    let left = Infinity;
    let top = Infinity;
    for (const b of this.touch.buttonLayout()) {
      left = Math.min(left, b.pos.x - b.hit);
      top = Math.min(top, b.pos.y - b.hit);
    }
    // Measured inward from the right and bottom edges, which is how the CSS
    // wants to think about it, plus a little air.
    style.setProperty('--control-right', `${Math.max(0, Math.round(this.renderer.w - left)) + 10}px`);
    style.setProperty('--control-top', `${Math.max(0, Math.round(this.renderer.h - top)) + 10}px`);
    style.setProperty('--pad-right', `${Math.round(this.touch.padRight())}px`);
  }

  // ------------------------------------------------------------------ startup

  /**
   * Not a game menu: a device-level accessibility prompt, dismissed in one
   * keypress. It exists because the sequence about to run is exactly the one
   * these options are for.
   */
  private showPrefs(): void {
    const saved = loadAfternoon();
    const el = document.createElement('div');
    el.id = 'prefs';
    el.innerHTML = `
      <div class="card">
        <h2>Before you begin</h2>
        <p class="muted">These can be changed at any time.</p>
        <label><input type="checkbox" id="pref-motion"> Reduce motion and flashing</label>
        <label><input type="checkbox" id="pref-colour"> Colour-blind safe palette</label>
        <label><input type="checkbox" id="pref-text"> Larger text</label>
        ${saved
          ? `<div class="go" id="pref-continue">Continue the afternoon<small>${saved.label}</small></div>
             <div class="go quiet" id="pref-go">Start a new afternoon</div>`
          : '<div class="go" id="pref-go">Continue</div>'}
      </div>`;
    document.body.appendChild(el);
    (el.querySelector('#pref-motion') as HTMLInputElement).checked = this.settings.reduceMotion;
    (el.querySelector('#pref-colour') as HTMLInputElement).checked = this.settings.colourSafeMachine;
    (el.querySelector('#pref-text') as HTMLInputElement).checked = this.settings.textScale > 1;

    let gone = false;
    const go = (resume: boolean) => {
      if (gone) return;
      gone = true;
      this.settings.reduceMotion = (el.querySelector('#pref-motion') as HTMLInputElement).checked;
      this.settings.transitionIntensity = this.settings.reduceMotion ? 0.25 : 1;
      this.settings.colourSafeMachine = (el.querySelector('#pref-colour') as HTMLInputElement).checked;
      this.settings.textScale = (el.querySelector('#pref-text') as HTMLInputElement).checked ? 1.2 : 1;
      document.documentElement.style.setProperty('--text-scale', String(this.settings.textScale));
      saveSettings(this.settings);
      el.classList.add('hidden');
      window.setTimeout(() => el.remove(), 520);
      this.audio.start();
      if (resume && saved) {
        this.restore(saved);
        this.startPlay();
      } else {
        if (saved) clearAfternoon();
        this.startAd();
      }
    };

    el.querySelector('#pref-go')!.addEventListener('click', () => go(false));
    el.querySelector('#pref-continue')?.addEventListener('click', () => go(true));
    window.addEventListener('keydown', function once(e) {
      if (e.code === 'Enter' || e.code === 'Space') {
        window.removeEventListener('keydown', once);
        go(!!saved);
      }
    });
  }

  /**
   * Nothing half-done survives a change of mode.
   *
   * The advertisement and its reprise take the screen while the world keeps
   * running underneath. A sling still drawn, a node panel still open or an
   * interference still counting down would all be waiting on the other side —
   * a screen the player did not open, on a frame they did not ask for. Every
   * transition goes through here, so there is one place this is true.
   */
  private clearTransientState(): void {
    this.sim.exitAimMode();
    this.sim.dismissFocus();
    this.touch.reset();
    this.touch.setAiming(false);
    this.hud.clearSay();
  }

  private startAd(): void {
    this.phase = 'ad';
    this.clearTransientState();
    this.hud.setVisible(false);
    this.loop.start();
    this.ad.play({
      onDone: () => {
        this.phase = 'play';
        this.hud.setVisible(true);
        this.renderer.cam.scripted = null;
        // The story's clock starts now. The world has been running underneath
        // the advertisement for half a minute, and a player who watched it all
        // the way through must still get the same afternoon as one who skipped.
        this.story.begin();
      },
    });
  }

  /** Straight into the afternoon, for a player coming back to one. */
  private startPlay(): void {
    this.phase = 'play';
    this.hud.setVisible(true);
    this.renderer.cam.scripted = null;
    this.loop.start();
  }

  private playReprise(ending?: EndingId): void {
    this.phase = 'reprise';
    this.clearTransientState();
    this.sim.disengage();
    this.hud.setVisible(false);
    this.ad.play({
      reprise: true,
      onDone: () => {
        this.phase = 'play';
        this.hud.setVisible(true);
        if (ending) {
          this.persist();
          this.ending.show(ending, recordEndingSeen(ending));
        }
      },
    });
  }

  // -------------------------------------------------------------------- input

  private bindKeys(): void {
    // Number keys select a verb on the focused node. In-world, in real time,
    // with a drone possibly already on its way.
    for (let i = 1; i <= 9; i++) this.verbKeys.set(`Digit${i}`, i - 1);

    window.addEventListener('keydown', (e) => {
      if (this.phase === 'ad' || this.phase === 'reprise') {
        if (e.code === 'Escape') this.ad.skip();
        return;
      }
      if (this.phase !== 'play') return;
      if (this.ending.open) return;
      if (this.notebook.key(e.code) || this.menu.key(e.code)) { e.preventDefault(); return; }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.sim.aimMode) { this.sim.exitAimMode(); return; }
        if (this.sim.engagedWith) { this.sim.disengage(); return; }
        if (this.sim.focusNode) { this.sim.dismissFocus(); return; }
        this.openMenu();
        return;
      }
      if (e.code === 'KeyN' || e.code === 'Tab') { e.preventDefault(); this.openNotebook(); return; }
      // In a conversation, the digits answer.
      if (this.sim.engagedWith) {
        const choices = this.hud.talkChoices;
        const i = this.verbKeys.get(e.code);
        if (i !== undefined && choices[i]) { this.story.choose(choices[i]); e.preventDefault(); }
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
      if (verb) {
        if (this.sim.hack) this.sim.cancelHack();
        else this.sim.startHack(verb, node.id);
        e.preventDefault();
        return;
      }
      // Past the verbs, the digits walk the records already traced.
      const traced = this.sim.reachableServices().filter((s) => s.id !== node.id);
      const jump = traced[slot - verbs.length];
      if (jump) {
        this.sim.selectNode(jump.id);
        this.audio.hackTick();
        e.preventDefault();
      }
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
    bus.on('sensor:noticed', () => this.audio.servo());
    bus.on('hack:started', () => this.audio.hackTick());
    bus.on('hack:completed', () => this.audio.hackDone());
    bus.on('drone:destabilised', () => { this.audio.impactMetal(); this.renderer.kick(0.3); });
    bus.on('veneer:crack', () => { this.audio.peelIn(); this.renderer.kick(0.25); });
    bus.on('vision:unlocked', () => this.audio.motif(0.8));
    bus.on('case:clue', () => this.audio.clue());
    bus.on('case:deduction', () => this.audio.deduction());
    bus.on('talk:open', () => this.audio.talkBlip());
    bus.on('talk:advance', () => this.audio.talkBlip());
    // Caught it: a sound, and nothing written on the screen about it.
    bus.on('player:trick', () => this.audio.land(0.6));
    bus.on('player:grab', () => this.audio.land(0.6));
    bus.on('aim:entered', () => {
      // Start looking where the character already faces, so the transition
      // never spins the world.
      this.aimYaw = this.sim.player.speed > 0.4
        ? Math.atan2(this.sim.player.vel.y, this.sim.player.vel.x)
        : this.sim.player.heading;
      this.lookTargetYaw = this.aimYaw;
      // Start on the street rather than the sky: a long lens puts the horizon
      // low in the frame, and a reticle above it is aimed at nothing.
      this.lookTargetPitch = -0.07;
      this.sim.lookPitch = -0.07;
      this.audio.hackTick();
    });
    bus.on('aim:exited', () => this.audio.hackTick());
    bus.on('patrol:contact', () => this.renderer.kick(0.2));
    bus.on('escalation:changed', ({ to }) => {
      if (to === 'INTERVENTION') this.renderer.kick(0.18);
    });
  }

  // --------------------------------------------------------------------- tick

  private fixed(dt: number): void {
    if (this.paused) {
      // Drain input so nothing held across the pause fires on the way back.
      this.input.sample(); this.touch.sample(); this.touch.takeTap();
      return;
    }
    if (this.saveDue > 0) {
      this.saveDue -= dt;
      if (this.saveDue <= 0) { this.saveDue = 0; this.persist(); }
    }
    this.intent = mergeIntent(this.input.sample(), this.touch.sample());
    const tap = this.touch.takeTap();

    if (this.phase === 'ad' || this.phase === 'reprise') {
      // A tap anywhere skips, the same as Escape. The world keeps running
      // underneath the advertisement, because it is the same world.
      if (this.intent.skip) this.ad.skip();
      this.sim.step(dt, emptyIntent(), null);
      return;
    }

    // Aiming has its own vocabulary, so the engine is told which one is live.
    this.touch.setAiming(this.sim.aimMode);
    this.touch.setSlingAvailable(!this.sim.hack);

    if (this.sim.aimMode) {
      /*
       * The left thumb drags the slingshot, and the sling goes exactly that
       * far. No rate, no ramp, no ceiling.
       *
       * The drag arrives already converted to radians and already consumed —
       * every pixel the thumb travelled since the last frame, counted once —
       * so a pointer stream that arrives in bursts, as a phone's does, sums to
       * the same sweep as one that arrives evenly. The remaining damp is a
       * frame of smoothing on top of that, small enough that the sling stops
       * when the thumb does.
       */
      const drag = this.touch.takeAimDrag();
      this.lookTargetYaw += drag.yaw;
      this.lookTargetPitch = PerspectiveRenderer.clampPitch(this.lookTargetPitch + drag.pitch);
      this.aimYaw = damp(this.aimYaw, this.lookTargetYaw, 0.012, dt);
      this.sim.lookPitch = damp(this.sim.lookPitch, this.lookTargetPitch, 0.012, dt);
      this.sim.step(dt, this.intent, this.aimTargetPoint());
      this.story.update();
      return;
    }

    if (tap) this.resolveTap(tap);
    this.orientMove();
    this.sim.step(dt, this.intent, this.aimPoint());
    this.story.update();
  }

  /**
   * Turn the thumb's screen direction into a world direction.
   *
   * With a camera bolted overhead these were the same thing. Behind a rider who
   * turns, they are not: pushing the stick up has to mean "the way I am facing"
   * or the control fights the camera every time the road bends. The rotation
   * lives here, in the composition root, because it is a fact about the camera
   * and the simulation must not know cameras exist.
   */
  private orientMove(): void {
    const mv = this.intent.moveVector;
    if (!mv) return;
    // Screen-up is -y; the camera's forward is its yaw.
    const yaw = this.renderer.chase.yaw + Math.PI / 2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    this.intent.moveVector = { x: mv.x * c - mv.y * s, y: mv.x * s + mv.y * c };
  }

  /**
   * Where the character is pointing while stood still: straight out along the
   * look, far enough that the ballistic solver can find whatever is on that
   * line. The reticle is fixed to the middle of the view, so this is simply
   * "in front of me".
   */
  private aimTargetPoint(): { x: number; y: number } {
    const p = this.sim.aimAnchor ?? this.sim.player.pos;
    // Exactly where the left thumb has put it, and nothing else. The hand on
    // the sling contributes tension and a release, never a direction.
    const yaw = this.aimYaw;
    return { x: p.x + Math.cos(yaw) * 34, y: p.y + Math.sin(yaw) * 34 };
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
    // A tap while talking is the next line; a tap with somebody or something
    // in reach is stopping to attend to it. The same rule as the E key.
    if (this.sim.engagedWith) { if (!this.hud.talkChoices.length) this.story.advance(); return; }
    if (this.sim.interest) { this.sim.engageInterest(); this.audio.hackTick(); return; }
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
    // The fork sits here for the whole time a shot is being lined up, not
    // wherever the aim thumb currently is — see drawSlingInHands for why.
    this.renderer.slingRest = this.touch.slingRestPoint();
    // The hint retires itself the moment the player has travelled a board's
    // length or two under their own power. Nobody needs to be told twice.
    this.renderer.showControlHome = this.touchPrimary && this.sim.player.odometer < 12;
    // Whoever the player is talking to is in the shot with them.
    const e = this.sim.engagedWith;
    this.renderer.chase.focus = e
      ? (e.kind === 'person' ? (e.id === 'devon' ? this.sim.devonPos : this.sim.person(e.id)?.pos ?? e.pos) : e.pos)
      : null;
    this.renderer.render(dt);
    this.hud.update(dt);

    const p = this.sim.player;
    this.audio.update(
      p.speed, this.sim.playerMaxSpeed,
      this.sim.world.surfaceAt(p.pos),
      p.stance !== 'AIR' && p.onBoard,
      this.sim.planViewBlend, p.flow,
    );
    this.audio.duck(this.paused ? 0.75 : this.sim.planViewBlend);
    const d = this.sim.world.districtAt(p.pos)?.id ?? '';
    const inChannel = this.sim.world.surfaceAt(p.pos) === 'smoothConcrete' && d === 'channel' && p.pos.y > 395;
    this.audio.setPlace(inChannel ? 'channel' : d, dt);
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
