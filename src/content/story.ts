/**
 * The story director.
 *
 * Beats are declarative: a condition, an action, and a one-shot flag. The
 * strongest moments in this game are notifications, so most beats do nothing
 * more than let the simulation speak in its own voice at the right moment.
 */
import { dist } from '../core/math';
import type { Sim } from '../sim/sim';
import type { Hud } from '../ui/hud';
import type { Audio } from '../audio/audio';
import type { Renderer } from '../render/renderer';
import { CARE, DIALOGUE, SYSTEM } from './copy';

export interface StoryContext {
  sim: Sim;
  hud: Hud;
  audio: Audio;
  renderer: Renderer;
  playReprise(): void;
  /** Device-appropriate phrasing, so beats never name a key or a gesture. */
  hint: { vision: string; inspect: string };
  /**
   * Schedule work N seconds of *simulation* time from now.
   *
   * Beats used wall-clock timers, which meant an authored sequence drifted
   * away from the world whenever the tab was throttled, and could never be
   * reproduced from a seed. Everything the story does now advances on the same
   * clock the surveillance model does.
   */
  after(seconds: number, fn: () => void): void;
}

export interface Beat {
  id: string;
  label: string;
  /** Evaluated every tick until it fires once. */
  when(ctx: StoryContext, state: StoryState): boolean;
  run(ctx: StoryContext, state: StoryState): void;
}

export interface StoryState {
  startedAt: number;
  matchFiredAt: number;
  incidentId: string | null;
  devonReleasedAt: number;
  reachedCm207: boolean;
  queriedIncident: boolean;
  queriedVision: boolean;
  queriedRecord: boolean;
  visionUnlockedAt: number;
  repriseShown: boolean;
}

export const initialStoryState = (): StoryState => ({
  startedAt: 0,
  matchFiredAt: -1,
  incidentId: null,
  devonReleasedAt: -1,
  reachedCm207: false,
  queriedIncident: false,
  queriedVision: false,
  queriedRecord: false,
  visionUnlockedAt: -1,
  repriseShown: false,
});

const CHANNEL_ENTRY = { x: 196, y: 428 };
const CM207 = { x: 145, y: 88 };

export const BEATS: Beat[] = [
  {
    id: 'welcome',
    label: 'Maple Court',
    when: (c) => c.sim.tick > 90,
    run: (c) => {
      c.sim.message('CARE', [CARE.weather], 5.0);
      c.hud.say([DIALOGUE.devonOpening[0]], 3.2);
    },
  },
  {
    id: 'devon-suggests-channel',
    label: 'The Channel',
    when: (c) => c.sim.tick > 60 * 12,
    run: (c) => {
      c.hud.say([DIALOGUE.devonOpening[1]], 4.0);
      c.sim.message('CARE', [CARE.friendSafe('Devon')], 5.0);
    },
  },
  {
    id: 'channel-arrival',
    label: 'The Channel — no coverage',
    when: (c) => dist(c.sim.player.pos, CHANNEL_ENTRY) < 34,
    run: (c) => {
      c.hud.say([DIALOGUE.devonOpening[2]], 4.0);
    },
  },

  // ------------------------------------------------------------------ the hook
  {
    id: 'incident',
    label: 'Incident reported — Northgate',
    when: (c, s) => s.matchFiredAt < 0 && dist(c.sim.player.pos, CHANNEL_ENTRY) < 40 && c.sim.tick > 60 * 25,
    run: (c, s) => {
      // Four kilometres away, on the far side of town, while the player is
      // standing in a drainage channel with their best friend.
      const inc = c.sim.openIncident('BURGLARY', { x: 132, y: 44 }, 'NORTHGATE LN', 'northgate');
      s.incidentId = inc.id;
      c.sim.message('SYSTEM', [SYSTEM.incidentReported('BURGLARY', 'NORTHGATE')], 4.6);
      c.audio.motif(0.85);
      s.matchFiredAt = c.sim.tick + 60 * 9;
    },
  },
  {
    id: 'the-match',
    label: 'FACIAL MATCH CONFIRMED',
    when: (c, s) => s.matchFiredAt > 0 && c.sim.tick >= s.matchFiredAt,
    run: (c, s) => {
      const inc = c.sim.incidents.find((i) => i.id === s.incidentId);
      if (!inc) return;
      // Nothing forces the answer. Fusion runs the same posterior it always
      // runs, with the priors these identities actually carry, and it is wrong.
      const match = c.sim.runIdentityMatch(inc);
      c.audio.motif(1);
      c.sim.message('SYSTEM', [
        SYSTEM.matchConfirmed,
        SYSTEM.matchConfidence(match.confidence),
        SYSTEM.matchSubject(match.identity),
      ], 8.0, 'strong');
      c.sim.bus.emitNow('match:false-positive', {
        identity: match.identity, confidence: match.confidence, incidentId: inc.id,
      });
      c.after(2.6, () => c.hud.say([DIALOGUE.devonAfterMatch[0]], 3.0));
      c.after(6, () => c.hud.say([DIALOGUE.devonAfterMatch[1]], 3.4));
      c.after(9.8, () => c.hud.say([DIALOGUE.devonAfterMatch[2]], 3.6));
    },
  },
  {
    id: 'the-crack',
    label: 'The veneer cracks',
    when: (c, s) => s.matchFiredAt > 0 && c.sim.tick >= s.matchFiredAt + 60 * 13,
    run: (c) => {
      // A drone's shadow crosses them. As its light comes on the world flickers
      // into machine vision for under two seconds and snaps back. Neither
      // character comments on it.
      const drone = c.sim.drones[0];
      drone.pos = { x: c.sim.player.pos.x + 14, y: c.sim.player.pos.y - 18 };
      c.sim.dispatcher.flagAnomaly(c.sim.player.pos, c.sim.tick, 'INVESTIGATING — SUBJECT VERIFICATION', 60 * 24);
      c.sim.crackTheVeneer(1.8);
      c.audio.peelIn();
      c.renderer.kick(0.35);
    },
  },
  {
    id: 'devon-stopped',
    label: 'Devon is stopped',
    when: (c, s) => s.matchFiredAt > 0 && c.sim.tick >= s.matchFiredAt + 60 * 19,
    run: (c, s) => {
      c.sim.devonStopped = true;
      c.sim.devonFollowing = false;
      // Not arrested. Just stopped, very politely, while the system checks.
      c.sim.message('CARE', [CARE.stopped], 6.0);
      c.hud.say([DIALOGUE.devonStopped[0]], 3.6);
      c.after(4.2, () => c.hud.say([DIALOGUE.devonStopped[1]], 3.4));
      c.after(9, () => c.hud.say([DIALOGUE.playerThought[0]], 3.4));
      s.devonReleasedAt = c.sim.tick + 60 * 45;
      // The player can now hold VISION, because they have started to see it.
      c.sim.unlockVision();
      c.audio.motif(0.6);
      c.after(12, () => c.sim.message('SYSTEM', [SYSTEM.visionAvailable, c.hint.vision], 6.0));
    },
  },

  // ------------------------------------------------------- the investigation
  {
    id: 'objective-cm207',
    label: 'Find the camera that made the match',
    when: (c, s) => s.devonReleasedAt > 0 && c.sim.tick > s.devonReleasedAt - 60 * 40,
    run: (c) => {
      c.sim.message('SYSTEM', ['INCIDENT INC-4100', 'SOURCE NODE: CM-207 — NORTHGATE'], 7.0);
    },
  },
  {
    id: 'reached-cm207',
    label: 'CM-207',
    when: (c) => dist(c.sim.player.pos, CM207) < 22,
    run: (c, s) => {
      s.reachedCm207 = true;
      // Its feed is fine. Nothing is broken. That is the horror.
      c.sim.message('SYSTEM', ['NODE CM-207 — FEED NOMINAL', 'NO FAULT RECORDED'], 6.5);
      c.after(4, () => c.sim.message('SYSTEM', [SYSTEM.queryAvailable, c.hint.inspect], 6.0));
    },
  },
  {
    id: 'understood',
    label: 'The pipeline that produced 98.7%',
    when: (c, s) =>
      s.reachedCm207 &&
      c.sim.discoveredNodes.has('SVC-VISION') &&
      c.sim.discoveredNodes.has('SVC-PREDICT'),
    run: (c, s) => {
      s.visionUnlockedAt = c.sim.tick;
      // Six database records, and the player assembles the argument themselves.
      c.sim.message('SYSTEM', [
        'GALLERY: RIDGELINE SECONDARY — ENROLLED MINORS',
        'CONSENT BASIS: PARENT / GUARDIAN',
      ], 7.0);
      c.after(4.5, () => c.sim.message('SYSTEM', [
        'ASSOCIATION: ARAYA, DEVON M. — NORTHGATE',
        'PRIOR VISITS: 41',
      ], 7.0));
      c.after(9.5, () => c.sim.message('SYSTEM', [
        SYSTEM.recordImmutable,
        SYSTEM.retention,
      ], 8.0, 'strong'));
      c.after(15, () => c.hud.say([DIALOGUE.playerThought[1]], 4.5));
    },
  },
  {
    id: 'reprise',
    label: 'The advertisement, unchanged',
    when: (c, s) => s.visionUnlockedAt > 0 && c.sim.tick > s.visionUnlockedAt + 60 * 22 && !s.repriseShown,
    run: (c, s) => {
      s.repriseShown = true;
      c.playReprise();
    },
  },
];

export class StoryDirector {
  private fired = new Set<string>();
  /** Work queued by beats, due at a simulation tick rather than a wall clock. */
  private queue: Array<{ dueTick: number; fn: () => void }> = [];
  readonly state = initialStoryState();
  readonly ctx: StoryContext;

  constructor(ctx: Omit<StoryContext, 'after'>) {
    this.ctx = {
      ...ctx,
      after: (seconds, fn) => {
        this.queue.push({ dueTick: this.ctx.sim.tick + Math.round(seconds * 60), fn });
      },
    };
  }

  update(): void {
    // Due work first, so a beat scheduled for this tick lands before anything
    // it might gate.
    if (this.queue.length) {
      const now = this.ctx.sim.tick;
      const due = this.queue.filter((q) => q.dueTick <= now);
      if (due.length) {
        this.queue = this.queue.filter((q) => q.dueTick > now);
        for (const q of due) q.fn();
      }
    }

    for (const beat of BEATS) {
      if (this.fired.has(beat.id)) continue;
      if (!beat.when(this.ctx, this.state)) continue;
      this.fired.add(beat.id);
      beat.run(this.ctx, this.state);
      this.ctx.sim.bus.emitNow('story:beat', { id: beat.id, label: beat.label });
    }

    // Devon is released, eventually, and nothing is removed from the record.
    if (this.state.devonReleasedAt > 0 && this.ctx.sim.tick === this.state.devonReleasedAt) {
      this.ctx.sim.devonStopped = false;
      this.ctx.sim.message('CARE', ['Devon is on their way home. Everything looks normal.'], 6.0);
    }
  }

  get progress(): string[] { return [...this.fired]; }
  get pending(): number { return this.queue.length; }
}
