/**
 * The pursuit state machine.
 *
 * Being pursued used to be an implicit property of two numbers — a `wantedUntil`
 * tick and a track confidence — read independently by the dispatcher, the
 * assets and the HUD. Nothing owned the question "is anybody actually after
 * me right now", so nothing could answer it, and the answer a player got was
 * whatever fell out of tasking that frame. Two of the loudest complaints about
 * the build came from exactly that: somebody appeared to be chasing a player
 * who had done nothing, and a player who had broken contact was found again
 * anyway, because a unit driving at a live estimate never stops being a homing
 * missile no matter how the estimate is worded.
 *
 * So the progression is explicit, it is one object, and it is the only thing
 * allowed to hand a unit the player's live position:
 *
 *   NOT_PURSUING -> ALERT -> PURSUING -> LOST -> SEARCHING -> CLEAR
 *
 * The rules that matter, stated once here rather than implied in five places:
 *
 *  - A session begins NOT_PURSUING. Nothing about moving through the town can
 *    change that; only a reported offence can.
 *  - Live coordinates exist in exactly one state, PURSUING, and PURSUING
 *    requires something to currently have eyes on the subject. Every other
 *    state routes to `lastKnown`, which is a place the subject *was*.
 *  - CLEAR is real. It wipes the reason, and the town goes back to merely
 *    watching until the subject gives it a new one.
 */
import type { Vec2 } from '../../core/math';
import { hashString } from '../../core/rng';
import type { Track } from './types';

export type PursuitState =
  /** Nobody is looking for this subject. The starting state, and the goal. */
  | 'NOT_PURSUING'
  /** There is a reason, and a place to start from. Nobody has eyes on them. */
  | 'ALERT'
  /** Something can see them right now. This is the only state with a live fix. */
  | 'PURSUING'
  /** The fix has just gone stale. Units keep going to where it last was. */
  | 'LOST'
  /** Working outward from the last known location, guessing. */
  | 'SEARCHING'
  /** They got away. The reason is discarded on the way through. */
  | 'CLEAR';

export const PURSUIT = {
  /** Track confidence at or above which something genuinely has eyes on you. */
  contact: 0.25,
  /**
   * How long units converge on the reported location before admitting nobody
   * saw the subject leave it.
   */
  alertTicks: 60 * 10,
  /**
   * How long a broken contact is still treated as a pursuit.
   *
   * Six seconds, which is the number this game was already tuned to: long
   * enough that ducking behind one hedge is not an escape, short enough that
   * breaking line of sight and *keeping going* is.
   */
  lostTicks: 60 * 6,
  /** How long the search around the last known location runs before it is given up. */
  searchTicks: 60 * 25,
  /** How long CLEAR is held, so the transition is observable, before it retires. */
  clearTicks: 60 * 2,
  /** How far from the last known location the search spreads, in metres. */
  searchRadius: 38,
  /** How often a searching unit is given a fresh place to look. */
  searchRetaskTicks: 60 * 6,
};

/** States in which somebody is, in some sense, coming. */
export const ACTIVE_STATES: ReadonlySet<PursuitState> =
  new Set<PursuitState>(['ALERT', 'PURSUING', 'LOST', 'SEARCHING']);

export interface PursuitSnapshot {
  state: PursuitState;
  /** Tick the current state was entered. */
  since: number;
  /**
   * The only position the pursuit is allowed to know outside of PURSUING.
   *
   * Written from the *track estimate* at the moment contact was last held —
   * never from the subject's true position, which is why hiding works.
   */
  lastKnown: Vec2 | null;
  lastKnownTick: number;
  /** What started this, in the system's own words. */
  reason: string;
}

/**
 * One subject's pursuit. The game only ever pursues the player, but nothing
 * here assumes that: the director keys on track id.
 */
export class PursuitDirector {
  private states = new Map<string, PursuitSnapshot>();

  reset(): void { this.states.clear(); }

  /** The pursuit for a track, creating a dormant one if it has never had a reason. */
  get(trackId: string): PursuitSnapshot {
    let s = this.states.get(trackId);
    if (!s) {
      s = { state: 'NOT_PURSUING', since: 0, lastKnown: null, lastKnownTick: -99999, reason: '' };
      this.states.set(trackId, s);
    }
    return s;
  }

  stateOf(trackId: string): PursuitState { return this.get(trackId).state; }

  /**
   * Somebody did something the system considers worth sending a unit for.
   *
   * The pursuit starts from what the system *believes* about where they are,
   * which is the track estimate. If nothing had a fix at the time, it starts
   * from where the offence happened, which is the honest thing to know.
   */
  report(trackId: string, track: Track, tick: number, at: Vec2, reason: string): void {
    const s = this.get(trackId);
    const held = track.confidence >= PURSUIT.contact;
    s.lastKnown = held ? { x: track.estimate.x, y: track.estimate.y } : { x: at.x, y: at.y };
    s.lastKnownTick = tick;
    s.reason = reason;
    if (s.state === 'NOT_PURSUING' || s.state === 'CLEAR') this.enter(s, held ? 'PURSUING' : 'ALERT', tick);
    else if (held && s.state !== 'PURSUING') this.enter(s, 'PURSUING', tick);
  }

  private enter(s: PursuitSnapshot, next: PursuitState, tick: number): void {
    if (s.state === next) return;
    s.state = next;
    s.since = tick;
  }

  /**
   * Advance one tick.
   *
   * Returns the state after the transition, so callers do not have to guess at
   * ordering. `wanted` is the file still being open; `contact` is something
   * having eyes on the subject *this tick*. Those are the only two inputs, and
   * neither of them is the subject's true position.
   */
  update(trackId: string, track: Track, tick: number): PursuitState {
    const s = this.get(trackId);
    const contact = track.confidence >= PURSUIT.contact;
    const wanted = tick <= track.wantedUntil;

    /*
     * A live fix refreshes the only place the pursuit is allowed to remember —
     * and only while there is a pursuit to remember it for.
     *
     * Keeping a last known position for somebody nobody is looking for is a
     * standing record of where a fourteen-year-old was, held by a system that
     * has no reason to hold it, and it is exactly the kind of thing this game
     * is about. It is also the seed a future bug would grow a chase from.
     */
    if (contact && ACTIVE_STATES.has(s.state)) {
      s.lastKnown = { x: track.estimate.x, y: track.estimate.y };
      s.lastKnownTick = tick;
    }

    switch (s.state) {
      case 'NOT_PURSUING':
        if (wanted) this.enter(s, contact ? 'PURSUING' : 'ALERT', tick);
        break;

      case 'ALERT':
        if (!wanted) this.enter(s, 'CLEAR', tick);
        else if (contact) this.enter(s, 'PURSUING', tick);
        else if (tick - s.since >= PURSUIT.alertTicks) this.enter(s, 'SEARCHING', tick);
        break;

      case 'PURSUING':
        if (!wanted) this.enter(s, 'CLEAR', tick);
        else if (!contact) this.enter(s, 'LOST', tick);
        break;

      case 'LOST':
        if (!wanted) this.enter(s, 'CLEAR', tick);
        else if (contact) this.enter(s, 'PURSUING', tick);
        else if (tick - s.since >= PURSUIT.lostTicks) this.enter(s, 'SEARCHING', tick);
        break;

      case 'SEARCHING':
        if (!wanted) this.enter(s, 'CLEAR', tick);
        else if (contact) this.enter(s, 'PURSUING', tick);
        else if (tick - s.since >= PURSUIT.searchTicks) this.enter(s, 'CLEAR', tick);
        break;

      case 'CLEAR':
        /*
         * Getting away means getting away.
         *
         * The file used to stay open for the full two minutes whatever the
         * player did, so a successful escape only bought a pause: the next
         * lens to catch them restarted the whole thing for something they had
         * already outrun. Clearing the reason here is what makes an escape an
         * escape. Doing it again costs another offence.
         */
        track.wantedUntil = -1;
        s.lastKnown = null;
        if (tick - s.since >= PURSUIT.clearTicks) this.enter(s, 'NOT_PURSUING', tick);
        break;
    }

    return s.state;
  }

  /**
   * Where a unit should be sent, given the state.
   *
   * PURSUING is deliberately absent: a live fix is the dispatcher's business,
   * because it needs the forecast rather than the estimate. Everything else
   * gets a place, and a place is all it gets.
   */
  searchPoint(trackId: string, tick: number, assetId: string): Vec2 | null {
    const s = this.get(trackId);
    if (!s.lastKnown) return null;
    if (s.state !== 'SEARCHING') return { x: s.lastKnown.x, y: s.lastKnown.y };

    /*
     * A search pattern, not a beeline.
     *
     * Units that all drive to one point are a unit that drives to one point.
     * The ring below is deterministic — hashed from the asset's own id and
     * which leg of the search it is on — so a replay searches identically, and
     * nothing about it can be steered by where the player actually is.
     */
    const leg = Math.floor((tick - s.since) / PURSUIT.searchRetaskTicks);
    const h = hashString(`${assetId}:${leg}`);
    const angle = ((h % 1000) / 1000) * Math.PI * 2;
    const radius = PURSUIT.searchRadius * (0.35 + ((h >>> 10) % 1000) / 1000 * 0.65);
    return { x: s.lastKnown.x + Math.cos(angle) * radius, y: s.lastKnown.y + Math.sin(angle) * radius };
  }
}
