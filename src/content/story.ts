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
import {
  MISLEADING, PLACES, RECORD_CLUES, caseStrength, resolveEnding,
  type CaseStanding, type EndingId, type ReportTarget,
} from './case';
import {
  PEOPLE_NAMES, chooseOption, openConversation,
  type Conversation, type Line, type TalkContext, type TalkEffect,
} from './talk';
import { DEVON_HOME } from './cast';
import { BARKS, BARK_GAP_SECONDS, BARK_LINE_SECONDS, BARK_MAX_SPEED, BARK_RANGE, type Bark, type BarkPhase } from './barks';
import { sendTo } from '../sim/people';
import { levelRank } from '../sim/surveillance/disturbance';

export interface StoryContext {
  sim: Sim;
  hud: Hud;
  audio: Audio;
  renderer: Renderer;
  /** Play the advertisement again, and then say how the afternoon ended. */
  playReprise(ending?: EndingId): void;
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
  /**
   * The tick the afternoon started on — set when the advertisement hands over.
   *
   * The world runs underneath the advertisement, because it is the same world,
   * so `sim.tick` is already past two thousand by the time the player has
   * control. Beats that mean "half a minute into the afternoon" have to be
   * measured from here; measured from `sim.tick` they are all long overdue and
   * fire in a heap on the first frame of play.
   */
  startedAt: number;
  /** The tick the player actually reached Devon. -1 until they do. */
  metDevonAt: number;
  matchFiredAt: number;
  incidentId: string | null;
  devonReleasedAt: number;
  reachedCm207: boolean;
  enteredSableLane: boolean;
  /** How much of the six-record chain the player has actually read. */
  chainRead: number;
  visionUnlockedAt: number;
  repriseShown: boolean;
  /** Tick Devon went home after the stop. -1 until he does. */
  devonHomeAt: number;
  /**
   * What the player did at the stop. `null` until they have made the call —
   * talking to the officer, or letting the stop run its course.
   */
  intervened: boolean | null;
  /** Who the player took the case to. The one decision the ending reads. */
  report: ReportTarget | null;
  ending: EndingId | null;
  /** How many times the player has spoken to each person. */
  talked: Record<string, number>;
  toldCarvalho: boolean;
  /** Places the player has stopped to look at. */
  looked: string[];
  /** When the advertisement comes back, once there is an ending to come back to. */
  finaleAt: number;
}

export const initialStoryState = (): StoryState => ({
  startedAt: 0,
  metDevonAt: -1,
  matchFiredAt: -1,
  incidentId: null,
  devonReleasedAt: -1,
  reachedCm207: false,
  enteredSableLane: false,
  chainRead: 0,
  visionUnlockedAt: -1,
  repriseShown: false,
  devonHomeAt: -1,
  intervened: null,
  report: null,
  ending: null,
  talked: {},
  toldCarvalho: false,
  looked: [],
  finaleAt: -1,
});

/** Where the officer comes from to stop Devon: up the apron, from the street. */
const OFFICER_FROM = { x: 196, y: 392 };

/** Ticks of *play*, which is not the same as ticks of simulation. */
const since = (c: StoryContext, s: StoryState): number => c.sim.tick - s.startedAt;

const CHANNEL_ENTRY = { x: 196, y: 428 };
const CM207 = { x: 145, y: 88 };
/** The rear service alley, and the break in its garages behind CM-207. */
const SABLE_LANE = { x: 144, y: 112 };

/**
 * The chain, in the order it makes sense in. The player may read it in any
 * order; this is only used to notice how far they have got.
 */
export const RECORD_CHAIN = [
  'CM-207', 'JX-207', 'SVC-VISION', 'SVC-REVIEW', 'SVC-PREDICT', 'SVC-RECORD',
] as const;

export const BEATS: Beat[] = [
  {
    id: 'ambient-weather',
    label: 'Maple Court',
    // The town's own small talk. It has nothing to do with Devon, and it
    // does not wait on him — a phone pings on its own schedule.
    when: (c, s) => since(c, s) > 90,
    run: (c) => {
      c.sim.message('CARE', [CARE.weather], 5.0);
    },
  },
  {
    id: 'meet-devon',
    label: 'Devon',
    /*
     * The session used to start with Devon already five and a half metres
     * back, following. He waits at his own spot now, and this is the one
     * beat that starts him moving — the player has to actually go find him,
     * which is the only thing "took you long enough" is allowed to be a
     * reaction to.
     */
    when: (c) => !c.sim.devonFollowing && !c.sim.devonStopped
      && dist(c.sim.player.pos, c.sim.devonPos) < 6,
    run: (c, s) => {
      s.metDevonAt = c.sim.tick;
      c.sim.meetDevon();
      c.hud.say([DIALOGUE.devonOpening[0]], 3.2);
    },
  },
  {
    id: 'devon-texts',
    label: 'Devon — where are you',
    // A friend who is waiting texts you. It says where he is the way a friend
    // would, by landmarks, and it says it once.
    when: (c, s) => s.metDevonAt < 0 && since(c, s) > 60 * 24,
    run: (c) => c.hud.say([DIALOGUE.devonWhere], 5.5),
  },
  {
    id: 'devon-suggests-channel',
    label: 'The Channel',
    // A beat into the conversation, not a beat into the session — this used
    // to be measured from control-start, which meant it could fire before
    // the player had even met the person doing the talking.
    when: (c, s) => s.metDevonAt > 0 && c.sim.tick >= s.metDevonAt + 60 * 10,
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

  {
    id: 'devon-nudge',
    label: 'Devon — you coming?',
    // A friend who suggested something and was ignored says so, once.
    when: (c, s) => s.metDevonAt > 0 && s.matchFiredAt < 0
      && c.sim.tick >= s.metDevonAt + 60 * 70 && dist(c.sim.player.pos, CHANNEL_ENTRY) > 60,
    run: (c) => c.hud.say([DIALOGUE.devonNudge], 4.2),
  },

  // ------------------------------------------------------------------ the hook
  {
    id: 'incident',
    label: 'Incident reported — Northgate',
    /*
     * With Devon, or not at all. This used to need only the player at the
     * Channel, so a player who skated straight there without ever finding him
     * got "Devon: I'm right here" from a boy eighty metres away on a lawn.
     */
    when: (c, s) => s.matchFiredAt < 0 && c.sim.devonFollowing
      && dist(c.sim.player.pos, CHANNEL_ENTRY) < 40
      && dist(c.sim.devonPos, c.sim.player.pos) < 30
      && since(c, s) > 60 * 25,
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
      // The first two things in the notes are the only two the player is sure of.
      c.after(4, () => { c.sim.learnClue('c-match'); c.sim.learnClue('c-with-me'); });
      c.sim.devonMarked = true;

      // Northgate, meanwhile. None of this is announced; it is simply there
      // for anybody who goes and looks.
      for (const id of ['p-panel', 'p-tape', 'p-parcel']) c.sim.showPlace(id, true);
      for (const id of ['carvalho', 'brennan', 'courier']) {
        const p = c.sim.person(id);
        if (p) p.visible = true;
      }
      c.after(22, () => {
        c.sim.showPlace('p-alert', true);
        c.sim.message('CARE', [CARE.communityAlert], 5.5, 'normal', 'context');
      });
    },
  },
  {
    id: 'the-crack',
    label: 'The veneer cracks',
    when: (c, s) => s.matchFiredAt > 0 && c.sim.tick >= s.matchFiredAt + 60 * 13,
    run: (c) => {
      /*
       * A drone's shadow crosses them. As its light comes on the world flickers
       * into machine vision for under two seconds and snaps back. Neither
       * character comments on it.
       *
       * This used to raise an anomaly at the player's own position, which
       * tasked a unit to go and investigate the exact spot the player was
       * standing on — so twenty seconds into an ordinary afternoon of skating,
       * a drone and a car converged on a fourteen-year-old who had done
       * nothing. That is the single loudest source of the game feeling like a
       * permanent chase, and it was scenery: the beat is a shadow passing
       * overhead, and a shadow does not need anybody dispatched to cast it.
       *
       * The drone is put on a short route over the player instead, so it
       * genuinely flies across and carries on. Nobody is looking for anybody.
       */
      const drone = c.sim.drones[0];
      const from = { x: c.sim.player.pos.x + 34, y: c.sim.player.pos.y - 44 };
      drone.pos = from;
      drone.route = [
        { x: c.sim.player.pos.x - 6, y: c.sim.player.pos.y + 8 },
        ...drone.route,
      ];
      drone.routeIndex = 0;
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
      // Somebody actually comes. A stop is a person standing next to you.
      const officer = c.sim.person('officer');
      if (officer) {
        officer.pos = { x: c.sim.devonPos.x + (OFFICER_FROM.x - CHANNEL_ENTRY.x) * 0.5, y: c.sim.devonPos.y - 16 };
        officer.visible = true;
        sendTo(officer, { x: c.sim.devonPos.x + 1.3, y: c.sim.devonPos.y - 1.1 });
      }
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
      // No marker, no arrow. The system says where it is looking from, and the
      // player already knows what Northgate Lane looks like from the map.
      c.after(7, () => c.sim.message('CARE', [CARE.monthly], 5.5));
    },
  },

  /*
   * The authored evasion.
   *
   * CM-207 faces the street, so the obvious approach is the one it is watching.
   * Nothing forbids it — a player who is fast, or who is willing to spend the
   * risk, can simply skate up Northgate Lane. What the district offers instead
   * is a rear alley that no forecast can run along, coming out behind the
   * camera through the one gap in the garages.
   *
   * These beats do not gate anything. They only notice.
   */
  {
    id: 'northgate-approach',
    label: 'Northgate — the street is watched',
    when: (c, s) => s.devonReleasedAt > 0 && dist(c.sim.player.pos, { x: 145, y: 60 }) < 46,
    run: (c) => {
      c.sim.message('SYSTEM', [SYSTEM.subjectMonitoring, SYSTEM.risk(c.sim.playerRisk)], 4.5);
    },
  },
  {
    id: 'sable-lane',
    label: 'Sable Lane',
    when: (c, s) => s.devonReleasedAt > 0 && dist(c.sim.player.pos, SABLE_LANE) < 30,
    run: (c, s) => {
      s.enteredSableLane = true;
      // The forecast is still running. It is just running somewhere else.
      c.hud.say([DIALOGUE.sableLane[0]], 3.6);
      c.after(4, () => c.hud.say([DIALOGUE.sableLane[1]], 3.6));
    },
  },
  {
    id: 'reached-cm207',
    label: 'CM-207',
    when: (c) => dist(c.sim.player.pos, CM207) < 22,
    run: (c, s) => {
      s.reachedCm207 = true;
      // Its feed is fine. Nothing is broken. That is the horror. And if the
      // player has broken it, the record it already made is exactly where it
      // was: sabotage stops a lens, not a file.
      const down = c.sim.sensorById.get('CM-207')?.state === 'OFFLINE';
      c.sim.message('SYSTEM', down
        ? ['NODE CM-207 — FEED DOWN', 'RECORD RETAINED — NO CHANGE']
        : ['NODE CM-207 — FEED NOMINAL', 'NO FAULT RECORDED'], 6.5);
      c.after(4, () => c.sim.message('SYSTEM', [SYSTEM.queryAvailable, c.hint.inspect], 6.0));
    },
  },
  {
    id: 'chain-underway',
    label: 'Following the frame',
    when: (_c, s) => s.chainRead >= 3,
    run: (c) => {
      c.hud.say([DIALOGUE.playerThought[2]], 4.0);
    },
  },
  {
    id: 'understood',
    label: 'The pipeline that produced 98.7%',
    when: (_c, s) => s.reachedCm207 && s.chainRead >= RECORD_CHAIN.length,
    run: (c, s) => {
      s.visionUnlockedAt = c.sim.tick;
      // Six records, and the player assembles the argument themselves. Nobody
      // in the chain did anything wrong, and that is the whole of it.
      c.sim.message('SYSTEM', [SYSTEM.recordImmutable, SYSTEM.retention], 8.0, 'strong');
      c.after(5, () => c.hud.say([DIALOGUE.playerThought[1]], 4.5));
      c.after(11, () => c.hud.say([DIALOGUE.playerThought[3]], 5.0));
      c.after(18, () => c.hud.say([DIALOGUE.playerThought[4]], 5.0));
    },
  },
  {
    id: 'mara-texts',
    label: 'Mara',
    // One person in the town has an opinion about what to do next, and she
    // says it the way people do: a text, once, and then she leaves you to it.
    when: (c, s) => s.devonReleasedAt > 0 && c.sim.tick >= s.devonReleasedAt + 60 * 8
      && !(s.talked.mara > 0),
    run: (c) => c.hud.say([DIALOGUE.maraText], 5.5),
  },
  {
    id: 'reprise',
    label: 'The advertisement, unchanged',
    /*
     * The advertisement returns when the player has decided what to do with
     * what they know — not when they have finished reading. Understanding the
     * machine is the middle of the story; what you do about it is the end.
     */
    when: (c, s) => s.ending !== null && s.finaleAt > 0 && c.sim.tick >= s.finaleAt && !s.repriseShown,
    run: (c, s) => {
      s.repriseShown = true;
      c.playReprise(s.ending ?? undefined);
    },
  },
];

/** What is on screen while the player is attending to someone or something. */
export interface TalkView {
  id: string;
  kind: 'person' | 'place';
  /** Who is speaking now; empty for a place, which is only looked at. */
  who: string;
  text: string;
  /** Choices, once the last line is showing. */
  choices: Array<{ id: string; label: string }>;
  /** More lines to come after this one. */
  more: boolean;
}

interface OpenTalk {
  id: string;
  kind: 'person' | 'place';
  lines: Line[];
  index: number;
  learn: string[];
  choices: Array<{ id: string; label: string }>;
}

export interface StorySnapshot {
  state: StoryState;
  fired: string[];
}

export class StoryDirector {
  private fired = new Set<string>();
  /** Work queued by beats, due at a simulation tick rather than a wall clock. */
  private queue: Array<{ dueTick: number; fn: () => void }> = [];
  readonly state = initialStoryState();
  readonly ctx: StoryContext;
  private talk: OpenTalk | null = null;
  private heard = new Set<string>();
  private nextBarkTick = 60 * 20;

  constructor(ctx: Omit<StoryContext, 'after'>) {
    this.ctx = {
      ...ctx,
      after: (seconds, fn) => {
        this.queue.push({ dueTick: this.ctx.sim.tick + Math.round(seconds * 60), fn });
      },
    };
    const bus = ctx.sim.bus;
    bus.on('talk:open', ({ kind, id }) => this.open(kind, id));
    bus.on('talk:advance', () => this.advance());
    bus.on('talk:closed', () => this.closeView());
  }

  /**
   * The afternoon starts here — when the advertisement gets out of the way and
   * the player has control, not when the simulation was constructed.
   */
  begin(): void {
    this.state.startedAt = this.ctx.sim.tick;
  }

  update(): void {
    const sim = this.ctx.sim;
    // How much of the chain has been read. A record counts once the player has
    // held that node, not merely once an edge has named it.
    const read = sim.readNodes;
    let n = 0;
    for (const id of RECORD_CHAIN) if (read.has(id)) n++;
    this.state.chainRead = n;

    // A record, read once the afternoon has given the player a reason to care
    // what it says, goes in the notes.
    if (this.state.matchFiredAt > 0 && sim.tick >= this.state.matchFiredAt) {
      for (const [node, clue] of Object.entries(RECORD_CLUES)) {
        if (read.has(node) && !sim.casefile.has(clue)) sim.learnClue(clue);
      }
    }

    // Due work first, so a beat scheduled for this tick lands before anything
    // it might gate.
    if (this.queue.length) {
      const now = sim.tick;
      const due = this.queue.filter((q) => q.dueTick <= now);
      if (due.length) {
        this.queue = this.queue.filter((q) => q.dueTick > now);
        due.sort((a, b) => a.dueTick - b.dueTick);
        for (const q of due) q.fn();
      }
    }

    for (const beat of BEATS) {
      if (this.fired.has(beat.id)) continue;
      if (!beat.when(this.ctx, this.state)) continue;
      this.fired.add(beat.id);
      beat.run(this.ctx, this.state);
      sim.bus.emitNow('story:beat', { id: beat.id, label: beat.label });
    }

    this.updateBarks();

    // Devon is released, eventually, and nothing is removed from the record.
    if (this.state.devonReleasedAt > 0 && sim.tick === this.state.devonReleasedAt) this.release();
    // ...and he goes home, which takes a while.
    if (this.state.devonReleasedAt > 0 && this.state.devonHomeAt < 0
      && sim.tick >= this.state.devonReleasedAt + 60 * 18) this.sendDevonHome();
  }

  /** Which part of the afternoon the town is talking about. */
  get barkPhase(): BarkPhase {
    const s = this.state;
    if (s.report) return 'reported';
    if (s.devonReleasedAt > 0 && this.ctx.sim.tick >= s.devonReleasedAt) return 'released';
    if (s.matchFiredAt > 0 && this.ctx.sim.tick >= s.matchFiredAt) return 'matched';
    return 'before';
  }

  /**
   * The town, overheard. One snatch of conversation at a time, from whoever
   * is nearest, about whatever the town is currently talking about — and only
   * to a player going slowly enough to hear it.
   */
  private updateBarks(): void {
    const sim = this.ctx.sim;
    if (sim.tick < this.nextBarkTick || sim.engagedWith || sim.aimMode) return;
    if (sim.player.speed > BARK_MAX_SPEED) return;
    const phase = this.barkPhase;
    const here = sim.player.pos;
    const district = sim.world.districtAt(here)?.id ?? '';
    // The nearest ambient resident in earshot, and whoever is walking with them.
    let first = -1, firstD = BARK_RANGE;
    for (let i = 0; i < sim.npcs.length; i++) {
      const d = dist(sim.npcs[i].pos, here);
      if (d < firstD && sim.npcs[i].startled === 0 && sim.npcs[i].fleeing === 0) { first = i; firstD = d; }
    }
    // A street that has had trouble talks about it, whatever else is going on.
    const trouble = levelRank(sim.disturbance.districtLevel(district)) >= levelRank('NOTICED')
      ? sim.disturbance.dominant(district, sim.tick) : null;
    const fits = (b: Bark) => !this.heard.has(b.id)
      && (b.trouble ? b.trouble === trouble : b.phase === phase)
      && (!b.after || b.after === this.state.report)
      && (!b.district || b.district === district);
    let bark: Bark | undefined = trouble && first >= 0 ? BARKS.find((b) => fits(b) && b.trouble) : undefined;
    if (!bark) bark = BARKS.find((b) => fits(b) && b.at && dist(b.at, here) < BARK_RANGE * 1.6);
    if (!bark && first >= 0) bark = BARKS.find((b) => fits(b) && !b.at);
    if (!bark) return;
    this.heard.add(bark.id);
    this.nextBarkTick = sim.tick + Math.round(60 * (BARK_GAP_SECONDS + bark.lines.length * BARK_LINE_SECONDS));

    const a = first >= 0 ? sim.npcs[first] : null;
    let b = a;
    if (a) {
      for (const n of sim.npcs) if (n !== a && dist(n.pos, a.pos) < 7) { b = n; break; }
    }
    const fixed = bark.at;
    bark.lines.forEach((line, i) => {
      const speaker = fixed ? null : (i % 2 === 0 ? a : b);
      this.ctx.after(i * BARK_LINE_SECONDS, () => {
        this.ctx.renderer.speak?.(speaker ? () => speaker.pos : () => fixed!, line, BARK_LINE_SECONDS - 0.2, !!fixed);
      });
    });
    sim.bus.emitNow('story:overheard', { id: bark.id });
  }

  private release(): void {
    const sim = this.ctx.sim;
    sim.devonStopped = false;
    sim.devonFollowing = false;
    // Whatever the player did not do at the stop, they did not do.
    if (this.state.intervened === null) this.state.intervened = false;
    if (sim.engagedWith?.id === 'officer' || sim.engagedWith?.id === 'devon') sim.disengage();
    const officer = sim.person('officer');
    if (officer) sendTo(officer, OFFICER_FROM);
    this.ctx.after(10, () => { if (officer) officer.visible = false; });
    sim.devonVisible = false;
    sim.message('CARE', [CARE.devonHome], 6.0);
    // Somebody from SAFEtrace is out talking to residents this evening.
    const priya = sim.person('priya');
    if (priya) priya.visible = true;
  }

  private sendDevonHome(): void {
    const sim = this.ctx.sim;
    this.state.devonHomeAt = sim.tick;
    sim.devonPos = { ...DEVON_HOME };
    sim.devon.pos = { ...DEVON_HOME };
    sim.devonVisible = true;
    sim.showPlace('p-devon-board', true);
  }

  // ------------------------------------------------------------ attention

  /** What the player's own situation looks like to the people they talk to. */
  standing(): CaseStanding {
    const sim = this.ctx.sim;
    return {
      keyFindings: sim.casefile.keyFindings,
      onRecord: sim.playerSubject.priorContacts > 0,
      misled: sim.casefile.believesMisinformation(MISLEADING),
    };
  }

  talkContext(id: string): TalkContext {
    const sim = this.ctx.sim;
    const s = this.state;
    const standing = this.standing();
    return {
      matched: s.matchFiredAt > 0 && sim.tick >= s.matchFiredAt,
      devonStopped: sim.devonStopped,
      devonReleased: s.devonReleasedAt > 0 && sim.tick >= s.devonReleasedAt,
      intervened: s.intervened,
      has: (c) => sim.casefile.has(c),
      deductions: sim.casefile.deductions.size,
      openConnections: sim.casefile.openConnections(),
      strength: caseStrength(standing),
      onRecord: standing.onRecord,
      misled: standing.misled,
      report: s.report,
      times: s.talked[id] ?? 0,
      toldCarvalho: s.toldCarvalho,
    };
  }

  private open(kind: 'person' | 'place', id: string): void {
    if (kind === 'place') {
      const text = this.placeText(id);
      this.talk = { id, kind, lines: [{ who: '', text: text.text }], index: 0, learn: text.clue ? [text.clue] : [], choices: [] };
      if (!this.state.looked.includes(id)) this.state.looked.push(id);
    } else {
      const convo = openConversation(id, this.talkContext(id));
      if (convo.lines.length === 0) { this.ctx.sim.disengage(); return; }
      this.state.talked[id] = (this.state.talked[id] ?? 0) + 1;
      this.talk = this.fromConversation(id, convo);
    }
    this.show();
  }

  private placeText(id: string): { text: string; clue?: string } {
    return PLACES[id] ?? { text: '' };
  }

  private fromConversation(id: string, c: Conversation): OpenTalk {
    return { id, kind: 'person', lines: c.lines, index: 0, learn: c.learn ?? [], choices: c.choices ?? [] };
  }

  /** Next line; or, at the end of a conversation with nothing to decide, goodbye. */
  advance(): void {
    const t = this.talk;
    if (!t) { this.ctx.sim.disengage(); return; }
    if (t.index < t.lines.length - 1) { t.index++; this.show(); return; }
    if (t.choices.length) return;
    this.ctx.sim.disengage();
  }

  /** Answer. Choices are only offered on the last line. */
  choose(choiceId: string): void {
    const t = this.talk;
    if (!t || t.kind !== 'person' || t.index < t.lines.length - 1) return;
    if (!t.choices.some((c) => c.id === choiceId)) return;
    const { conversation, effect } = chooseOption(t.id, choiceId, this.talkContext(t.id));
    this.apply(effect);
    if (conversation.lines.length === 0) { this.ctx.sim.disengage(); return; }
    this.talk = this.fromConversation(t.id, conversation);
    this.show();
  }

  get talking(): TalkView | null { return this.view(); }

  private view(): TalkView | null {
    const t = this.talk;
    if (!t) return null;
    const line = t.lines[t.index];
    const last = t.index >= t.lines.length - 1;
    return {
      id: t.id, kind: t.kind,
      who: t.kind === 'place' ? '' : (line.who || PEOPLE_NAMES[t.id] || ''),
      text: line.text,
      choices: last ? t.choices : [],
      more: !last,
    };
  }

  private show(): void {
    const t = this.talk;
    if (!t) return;
    // What was said goes in the notes once it has all been said.
    if (t.index >= t.lines.length - 1) {
      for (const id of t.learn) this.ctx.sim.learnClue(id);
      t.learn = [];
    }
    this.ctx.hud.showTalk?.(this.view());
  }

  private closeView(): void {
    const t = this.talk;
    if (t) for (const id of t.learn) this.ctx.sim.learnClue(id);
    this.talk = null;
    this.ctx.hud.showTalk?.(null);
  }

  private apply(effect: TalkEffect): void {
    const sim = this.ctx.sim;
    switch (effect.kind) {
      case 'intervene': {
        if (this.state.intervened !== null) return;
        this.state.intervened = true;
        // You are a party present now, and SAFEtrace writes that down too.
        sim.playerSubject.priorContacts += 1;
        sim.message('SYSTEM', [SYSTEM.partyPresent], 4.2, 'normal', 'important');
        this.ctx.after(6, () => {
          this.ctx.hud.say([DIALOGUE.devonAtStop], 5.0);
          sim.learnClue('c-apron');
        });
        return;
      }
      case 'stand-back':
        if (this.state.intervened === null) this.state.intervened = false;
        return;
      case 'told-carvalho':
        this.state.toldCarvalho = true;
        return;
      case 'report':
        this.report(effect.to);
        return;
      case 'none':
        return;
    }
  }

  /**
   * The decision. Once it is made it is made: the town takes it from here.
   */
  report(to: ReportTarget): void {
    if (this.state.report) return;
    const sim = this.ctx.sim;
    this.state.report = to;
    this.state.ending = resolveEnding(to, this.standing());
    const ending = this.state.ending;
    sim.bus.emitNow('story:beat', { id: `report-${to}`, label: `Reported: ${to}` });
    this.ctx.after(5, () => {
      if (to === 'mara') {
        sim.showPlace('p-window', false);
        sim.showPlace('p-window-case', true);
      }
      sim.message('SYSTEM', [SYSTEM.ending[ending]], 6.0, 'strong', 'critical');
    });
    this.state.finaleAt = sim.tick + 60 * 13;
  }

  // ------------------------------------------------------------ persistence

  snapshot(): StorySnapshot {
    return { state: JSON.parse(JSON.stringify(this.state)) as StoryState, fired: [...this.fired] };
  }

  /**
   * Put the afternoon back where it was. Beats that already fired are not
   * replayed — their consequences are restored as world state instead, so a
   * player who comes back finds Northgate taped off rather than hearing the
   * match twice.
   */
  restore(snap: StorySnapshot): void {
    const sim = this.ctx.sim;
    // A fresh world starts at tick zero, which leaves no "before now" for the
    // things that already happened to have happened in. Give it an hour.
    if (sim.tick < 60 * 60) sim.tick = 60 * 60;
    const tick = sim.tick;
    const rebase = (t: number) => (t < 0 ? t : tick - 1);
    Object.assign(this.state, initialStoryState(), snap.state);
    // Absolute ticks from the old session mean nothing in this one; anything
    // that had happened simply happened "before now".
    const st = this.state;
    st.startedAt = tick - 60 * 60;
    st.metDevonAt = rebase(st.metDevonAt);
    st.matchFiredAt = rebase(st.matchFiredAt);
    st.visionUnlockedAt = rebase(st.visionUnlockedAt);
    st.devonHomeAt = rebase(st.devonHomeAt);
    if (st.devonReleasedAt > 0) st.devonReleasedAt = tick - 1;
    // An ending already seen is not seen again on the way back in; one that was
    // decided but not yet shown still plays.
    st.repriseShown = !!snap.state.repriseShown;
    st.finaleAt = st.ending && !st.repriseShown ? tick + 60 * 4 : -1;
    this.fired = new Set(snap.fired);
    this.queue = [];

    const f = (id: string) => this.fired.has(id);
    if (f('meet-devon')) sim.devonFollowing = true;
    if (f('the-match')) {
      sim.devonMarked = true;
      for (const id of ['p-panel', 'p-tape', 'p-parcel', 'p-alert']) sim.showPlace(id, true);
      for (const id of ['carvalho', 'brennan', 'courier']) { const p = sim.person(id); if (p) p.visible = true; }
    }
    if (f('devon-stopped')) {
      sim.unlockVision();
      if (st.devonReleasedAt > 0) {
        sim.devonStopped = false;
        sim.devonFollowing = false;
        const priya = sim.person('priya');
        if (priya) priya.visible = true;
        this.sendDevonHome();
        this.fired.add('mara-texts');
      }
    }
    if (st.report === 'mara') { sim.showPlace('p-window', false); sim.showPlace('p-window-case', true); }
  }

  get progress(): string[] { return [...this.fired]; }
  get pending(): number { return this.queue.length; }
}
