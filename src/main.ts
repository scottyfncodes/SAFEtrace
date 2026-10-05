/**
 * UNDERWATCH — entry point.
 *
 * Wires the deterministic simulation to presentation. Nothing in src/sim knows
 * this file exists.
 */
import './ui/styles.css';
// Imported after the base sheet: media queries carry no extra specificity, so
// the mobile overrides only win if they come later in source order.
import './ui/mobile.css';
import './ui/jobs.css';
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
import { HINTS, PHONE, SYSTEM } from './content/copy';
import { riskLabel } from './sim/surveillance/risk';
import { dist, damp } from './core/math';
import { Notebook } from './ui/notebook';
import { Menu } from './ui/menu';
import { EndingCard } from './ui/ending';
import {
  clearAfternoon, loadAfternoon, loadEndingsSeen, recordEndingSeen, saveAfternoon, type SavedAfternoon,
} from './core/save';
import type { EndingId } from './content/case';
import type { StorySnapshot } from './content/story';
import { JOBS } from './content/jobs';
import { FRAME, JOB } from './content/copy';
import { JobRun } from './sim/jobs/run';
import { applyCondition, camerasDown, conditionFor, dayIndex, type Condition } from './sim/jobs/conditions';
import type { JobDef } from './sim/jobs/types';
import { JobBoard, JobHud, JobResults, repOf } from './ui/jobs';
import { PERKS, kitFor } from './sim/jobs/kit';
import { loadJobRecords, loadTrouble, recordJobRun, saveTrouble } from './core/save';
import { Trouble } from './sim/trouble';
import { BustedCard, LEVEL_CALL, MOM_RETURNS, TroubleHud, YELPS } from './ui/trouble';

/**
 * How far a pull reaches along the ground, from a flick to all the way back.
 * Finer at the short end, where picking out one bin from the next matters.
 */
const THROW_NEAR = 3;
const THROW_FAR = 90;

/** Radians of look per pixel of mouse travel while the sling is up. */
const MOUSE_YAW = 0.0026;
const MOUSE_PITCH = 0.0021;

/** How close the player must be to reach into a node, in metres. */
const NODE_REACH = 16;

type Phase = 'prefs' | 'ad' | 'play' | 'reprise';

/** Set once this browser has thrown a stone: the sling lesson never shows again. */
const SLING_TAUGHT_KEY = 'underwatch.slingTaught.v1';
const slingTaught = (): boolean => { try { return localStorage.getItem(SLING_TAUGHT_KEY) === '1'; } catch { return false; } };

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
  private get paused(): boolean {
    return this.notebook.open || this.menu.open || this.ending.open || this.board.open || this.results.open || this.busted.open;
  }
  /**
   * What is being played: the afternoon (the story), or jobs. The same town,
   * the same board; jobs simply leave the story out.
   */
  private mode: 'story' | 'jobs' = 'story';
  private run: JobRun | null = null;
  /** Whether something has the rider in a job, as last written to the document. */
  private hudBusy = false;
  /** Which day it is in the player's calendar, and so which conditions the board has today. */
  private readonly day = (() => { const d = new Date(); return dayIndex(d.getFullYear(), d.getMonth(), d.getDate()); })();
  private readonly condition: Condition = conditionFor(this.day);
  /** Heat, police, and being grounded: jobs and free skate only. */
  private trouble: Trouble | null = null;
  private troubleHud!: TroubleHud;
  private busted!: BustedCard;
  private troubleSaveIn = 0;
  private board!: JobBoard;
  private jobHud!: JobHud;
  private results!: JobResults;
  /** Seconds after a job is done before the result comes up: let the landing land. */
  private resultIn = -1;
  /** Seconds to the next scrape while grinding. */
  private scrapeIn = 0;
  private saveDue = 0;
  /** The pin the player put on the plan, and who and what they have met. */
  private waypoint: { x: number; y: number } | null = null;
  private metPeople = new Set<string>();
  private seenPlaces = new Set<string>();
  /** Desktop map dragging, in the plan. */
  private mapDrag: { x: number; y: number; moved: number } | null = null;
  /** Whether the plan was open last tick, so the first opening can be noticed. */
  private planWasOpen = false;

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
    this.renderer.controls.teachSling = this.touchPrimary && !slingTaught();
    this.audio = new Audio(this.settings);
    this.hud = new Hud(uiRoot, this.sim, this.settings, this.touchPrimary, (verb, nodeId) => {
      if (this.sim.hack) this.sim.cancelHack();
      else this.sim.startHack(verb, nodeId);
    });
    // The world's contextual prompt names the thing the player will actually
    // do, on the device they are actually holding.
    this.renderer.interactVerb = this.touchPrimary ? 'TAP' : 'E';
    this.renderer.touchHints = this.touchPrimary;
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
      if (which === 'notes') { if (this.mode === 'jobs') this.openBoard(); else this.openNotebook(); }
      else this.openMenu();
    };
    this.notebook = new Notebook(document.body, this.sim, this.touchPrimary, () => this.resumeFromOverlay(),
      (made) => { if (!made) this.audio.hackTick(); });
    this.menu = new Menu(document.body, this.settings, this.touchPrimary, {
      resume: () => this.resumeFromOverlay(),
      notes: () => this.openNotebook(),
      newAfternoon: () => this.newAfternoon(),
      applySettings: () => this.applySettings(),
      jobs: {
        active: () => this.mode === 'jobs',
        restart: () => { if (this.run) this.startJob(this.run.def); },
        board: () => this.openBoard(),
      },
    }, loadEndingsSeen);
    this.board = new JobBoard(document.body, this.touchPrimary, {
      start: (def) => this.startJob(def),
      story: () => this.leaveForStory(),
      close: () => this.resumeFromOverlay(),
    }, loadJobRecords, () => this.run !== null || this.phase === 'play');
    this.board.today = { condition: this.condition, down: camerasDown(this.sim, this.condition, this.day, JOBS).length };
    this.jobHud = new JobHud(uiRoot);
    this.jobHud.condition = this.condition.id === 'CLEAR' ? null : JOB.condition[this.condition.id].name;
    this.troubleHud = new TroubleHud(uiRoot);
    this.busted = new BustedCard(document.body, this.touchPrimary);
    this.results = new JobResults(document.body, this.touchPrimary, {
      retry: () => { if (this.run) this.startJob(this.run.def); },
      next: () => {
        const at = this.run ? JOBS.indexOf(this.run.def) : -1;
        const nxt = JOBS[at + 1];
        if (nxt) this.board.show(nxt); else this.board.show();
      },
      board: () => this.board.show(),
    });
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
    this.touch.setThrowMode(!this.settings.classicSling);
    this.touchAdapter.attach(window);
    this.syncViewport();

    this.bindAudio();
    this.bindKeys();
    this.bindMap();

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
      (window as unknown as Record<string, unknown>).underwatch = {
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

  // ------------------------------------------------------------- the plan

  /** Put the plan away, on every device at once. */
  private closePlan(): void {
    this.touch.setPlanOpen(false);
    this.input.setPlanOpen(false);
  }

  /** Put a pin on the map, or take it off if the tap was on the pin. */
  private markAt(world: { x: number; y: number }): void {
    const wp = this.waypoint;
    const pickUp = wp && dist(wp, world) < 34 / Math.max(1, this.renderer.cam.zoom) + 3;
    this.waypoint = pickUp ? null : { x: world.x, y: world.y };
    this.renderer.waypoint = this.waypoint;
    this.renderer.waypointLabel = null;
    this.audio.hackTick();
  }

  /**
   * The plan on a desktop: click to pin, drag to look around, wheel to zoom.
   * The same three things a thumb does, with the thing a mouse has instead.
   */
  private bindMap(): void {
    const canvas = document.getElementById('game');
    if (!canvas) return;
    const inPlan = () => this.phase === 'play' && this.sim.planViewActive && !this.sim.aimMode;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !inPlan()) return;
      this.mapDrag = { x: e.clientX, y: e.clientY, moved: 0 };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.mapDrag || e.pointerType !== 'mouse') return;
      const dx = e.clientX - this.mapDrag.x, dy = e.clientY - this.mapDrag.y;
      this.mapDrag.moved += Math.hypot(dx, dy);
      this.mapDrag.x = e.clientX; this.mapDrag.y = e.clientY;
      if (this.mapDrag.moved > 6) this.renderer.cam.panBy(dx, dy);
    });
    window.addEventListener('pointerup', (e) => {
      if (!this.mapDrag || e.pointerType !== 'mouse') return;
      const d = this.mapDrag;
      this.mapDrag = null;
      if (d.moved <= 6 && inPlan()) this.markAt(this.renderer.screenToWorld({ x: e.clientX, y: e.clientY }));
    });
    canvas.addEventListener('wheel', (e) => {
      if (!inPlan()) return;
      e.preventDefault();
      const cam = this.renderer.cam;
      cam.planZoom = Math.max(0.3, Math.min(3.2, cam.planZoom * Math.exp(-e.deltaY * 0.0015)));
    }, { passive: false });
  }

  // ------------------------------------------------------------- overlays

  private openNotebook(): void {
    this.closePlan();
    if (this.menu.open) this.menu.hide(false);
    this.clearHeldInput();
    this.notebook.show();
    this.audio.hackTick();
  }

  private openMenu(): void {
    this.closePlan();
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
    this.touch.setThrowMode(!this.settings.classicSling);
    document.documentElement.style.setProperty('--text-scale', String(this.settings.textScale));
    document.documentElement.classList.toggle('reduce-motion', this.settings.reduceMotion);
    this.audio.applySettings();
    saveSettings(this.settings);
  }

  /** Set once the player has asked to forget this afternoon; nothing may save it again. */
  private discarding = false;

  private newAfternoon(): void {
    // The reload fires pagehide, which would otherwise write this afternoon
    // straight back and offer it to "continue" on the very next screen.
    this.discarding = true;
    clearAfternoon();
    window.location.reload();
  }

  // ----------------------------------------------------------------- jobs

  /**
   * Into jobs: the same town with the story left out. Nobody stops you for a
   * conversation, the plan shows every camera (finding a route is the job),
   * and the board comes up first.
   */
  private startJobs(): void {
    this.mode = 'jobs';
    this.sim.storyActive = false;
    this.sim.visionUnlocked = true;
    this.trouble = new Trouble(this.sim, loadTrouble());
    this.hud.setJobsMode(true);
    document.documentElement.classList.add('jobs-mode');
    document.documentElement.classList.toggle('hints-retired', Object.keys(loadJobRecords()).length > 0);
    this.phase = 'play';
    this.hud.setVisible(true);
    this.renderer.cam.scripted = null;
    this.renderer.chase.reset(this.sim);
    this.loop.start();
    this.board.show();
  }

  private openBoard(): void {
    this.closePlan();
    if (this.menu.open) this.menu.hide(false);
    this.clearHeldInput();
    this.board.show();
  }

  /** A job, from the top: a fresh street, the rider at the start, the clock at zero. */
  private startJob(def: JobDef): void {
    this.board.hide();
    this.results.hide();
    this.run?.dispose();
    this.clearTransientState();
    this.trouble?.reset();
    // The kit is what the records have earned so far.
    this.sim.kit = kitFor(repOf(loadJobRecords()));
    this.run = new JobRun(this.sim, def, JOB.run);
    // Today's street: the light, and which cameras are down for the day.
    applyCondition(this.sim, this.condition, this.day, JOBS);
    this.renderer.moodBias = this.condition.daylight < 1 ? (1 - this.condition.daylight) * 0.7 : 0;
    this.resultIn = -1;
    this.renderer.chase.reset(this.sim);
    this.jobHud.setVisible(true);
    this.syncJobPin();
    this.audio.clue();
  }

  /** The pin follows the job: always the nearest thing still to do. */
  private syncJobPin(): void {
    const r = this.run;
    const next = r && r.status === 'running' ? r.nextPoint() : null;
    this.waypoint = next ? { x: next.pos.x, y: next.pos.y } : null;
    this.renderer.waypoint = this.waypoint;
    this.renderer.waypointLabel = next ? next.label : null;
  }

  private stepJob(dt: number): void {
    const r = this.run;
    if (!r) return;
    r.step(dt);
    for (const c of r.takeCallouts()) {
      this.jobHud.say(c);
      if (c.tone === 'alarm') this.audio.motif(0.7);
      else if (c.tone === 'warn') this.audio.servo();
      else if (c.tone === 'good') this.audio.clue();
    }
    this.syncJobPin();
    if (r.status === 'complete') {
      if (this.resultIn < 0) this.resultIn = 1.1;
      this.resultIn -= dt;
      if (this.resultIn <= 0 && !this.results.open && r.result) {
        this.resultIn = Infinity;
        const res = r.result;
        const repBefore = repOf(loadJobRecords());
        const { record, bests } = recordJobRun(r.def.id, {
          total: res.total, grade: res.grade, time: res.time, style: res.style,
          exposure: res.exposure, flow: res.flow, ghost: res.ghost,
        });
        this.clearHeldInput();
        document.documentElement.classList.add('hints-retired');
        this.results.show(r.def, res, record, bests, JOBS.indexOf(r.def) < JOBS.length - 1, {
          grinds: r.tally.grinds, tricks: r.tally.tricks, airs: r.tally.airs, bestChain: r.tally.bestChain,
        }, PERKS.filter((p) => p.rep > repBefore && p.rep <= repOf(loadJobRecords())));
        this.audio.hackDone();
      }
    }
  }

  /** Heat, the chase, and being caught. */
  private stepTrouble(dt: number): void {
    const t = this.trouble;
    if (!t) return;
    t.step(dt);
    for (const n of t.takeNotes()) {
      if (n.kind === 'level' && (n.up || n.level === 0)) {
        this.jobHud.say(LEVEL_CALL[n.level]);
        if (n.level >= 3) this.audio.motif(0.8); else this.audio.servo();
      } else if (n.kind === 'busted') {
        // A job does not survive being walked home.
        if (this.run) { this.run.dispose(); this.run = null; this.jobHud.setVisible(false); this.syncJobPin(); }
        this.clearHeldInput();
        this.touch.setSlingOut(false);
        this.renderer.chase.reset(this.sim);
        this.audio.motif(1);
        this.busted.show(n.seconds, n.busts, () => this.resumeFromOverlay());
        saveTrouble(t.save());
      } else if (n.kind === 'returned') {
        this.jobHud.say({ text: MOM_RETURNS, tone: 'good' });
        this.audio.hackDone();
        saveTrouble(t.save());
      }
    }
    this.troubleSaveIn -= dt;
    if (this.troubleSaveIn <= 0) { this.troubleSaveIn = 3; saveTrouble(t.save()); }
  }

  /** From the board to the story: a clean page, the way the afternoon expects to start. */
  private leaveForStory(): void {
    this.discarding = true;
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
    window.addEventListener('pagehide', () => { this.persist(); if (this.trouble) saveTrouble(this.trouble.save()); });
  }

  private persist(): void {
    if (this.discarding) return;
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
      scoreFoundAt: sim.scoreDiscovered ? sim.scoreFoundAt : null,
      knownSensors: [...sim.knownSensors],
      label: this.progressLabel(),
    };
    saveAfternoon(s);
  }

  private progressLabel(): string {
    const st = this.story.state;
    if (st.report) return 'After the decision';
    if (st.devonReleasedAt > 0 && this.sim.tick >= st.devonReleasedAt) return `Investigating · ${this.sim.casefile.clues.size} notes`;
    if (this.sim.devonStopped || st.devonReleasedAt > 0) return 'Devon is being stopped';
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
    if (save.scoreFoundAt) { sim.scoreDiscovered = true; sim.scoreFoundAt = save.scoreFoundAt; }
    for (const id of save.knownSensors ?? []) sim.knownSensors.add(id);
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
    this.renderer.chase.viewport = { w: this.renderer.w, h: this.renderer.h };
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
      this.renderer.controlTop = Infinity;
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
    // The canvas draws the pin's edge arrow itself, and it needs to know
    // where the thumbs are as much as the stylesheet does.
    this.renderer.controlTop = top;
  }

  // ------------------------------------------------------------------ startup

  /**
   * Not a game menu: a device-level accessibility prompt, dismissed in one
   * keypress. It exists because the sequence about to run is exactly the one
   * these options are for.
   */
  private showPrefs(): void {
    document.documentElement.classList.toggle('reduce-motion', this.settings.reduceMotion);
    const saved = loadAfternoon();
    const el = document.createElement('div');
    el.id = 'prefs';
    el.innerHTML = `
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="pref-title">
        <div class="st-title" aria-label="UNDERWATCH"><div><b>UNDER</b><span>WATCH</span></div></div>
        <div class="sys-line" aria-hidden="true"><i></i>${FRAME.ready} · BELLHAVEN</div>
        <h2 id="pref-title">Before you begin</h2>
        <p class="muted">These can be changed at any time.</p>
        <div class="settings-group">
          <label class="setting"><span class="s-label">Reduce motion and flashing</span><input class="switch" type="checkbox" role="switch" id="pref-motion"></label>
          <label class="setting"><span class="s-label">Colour-blind safe palette</span><input class="switch" type="checkbox" role="switch" id="pref-colour"></label>
          <label class="setting"><span class="s-label">Larger text</span><input class="switch" type="checkbox" role="switch" id="pref-text"></label>
        </div>
        <div class="actions modes">
          <button type="button" class="go mode-jobs" id="pref-jobs">Jobs<small>Skate the city. Stay off the grid.</small></button>
        ${saved
          ? `<button type="button" class="go quiet" id="pref-continue">Continue the afternoon<small>${saved.label}</small></button>
             <button type="button" class="go quiet" id="pref-go">Start a new afternoon<small>The story</small></button>`
          : '<button type="button" class="go quiet" id="pref-go">The afternoon<small>The story</small></button>'}
        </div>
        ${this.touchPrimary ? '' : '<div class="keyhint"><kbd>Enter</kbd> for jobs</div>'}
      </div>`;
    document.body.appendChild(el);
    (el.querySelector('#pref-motion') as HTMLInputElement).checked = this.settings.reduceMotion;
    (el.querySelector('#pref-colour') as HTMLInputElement).checked = this.settings.colourSafeMachine;
    (el.querySelector('#pref-text') as HTMLInputElement).checked = this.settings.textScale > 1;

    let gone = false;
    const go = (resume: boolean | 'jobs') => {
      if (gone) return;
      gone = true;
      this.settings.reduceMotion = (el.querySelector('#pref-motion') as HTMLInputElement).checked;
      this.settings.transitionIntensity = this.settings.reduceMotion ? 0.25 : 1;
      this.settings.colourSafeMachine = (el.querySelector('#pref-colour') as HTMLInputElement).checked;
      this.settings.textScale = (el.querySelector('#pref-text') as HTMLInputElement).checked ? 1.2 : 1;
      document.documentElement.style.setProperty('--text-scale', String(this.settings.textScale));
      document.documentElement.classList.toggle('reduce-motion', this.settings.reduceMotion);
      saveSettings(this.settings);
      el.classList.add('hidden');
      window.setTimeout(() => el.remove(), 520);
      this.audio.start();
      if (resume === 'jobs') { this.startJobs(); return; }
      if (resume && saved) {
        this.restore(saved);
        this.startPlay();
      } else {
        if (saved) clearAfternoon();
        this.startAd();
      }
    };

    el.querySelector('#pref-go')!.addEventListener('click', () => go(false));
    el.querySelector('#pref-jobs')!.addEventListener('click', () => go('jobs'));
    el.querySelector('#pref-continue')?.addEventListener('click', () => go(true));
    window.addEventListener('keydown', function once(e) {
      // A focused button answers for itself: Enter on "Start a new afternoon"
      // must start a new one, not take the shortcut's default.
      if ((e.target as HTMLElement | null)?.closest?.('#prefs button')) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        window.removeEventListener('keydown', once);
        go('jobs');
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
    this.closePlan();
    this.touch.setSlingOut(false);
    this.sim.exitAimMode();
    this.sim.dropGrind();
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

    // H, held: every control, over the street, without stopping anything.
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyH' && !e.repeat && this.phase === 'play') this.hud.showKeys(true); });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyH') this.hud.showKeys(false); });
    window.addEventListener('blur', () => this.hud.showKeys(false));
    window.addEventListener('keydown', (e) => {
      if (this.phase === 'ad' || this.phase === 'reprise') {
        if (e.code === 'Escape') this.ad.skip();
        return;
      }
      if (this.phase !== 'play') return;
      if (this.ending.open) return;
      if (this.busted.key(e.code) || this.board.key(e.code) || this.results.key(e.code)) { e.preventDefault(); return; }
      if (this.notebook.key(e.code) || this.menu.key(e.code)) { e.preventDefault(); return; }
      if (this.mode === 'jobs') {
        if (e.code === 'KeyT' && this.run) { this.startJob(this.run.def); e.preventDefault(); return; }
        if (e.code === 'KeyJ' || e.code === 'KeyN' || e.code === 'Tab') { e.preventDefault(); this.openBoard(); return; }
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.sim.aimMode) { this.sim.exitAimMode(); return; }
        if (this.sim.planViewActive) { this.closePlan(); return; }
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
    // Somebody hit by a stone says so.
    bus.on('person:struck', ({ targetId }) => {
      const sim = this.sim;
      const who = sim.npcs.find((n) => n.id === targetId) ?? sim.patrols.find((p) => p.id === targetId)
        ?? sim.people.find((p) => p.id === targetId);
      if (!who) return;
      const line = sim.patrols.some((p) => p.id === targetId) ? 'HEY! STOP RIGHT THERE!' : YELPS[sim.tick % YELPS.length];
      this.renderer.speak(() => who.pos, line, 2.2);
    });
    bus.on('world:glass', ({ pos }) => { this.audio.impact('glass', 1, 1); this.renderer.burst('chip', pos, 1.5, 10, 0, 1.1); });
    // Grinds: the trucks biting the rail, and letting go of it.
    bus.on('player:grind', () => { this.audio.land(0.55); this.audio.impact('metal', 0.5, 1); this.renderer.kick(0.07); });
    bus.on('player:grindEnd', () => this.audio.pop());
    bus.on('player:roof', ({ pos }) => this.renderer.ripple(pos, 0.5));
    bus.on('player:slide', ({ speed }) => this.audio.slide(Math.min(1, speed / 12)));
    bus.on('player:land', ({ speed }) => {
      this.audio.land(Math.min(1, speed / 12));
      this.renderer.kick(0.06 + Math.min(0.1, speed / 120));
    });
    bus.on('player:bail', ({ pos }) => {
      this.audio.bail();
      this.renderer.kick(0.5);
      this.renderer.ripple(pos, 0.6);
    });
    // The false positive, where it happened: on Devon, and in the frame.
    bus.on('match:false-positive', ({ identity, confidence }) => {
      this.renderer.lockOnDevon(SYSTEM.matchSubject(identity), SYSTEM.matchConfidence(confidence));
      this.hud.frame.hold(FRAME.match(confidence), 8);
    });
    bus.on('player:fire', ({ draw }) => {
      if (this.renderer.controls.teachSling) {
        this.renderer.controls.teachSling = false;
        try { localStorage.setItem(SLING_TAUGHT_KEY, '1'); } catch { /* private mode */ }
      }
      this.audio.fire(draw);
      this.renderer.onRelease(draw);
      this.hud.slingThrown();
    });
    /*
     * What a stone hitting something sounds and looks like depends on what it
     * hit and how far away it was. A lens rings and throws sparks; a lawn
     * thuds and puffs; a wall cracks and sheds grit; a bin clatters. Near hits
     * are felt as a small jolt in the aiming view. Nothing shakes the screen.
     */
    bus.on('projectile:impact', ({ kind, pos, z, speed, surface, vel }) => {
      const near = 1 - Math.min(1, dist(pos, this.sim.player.pos) / 60);
      const force = Math.min(1, (speed ?? 20) / 30);
      const heading = vel ? Math.atan2(vel.y, vel.x) : 0;
      const zz = z ?? 0;
      if (kind === 'cameraLens' || kind === 'cameraMount' || kind === 'cameraMotor' || kind === 'drone' || kind === 'junction') {
        this.audio.impact('metal', force, near);
        this.renderer.burst('spark', pos, zz, 9, heading, 1.2);
        this.renderer.jolt(0.25);
      } else if (kind === 'prop') {
        this.audio.impact('plastic', force, near);
        this.renderer.burst('chip', pos, Math.max(0.4, zz), 6, heading);
        this.renderer.burst('dust', pos, 0.1, 4, heading, 0.6);
        this.renderer.jolt(0.15);
      } else if (kind === 'person') {
        this.audio.impact('grass', force, near);
      } else if (kind === 'building') {
        this.audio.impact('hard', force, near);
        this.renderer.burst('chip', pos, zz, 7, heading + Math.PI, 0.9);
        this.renderer.burst('dust', pos, zz, 3, heading + Math.PI, 0.4);
      } else if (kind === 'ground') {
        const soft = surface === 'grass' || surface === 'dirt';
        this.audio.impact(soft ? 'grass' : 'hard', force, near);
        this.renderer.burst('dust', pos, 0.05, soft ? 5 : 7, heading, soft ? 0.6 : 1);
        if (!soft) this.renderer.burst('chip', pos, 0.05, 3, heading, 0.7);
      }
      if (kind !== 'ground' && kind !== 'building' && kind !== 'foliage') this.renderer.ripple(pos, 0.5);
    });
    bus.on('projectile:bounce', ({ pos, z, speed, surface }) => {
      const near = 1 - Math.min(1, dist(pos, this.sim.player.pos) / 60);
      const soft = surface === 'grass' || surface === 'dirt';
      this.audio.impact(soft ? 'grass' : 'hard', Math.min(1, speed / 18) * 0.6, near);
      this.renderer.burst('dust', pos, z, 2, 0, 0.4);
    });
    bus.on('foliage:hit', ({ pos, z, birds, treeId }) => {
      const near = 1 - Math.min(1, dist(pos, this.sim.player.pos) / 60);
      this.audio.impact('leaves', 1, near);
      this.renderer.shakeTree(treeId);
      this.renderer.burst('leaf', pos, z, 14, 0, 1);
      if (birds) {
        this.renderer.burst('bird', pos, z + 0.6, 5, Math.atan2(pos.y - this.sim.player.pos.y, pos.x - this.sim.player.pos.x) + Math.PI, 1);
        this.audio.flutter();
      }
    });
    // Cameras turning to a sound are heard doing it, faintly.
    bus.on('world:attention', ({ pos, sensors }) => {
      if (sensors.length) this.audio.servo();
      // On the plan, where the town is looking now.
      this.renderer.ripple(pos, 1.6);
    });
    bus.on('noise:event', ({ pos, label }) => {
      if (label === 'VEHICLE ALARM') this.audio.alarm(); else this.audio.noise();
      this.renderer.ripple(pos, 1.5);
    });
    bus.on('underwatch:message', ({ register }) => {
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
    bus.on('talk:open', ({ kind, id }) => {
      (kind === 'person' ? this.metPeople : this.seenPlaces).add(id);
    });
    bus.on('aim:entered', () => {
      this.closePlan();
      // Start looking where the character already faces, so the transition
      // never spins the world.
      this.aimYaw = this.sim.player.speed > 0.4
        ? Math.atan2(this.sim.player.vel.y, this.sim.player.vel.x)
        : this.sim.player.heading;
      this.lookTargetYaw = this.aimYaw;
      // Start on the street rather than the sky: a long lens puts the horizon
      // low in the frame, and a reticle above it is aimed at nothing.
      // Level with the street: the things worth hitting are at head height and
      // above, and a first stone into the lawn at your feet teaches nothing.
      this.lookTargetPitch = 0.0;
      this.sim.lookPitch = 0.0;
      this.input.takeLook();
      this.audio.hackTick();
      // A mouse that can leave the window cannot aim all the way round.
      if (!this.touchPrimary) {
        const c = document.getElementById('game') as HTMLCanvasElement | null;
        try { void (c?.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* not allowed here */ }
      }
    });
    bus.on('aim:exited', () => {
      this.audio.hackTick();
      this.audio.setDraw(0);
      if (document.pointerLockElement) document.exitPointerLock();
    });
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
    // A mouse drag is a pull, except in the first-person view where the mouse looks.
    this.input.options.dragThrow = !this.sim.aimMode;
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
    this.touch.setSlingAvailable(!this.sim.hack && !this.sim.grounded);
    this.touch.setGrindReady(!!this.sim.grindNear || !!this.sim.grind);
    // The scrape of trucks on a rail, for as long as the board is on one.
    if (this.sim.grind) {
      this.scrapeIn -= dt;
      if (this.scrapeIn <= 0) { this.scrapeIn = 0.2; this.audio.slide(Math.min(1, 0.35 + this.sim.grind.speed / 20)); }
    } else this.scrapeIn = 0;

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
      /*
       * And on a desktop, the mouse does the same job the left thumb does.
       *
       * It did not before: the only thing that ever turned the sling was the
       * touch drag, so on a keyboard and mouse the aiming view pointed
       * wherever the board happened to be facing and could not be moved. The
       * mouse is read as travel (pointer-locked when the browser allows it)
       * and A/D swing it too, for anybody who would rather.
       */
      const look = this.input.takeLook();
      const keys = this.intent.steer * 1.5 * dt;
      // W and S have nothing to do while stood still, so they tilt the sling.
      const tilt = ((this.intent.push ? 1 : 0) - (this.intent.brake ? 1 : 0)) * 0.8 * dt;
      this.lookTargetYaw += drag.yaw + look.x * MOUSE_YAW + keys;
      this.lookTargetPitch = PerspectiveRenderer.clampPitch(this.lookTargetPitch + drag.pitch - look.y * MOUSE_PITCH + tilt);
      this.aimYaw = damp(this.aimYaw, this.lookTargetYaw, 0.012, dt);
      this.sim.lookPitch = damp(this.sim.lookPitch, this.lookTargetPitch, 0.012, dt);
      this.sim.step(dt, this.intent, this.aimTargetPoint());
      if (this.mode === 'story') this.story.update(); else { this.stepTrouble(dt); this.stepJob(dt); }
      return;
    }

    /*
     * A drag on empty glass: in the plan it moves the map, on the street it
     * turns the camera round the rider. The right mouse button is the same
     * drag on a desktop.
     */
    const look = this.touch.takeLookDrag();
    const mouse = this.input.takeLook();
    if (this.sim.planViewActive) {
      if (look.x || look.y) this.renderer.cam.panBy(look.x, look.y);
    } else if (this.touch.isSlingOut) {
      // The sling raised: a drag is the aim, turning the rig and tilting it.
      if (look.x) this.renderer.chase.swing(look.x * 0.0048);
      if (look.y) this.renderer.chase.tilt(-look.y * 0.0036);
    } else {
      const swing = look.x * 0.0062 + (this.input.rightHeld ? mouse.x * 0.0045 : 0);
      if (swing) this.renderer.chase.swing(swing);
    }
    // Over the shoulder while the sling is up; the plan puts it away.
    if (this.sim.planViewActive && this.touch.isSlingOut) this.touch.setSlingOut(false);
    this.renderer.chase.aimMode = this.touch.isSlingOut && !this.sim.aimMode;

    if (tap) this.resolveTap(tap);
    this.orientMove();
    this.sim.step(dt, this.intent, this.aimPoint());
    if (this.mode === 'jobs') { this.stepTrouble(dt); this.stepJob(dt); return; }
    this.story.update();

    /*
     * The first time the plan opens, before Devon has been found, it opens
     * with him on it: a pin on the kerb where he said he was, labelled with
     * his name. Not an objective — the player can pick it up or put their
     * own down — but the map's first answer to "where am I going".
     */
    const planOpen = this.sim.planViewActive;
    if (planOpen && !this.planWasOpen && !this.sim.devonFollowing && !this.sim.devonStopped && !this.waypoint) {
      this.waypoint = { x: this.sim.devonPos.x, y: this.sim.devonPos.y };
      this.renderer.waypoint = this.waypoint;
      this.renderer.waypointLabel = 'DEVON';
    }
    this.planWasOpen = planOpen;
    if (this.renderer.waypointLabel && (this.sim.devonFollowing || !this.waypoint)) this.renderer.waypointLabel = null;

    // Arriving at the pin puts it away.
    if (this.waypoint && dist(this.waypoint, this.sim.player.pos) < 7) {
      this.waypoint = null;
      this.renderer.waypoint = null;
      this.renderer.waypointLabel = null;
      this.audio.clue();
    }
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
    // On the plan the map is north-up and the screen is the world: up is up.
    if (this.sim.planViewActive) return;
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
    /*
     * A pull, from the rider's hands.
     *
     * The drag reversed, scaled up, from where the rider is on the glass: that
     * is the point being aimed at, and whatever is under it in the world — a
     * lens, a bin, a wall, the road — is where the arc is solved to. Pull
     * further to throw further, point at a thing to throw at it.
     */
    const tv = this.intent.throwVector;
    if (tv && !this.sim.aimMode) {
      const aim = this.throwTarget(tv);
      if (aim) {
        this.renderer.throwAim = { from: aim.from, to: aim.to };
        this.intent.aimHeight = aim.z;
        return { x: aim.x, y: aim.y };
      }
    }
    this.renderer.throwAim = null;
    // Point-and-hold with a mouse: the thing under the cursor, at its height.
    if (this.intent.aim && this.intent.pointerActive && !this.intent.aimVector && !this.sim.aimMode) {
      const hit = this.renderer.pick(this.intent.pointer);
      if (hit) {
        this.intent.aimHeight = hit.z;
        this.renderer.throwAim = { from: this.renderer.riderScreen() ?? this.intent.pointer, to: this.intent.pointer };
        return { x: hit.x, y: hit.y };
      }
    }
    const v = this.intent.aimVector;
    if (v) {
      const origin = this.renderer.cam.toScreen(this.sim.player.pos, this.renderer.w, this.renderer.h);
      return this.renderer.screenToWorld({ x: origin.x + v.x * 320, y: origin.y + v.y * 320 });
    }
    return this.intent.pointerActive ? this.renderer.screenToWorld(this.intent.pointer) : null;
  }

  /**
   * Where a pull points, in the world.
   *
   * The pull's direction on the glass is a bearing on the ground, and its
   * length is a distance along it — a flick for the bin across the road, all
   * the way back for the end of the street. That ground point is then looked
   * at from the camera, and whatever stands in that line of sight first — a
   * lens on its pole, a drone, a wall — is what the throw is aimed at.
   *
   * It used to be a point on the glass a fixed multiple of the pull away, and
   * on an upright phone the horizon is only a couple of hundred pixels above
   * the rider, so an ordinary pull aimed at the sky and lobbed.
   */
  private throwTarget(tv: { x: number; y: number }): { x: number; y: number; z: number; from: { x: number; y: number }; to: { x: number; y: number } } | null {
    const r = this.renderer;
    const p = this.sim.player.pos;
    const hands = r.riderScreen();
    const foot = r.screenOf(p, 0);
    if (!hands || !foot) return null;
    const len = Math.hypot(tv.x, tv.y);
    if (len < 0.5) return null;
    const ux = tv.x / len, uy = tv.y / len;
    // The bearing: a short step along the pull from the rider's feet, on the ground.
    let bearing: number | null = null;
    for (const step of [60, 30, 12]) {
      const g = r.screenToGround({ x: foot.x + ux * step, y: foot.y + uy * step });
      if (g && Math.hypot(g.x - p.x, g.y - p.y) > 0.2) { bearing = Math.atan2(g.y - p.y, g.x - p.x); break; }
    }
    if (bearing === null) return null;
    const full = this.touchPrimary ? 120 : 150;
    const k = Math.min(1, len / full);
    const reach = THROW_NEAR + (THROW_FAR - THROW_NEAR) * Math.pow(k, 1.45);
    const ground = { x: p.x + Math.cos(bearing) * reach, y: p.y + Math.sin(bearing) * reach };
    /*
     * Whatever stands at that spot. A lens is on a pole four and a half
     * metres above its own foot, so pulling to the foot of the pole *is*
     * pointing at the camera — the spot is a place, and the things at a place
     * are at it however tall they are. Only the range and the height come
     * from the thing: the bearing stays exactly where the pull put it, so a
     * pull a metre to the left is still a miss a metre to the left.
     */
    const dx = Math.cos(bearing), dy = Math.sin(bearing);
    let standing: { along: number; z: number; off: number } | null = null;
    for (const t of this.sim.ballisticTargets()) {
      const off = Math.hypot(t.pos.x - ground.x, t.pos.y - ground.y);
      const tol = t.radius + Math.max(1.2, reach * 0.06);
      if (off > tol) continue;
      const along = (t.pos.x - p.x) * dx + (t.pos.y - p.y) * dy;
      if (along < 1.5) continue;
      if (!standing || off < standing.off) standing = { along, z: t.z, off };
    }
    const hands0 = hands;
    if (standing) {
      const at = { x: p.x + dx * standing.along, y: p.y + dy * standing.along };
      return { ...at, z: standing.z, from: hands0, to: r.screenOf(at, standing.z) ?? hands0 };
    }
    const to = r.screenOf(ground, 0);
    if (!to) return { ...ground, z: 0, from: hands, to: hands };
    const hit = r.pick(to);
    // Whatever is standing in that line of sight, if it is no further than the
    // ground point; a wall behind the point is not what was aimed at.
    if (hit && Math.hypot(hit.x - p.x, hit.y - p.y) <= reach + 1.5) return { x: hit.x, y: hit.y, z: hit.z, from: hands, to };
    return { ...ground, z: 0, from: hands, to };
  }

  /**
   * A tap in the world is a request to touch a piece of the network. The graph
   * is a place, so reaching into it is a matter of putting a finger on it.
   */
  private resolveTap(screen: { x: number; y: number }): void {
    // A tap while talking is the next line; a tap with somebody or something
    // in reach is stopping to attend to it. The same rule as the E key.
    if (this.sim.planViewActive) { this.markAt(this.renderer.screenToWorld(screen)); return; }
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
    const showing = this.phase === 'ad' || this.phase === 'reprise';
    if (showing) this.ad.update(dt);
    // The advertisement is an advertisement: no thumbs, no prompts, no pin
    // on it. The controls are for the street, and appear with it.
    this.renderer.controlVisual = !showing && (this.touchPrimary || this.touch.engaged) ? this.touch.visual : null;
    this.renderer.overlaysHidden = showing;
    // The fork sits here for the whole time a shot is being lined up, not
    // wherever the aim thumb currently is — see drawSlingInHands for why.
    this.renderer.slingRest = this.touch.slingRestPoint();
    this.renderer.metPeople = this.metPeople;
    this.renderer.mousePull = this.input.pullLine;
    this.renderer.scoreLine = this.sim.scoreDiscovered
      ? PHONE.plan(Math.round(100 - this.sim.playerRisk), riskLabel(this.sim.playerRisk)) : null;
    this.renderer.seenPlaces = this.seenPlaces;
    if (this.sim.planViewBlend > 0) this.renderer.freshPlaces = new Set(this.story.freshPlaces());
    // The hint retires itself the moment the player has travelled a board's
    // length or two under their own power. Nobody needs to be told twice.
    this.renderer.showControlHome = this.touchPrimary && this.sim.player.odometer < 12;
    // Whoever the player is talking to is in the shot with them.
    const e = this.sim.engagedWith;
    this.renderer.chase.focus = e
      ? (e.kind === 'person' ? (e.id === 'devon' ? this.sim.devonPos : this.sim.person(e.id)?.pos ?? e.pos) : e.pos)
      : null;
    this.renderer.render(dt);
    // In a job the exposure meter is the system's own account of you; the
    // frame's corners say the same thing the strip at the top does.
    const level = this.run && this.mode === 'jobs' && this.run.status === 'running' ? this.run.exposure.level : null;
    this.hud.setWatchOverride(level);
    const busy = !!level && level !== 'UNSEEN';
    if (busy !== this.hudBusy) { this.hudBusy = busy; document.documentElement.classList.toggle('hud-busy', busy); }
    this.hud.update(dt);
    this.troubleHud.update(this.mode === 'jobs' ? this.trouble : null);
    if (this.run && this.mode === 'jobs') {
      this.jobHud.update(this.run, dt, this.sim.player.pos, this.renderer.chase.yaw);
    }
    this.audio.setDraw(this.sim.aimMode || this.sim.player.aiming ? this.sim.player.draw : 0);

    const p = this.sim.player;
    this.audio.update(
      p.speed, this.sim.playerMaxSpeed,
      this.sim.world.surfaceAt(p.pos),
      p.stance !== 'AIR' && p.onBoard,
      this.sim.planViewBlend, p.flow, this.hud.frame.watchLevel,
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
  const game = new Game(canvas, ui);
  // A handle for the screenshot harness (scripts/shots.mjs). Dev builds only:
  // Vite strips the branch from production, so no player ever has it.
  if (import.meta.env.DEV) (window as unknown as { __underwatch: unknown }).__underwatch = game;
} else {
  console.error('UNDERWATCH: missing #game canvas or #ui root');
}

export { VERBS };
