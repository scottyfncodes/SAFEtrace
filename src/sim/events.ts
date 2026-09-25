/** The events the simulation publishes. The only channel to ui and audio. */
import type { Vec2 } from '../core/math';
import type { EscalationLevel, Evidence, Incident, Track } from './surveillance/types';
import type { PursuitState } from './surveillance/pursuit';
import type { ImpactKind } from './slingshot';

/**
 * How much of the player's attention this is allowed to take.
 *
 * Separate from `register`, which is brand voice, and from `emphasis`, which is
 * typography. Before this existed the only axis was the brand, so a weather
 * advert and an authorised intervention arrived as the same card in the same
 * stack, and the first human to play could not tell which was which. If
 * everything behaves like an emergency then nothing is one.
 */
export type MessagePriority =
  /** Something is happening to you, now. Never suppressed, never queued behind. */
  | 'critical'
  /** Worth looking up for. Does not interrupt what you are doing. */
  | 'important'
  /** Useful, and it can wait. */
  | 'context'
  /** The town talking to itself. Texture, and the first thing to be dropped. */
  | 'ambient';

export interface SafetraceMessage {
  id: string;
  /** SYSTEM = all-caps clinical register. CARE = warm consumer register. */
  register: 'SYSTEM' | 'CARE';
  lines: string[];
  /** Seconds on screen. */
  duration: number;
  emphasis?: 'normal' | 'strong';
  priority: MessagePriority;
}

export interface SimEvents extends Record<string, unknown> {
  'safetrace:message': SafetraceMessage;
  'sensor:offline': { sensorId: string; label: string };
  /** A camera has just acquired the player, close enough and slow enough to hear. */
  'sensor:noticed': { sensorId: string; pos: Vec2 };
  'sensor:misaligned': { sensorId: string; label: string };
  'evidence:created': { evidence: Evidence };
  'evidence:resolved': { evidence: Evidence; linked: boolean; candidateCount: number };
  'escalation:changed': { from: EscalationLevel; to: EscalationLevel; risk: number };
  /**
   * The pursuit changed state. Distinct from escalation, which is a score band:
   * this is the answer to "is anybody actually coming", and it moves only on a
   * reported offence, a sighting, a lost contact, or a search giving up.
   */
  'pursuit:changed': { from: PursuitState; to: PursuitState };
  'incident:opened': { incident: Incident };
  'match:false-positive': { identity: string; confidence: number; incidentId: string };
  'aim:entered': Record<string, never>;
  'aim:exited': Record<string, never>;
  /** A bearing bounced off a person. Nobody is hurt; everybody saw. */
  'person:struck': { targetId: string; pos: Vec2; witnesses: number; seen: boolean };
  'player:bail': { pos: Vec2 };
  'player:land': { pos: Vec2; speed: number };
  'player:push': { pos: Vec2; speed: number };
  'player:pop': { pos: Vec2 };
  /** The board came all the way round and the feet caught it. */
  'player:trick': { pos: Vec2; name: string };
  /** Still holding it when the wheels touched down. */
  'player:grab': { pos: Vec2; name: string };
  'player:fire': { pos: Vec2; draw: number; angle: number; pitch: number };
  /**
   * A stone met something. `z` is where on it, `speed` how hard, and `surface`
   * what it met when that was the ground or a wall — so the sound and the dust
   * can be the right sound and the right dust.
   */
  'projectile:impact': {
    kind: ImpactKind; pos: Vec2; targetId?: string;
    z?: number; speed?: number; surface?: string; vel?: Vec2;
  };
  /** A stone skipped off the ground or glanced off a wall and kept going. */
  'projectile:bounce': { pos: Vec2; z: number; speed: number; surface: string; wall: boolean };
  /** A stone came to rest. */
  'projectile:settled': { pos: Vec2 };
  /**
   * Something in the world turned toward a sound: a camera, or a person.
   * `discounted` when the cameras looked back up the throw instead, because
   * the place has heard too many noises to believe this one.
   */
  'world:attention': { pos: Vec2; sensors: string[]; people: number; discounted?: boolean };
  /** A district crossed a disturbance level, up or down. */
  'disturbance:level': { district: string; from: string; to: string; pos: Vec2 };
  /** A place became a pattern (see disturbance.ts), and somebody is being sent to look. */
  'disturbance:flagged': { pos: Vec2 };
  /** A stone went through a tree. Leaves, and whatever was sitting in it. */
  'foliage:hit': { pos: Vec2; z: number; birds: boolean; treeId: string };
  'noise:event': { pos: Vec2; label: string };
  'hack:started': { verb: string; nodeId: string; seconds: number };
  'hack:completed': { verb: string; nodeId: string };
  'hack:cancelled': { verb: string; nodeId: string };
  'drone:destabilised': { droneId: string };
  'drone:spotlight': { droneId: string; on: boolean };
  'patrol:contact': { patrolId: string };
  'vision:unlocked': Record<string, never>;
  /** The player has found the number SAFEtrace keeps on them. */
  'score:discovered': { where: string; score: number };
  'devon:met': Record<string, never>;
  'veneer:crack': { seconds: number };
  'story:beat': { id: string; label: string };
  /** A snatch of the town's own conversation, overheard. */
  'story:overheard': { id: string };
  /** The player has stopped to talk to somebody, or to look at something. */
  'talk:open': { kind: 'person' | 'place'; id: string };
  /** The interact button, pressed while already attending to something. */
  'talk:advance': Record<string, never>;
  'talk:closed': { id: string };
  /** Something new in the player's own notes. */
  'case:clue': { id: string };
  'case:deduction': { id: string; key: boolean };
  'track:updated': { track: Track };
}
