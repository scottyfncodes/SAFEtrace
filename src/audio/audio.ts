/**
 * Fully synthesised audio.
 *
 * The strategy in one line: establish a warm, trustworthy sound language in the
 * first ninety seconds, then never change it, and let context do all the work.
 * The SAFEtrace motif is identical in the advertisement and in the moment a
 * patrol is routed to intercept you. Only the player changes.
 */
import type { Settings } from '../core/settings';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private worldGain: GainNode | null = null;
  private skateGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private machineGain: GainNode | null = null;

  private rollSource: AudioBufferSourceNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private rollGain: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private machineOsc: OscillatorNode[] = [];
  private started = false;

  constructor(private settings: Settings) {}

  /** Must be called from a user gesture. */
  start(): void {
    if (this.started) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.started = true;

    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.settings.masterVolume;
    this.master.connect(c.destination);

    const bus = (v: number) => { const g = c.createGain(); g.gain.value = v; g.connect(this.master!); return g; };
    this.worldGain = bus(this.settings.worldVolume);
    this.skateGain = bus(this.settings.skateVolume);
    this.uiGain = bus(this.settings.interfaceVolume);
    this.machineGain = bus(0);

    this.buildWorldBed();
    this.buildRollLayer();
    this.buildMachineDrone();
  }

  resume(): void { void this.ctx?.resume(); }

  private noiseBuffer(seconds = 2): AudioBuffer {
    const c = this.ctx!;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  /**
   * Suburban afternoon. It is the sound of a place worth protecting, which is
   * the argument the game is arguing against.
   */
  private buildWorldBed(): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer(4);
    src.loop = true;

    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;

    this.bedGain = c.createGain();
    this.bedGain.gain.value = 0.05;

    src.connect(hp).connect(lp).connect(this.bedGain).connect(this.worldGain!);
    src.start();

    // A distant mower, two streets over.
    const mower = c.createOscillator();
    mower.type = 'sawtooth';
    mower.frequency.value = 74;
    const mf = c.createBiquadFilter();
    mf.type = 'lowpass';
    mf.frequency.value = 240;
    const mg = c.createGain();
    mg.gain.value = 0.012;
    mower.connect(mf).connect(mg).connect(this.worldGain!);
    mower.start();
  }

  /**
   * Urethane on surface. Players should be able to close their eyes and know
   * their speed, so the filter and the gain track velocity directly.
   */
  private buildRollLayer(): void {
    const c = this.ctx!;
    this.rollSource = c.createBufferSource();
    this.rollSource.buffer = this.noiseBuffer(3);
    this.rollSource.loop = true;
    this.rollFilter = c.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 320;
    this.rollFilter.Q.value = 0.7;
    this.rollGain = c.createGain();
    this.rollGain.gain.value = 0;
    this.rollSource.connect(this.rollFilter).connect(this.rollGain).connect(this.skateGain!);
    this.rollSource.start();
  }

  private buildMachineDrone(): void {
    const c = this.ctx!;
    // Tuned to the same root as the SAFEtrace motif. The machine is in key
    // with the advertisement, because it is the same company.
    for (const [f, g] of [[55, 0.35], [82.5, 0.18], [110, 0.12], [165, 0.05]] as Array<[number, number]>) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const gn = c.createGain();
      gn.gain.value = g;
      o.connect(gn).connect(this.machineGain!);
      o.start();
      this.machineOsc.push(o);
    }
  }

  update(speed: number, maxSpeed: number, surface: string, onGround: boolean, machineBlend: number, flow: number): void {
    if (!this.ctx || !this.rollGain || !this.rollFilter) return;
    const t = this.ctx.currentTime;
    const k = Math.min(1, speed / Math.max(maxSpeed, 0.01));

    const surfaceTone: Record<string, [number, number]> = {
      asphalt: [420, 1.0],
      smoothConcrete: [280, 0.8],
      roughConcrete: [640, 1.25],
      grass: [150, 0.45],
      gravel: [900, 1.15],
      dirt: [220, 0.6],
      tile: [520, 0.9],
      water: [180, 0.5],
    };
    const [freq, amp] = surfaceTone[surface] ?? [420, 1];
    this.rollFilter.frequency.setTargetAtTime(freq * (0.55 + k * 1.1), t, 0.08);
    this.rollGain.gain.setTargetAtTime(onGround ? k * 0.11 * amp : 0, t, 0.06);

    if (this.machineGain) {
      this.machineGain.gain.setTargetAtTime(machineBlend * 0.09, t, 0.12);
    }
    if (this.bedGain) {
      // Risk does not trigger stinger music. The world bed thins instead:
      // silence is the tension system. Flow warms it back up.
      this.bedGain.gain.setTargetAtTime(0.05 * (1 - machineBlend * 0.85) + flow * 0.012, t, 0.3);
    }
  }

  /** Duck the whole world, for the peel. */
  duck(amount: number): void {
    if (!this.worldGain || !this.ctx) return;
    this.worldGain.gain.setTargetAtTime(this.settings.worldVolume * (1 - amount * 0.82), this.ctx.currentTime, 0.1);
  }

  // ---------------------------------------------------------------- one-shots

  private env(dest: AudioNode, freq: number, type: OscillatorType, attack: number, decay: number, peak: number, detune = 0): void {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  private burst(dest: AudioNode, freqFrom: number, freqTo: number, decay: number, peak: number): void {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer(0.4);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    const t = c.currentTime;
    f.frequency.setValueAtTime(freqFrom, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), t + decay);
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  /**
   * The SAFEtrace motif. Three notes, a fifth then a major third, soft bell
   * attack. It is never altered, in the advertisement or in the last hour.
   */
  motif(strength = 1): void {
    if (!this.ctx || !this.uiGain) return;
    const c = this.ctx;
    const notes = [440, 659.25, 830.61];
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const sub = c.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = f / 2;
      const g = c.createGain();
      const sg = c.createGain();
      const t = c.currentTime + i * 0.13;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09 * strength, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      sg.gain.setValueAtTime(0, t);
      sg.gain.linearRampToValueAtTime(0.035 * strength, t + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g).connect(this.uiGain!);
      sub.connect(sg).connect(this.uiGain!);
      o.start(t); o.stop(t + 0.9);
      sub.start(t); sub.stop(t + 0.8);
    });
  }

  push(): void { if (this.skateGain) this.burst(this.skateGain, 1400, 260, 0.16, 0.09); }
  pop(): void { if (this.skateGain) { this.burst(this.skateGain, 2600, 700, 0.06, 0.14); this.env(this.skateGain, 210, 'square', 0.002, 0.05, 0.05); } }
  land(force: number): void {
    if (!this.skateGain) return;
    this.burst(this.skateGain, 900, 180, 0.09, 0.05 + force * 0.1);
    this.env(this.skateGain, 88, 'sine', 0.002, 0.11, 0.06 + force * 0.08);
  }
  bail(): void {
    if (!this.skateGain) return;
    this.burst(this.skateGain, 2200, 120, 0.5, 0.16);
    this.env(this.skateGain, 62, 'sine', 0.003, 0.3, 0.1);
  }
  fire(): void { if (this.skateGain) this.burst(this.skateGain, 3200, 900, 0.05, 0.1); }
  impactMetal(): void { if (this.uiGain) { this.env(this.uiGain, 2100, 'square', 0.001, 0.12, 0.055); this.env(this.uiGain, 3300, 'triangle', 0.001, 0.06, 0.03); } }
  impactSoft(): void { if (this.uiGain) this.burst(this.uiGain, 700, 140, 0.18, 0.07); }
  noise(): void { if (this.worldGain) this.burst(this.worldGain, 500, 90, 0.5, 0.12); }
  alarm(): void {
    if (!this.worldGain || !this.ctx) return;
    for (let i = 0; i < 6; i++) {
      const t = this.ctx.currentTime + i * 0.22;
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 880;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(this.worldGain);
      o.start(t); o.stop(t + 0.2);
    }
  }
  /** The camera servo. You only hear it if you are close and moving slowly. */
  servo(): void { if (this.worldGain) this.env(this.worldGain, 320, 'sawtooth', 0.02, 0.18, 0.012); }
  hackTick(): void { if (this.uiGain) this.env(this.uiGain, 1320, 'sine', 0.001, 0.04, 0.03); }
  hackDone(): void { if (this.uiGain) { this.env(this.uiGain, 880, 'sine', 0.004, 0.16, 0.05); this.env(this.uiGain, 1318, 'sine', 0.004, 0.22, 0.035); } }
  collect(): void { if (this.uiGain) this.env(this.uiGain, 1760, 'sine', 0.002, 0.07, 0.035); }
  peelIn(): void {
    if (!this.uiGain) return;
    this.burst(this.uiGain, 120, 4200, 0.5, 0.05);
    this.env(this.uiGain, 55, 'sine', 0.02, 1.2, 0.07);
  }
  peelOut(): void { if (this.uiGain) this.burst(this.uiGain, 3800, 200, 0.32, 0.045); }

  // ------------------------------------------------------------- the player's

  /*
   * The player's own sounds. Everything SAFEtrace makes is a bell in A, and it
   * never changes. The notebook is a pencil and a guitar-ish pluck in E
   * minor: warmer, lower, a little out of step — a person, not a product.
   */
  /** Something written down. */
  clue(): void {
    if (!this.uiGain) return;
    this.burst(this.uiGain, 5200, 2600, 0.07, 0.025);
    this.env(this.uiGain, 329.63, 'triangle', 0.004, 0.5, 0.05);
    this.env(this.uiGain, 493.88, 'sine', 0.004, 0.42, 0.028);
  }

  /** Two things that belong together. */
  deduction(): void {
    if (!this.ctx || !this.uiGain) return;
    const notes = [329.63, 392.0, 493.88, 659.25];
    notes.forEach((f, i) => {
      const t = this.ctx!.currentTime + i * 0.085;
      const o = this.ctx!.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(this.uiGain!);
      o.start(t); o.stop(t + 1.5);
    });
  }

  /** A line of somebody speaking. Barely there. */
  talkBlip(): void { if (this.uiGain) this.env(this.uiGain, 196, 'sine', 0.003, 0.07, 0.03); }

  // --------------------------------------------------------------- the places

  private placeBeds = new Map<string, GainNode>();
  private currentPlace = '';
  private birdClock = 0;

  /**
   * Each part of town has its own air: birds over Maple Court and the greenway,
   * a crowd's murmur on the Commons, the hum of plant at Relay 12, and in the
   * Channel the concrete swallowing everything except a trickle of water.
   * None of it is music and none of it reacts to risk — the town sounds the
   * same whether or not it is looking at you, which is the point.
   */
  setPlace(place: string, dt: number): void {
    if (!this.ctx || !this.worldGain) return;
    if (this.placeBeds.size === 0) this.buildPlaceBeds();
    if (place !== this.currentPlace) {
      this.currentPlace = place;
      const t = this.ctx.currentTime;
      for (const [id, g] of this.placeBeds) {
        const want = id === place ? (id === 'channel' ? 0.05 : id === 'relay' ? 0.05 : 0.035) : 0;
        g.gain.setTargetAtTime(want, t, 1.2);
      }
    }
    if (place === 'maple' || place === 'ridgeline' || place === 'northgate') {
      this.birdClock -= dt;
      if (this.birdClock <= 0) {
        this.birdClock = 2.5 + Math.random() * 6;
        this.chirp();
      }
    }
  }

  private buildPlaceBeds(): void {
    const c = this.ctx!;
    const bed = (id: string, build: (out: GainNode) => void) => {
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(this.worldGain!);
      build(g);
      this.placeBeds.set(id, g);
    };
    bed('commons', (out) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuffer(3); src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.9;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.23;
      const lg = c.createGain(); lg.gain.value = 180;
      lfo.connect(lg).connect(f.frequency);
      src.connect(f).connect(out); src.start(); lfo.start();
    });
    bed('relay', (out) => {
      for (const [fq, v] of [[50, 0.8], [100, 0.5], [150, 0.18]] as Array<[number, number]>) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fq;
        const g = c.createGain(); g.gain.value = v;
        o.connect(g).connect(out); o.start();
      }
    });
    bed('channel', (out) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuffer(3); src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 2.2;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.7;
      const lg = c.createGain(); lg.gain.value = 500;
      lfo.connect(lg).connect(f.frequency);
      src.connect(f).connect(out); src.start(); lfo.start();
    });
  }

  private chirp(): void {
    if (!this.ctx || !this.worldGain) return;
    const c = this.ctx;
    const base = 2600 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = c.currentTime + i * (0.09 + Math.random() * 0.05);
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.3), t + 0.06);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g).connect(this.worldGain);
      o.start(t); o.stop(t + 0.1);
    }
  }

  applySettings(): void {
    if (!this.ctx) return;
    if (this.master) this.master.gain.value = this.settings.masterVolume;
    if (this.worldGain) this.worldGain.gain.value = this.settings.worldVolume;
    if (this.skateGain) this.skateGain.gain.value = this.settings.skateVolume;
    if (this.uiGain) this.uiGain.gain.value = this.settings.interfaceVolume;
  }
}
