/** The events the simulation publishes. The only channel to ui and audio. */
import type { Vec2 } from '../core/math';
import type { EscalationLevel, Evidence, Incident, Track } from './surveillance/types';
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
  'player:fire': { pos: Vec2; draw: number };
  'projectile:impact': { kind: ImpactKind; pos: Vec2; targetId?: string };
  'noise:event': { pos: Vec2; label: string };
  'hack:started': { verb: string; nodeId: string; seconds: number };
  'hack:completed': { verb: string; nodeId: string };
  'hack:cancelled': { verb: string; nodeId: string };
  'drone:destabilised': { droneId: string };
  'drone:spotlight': { droneId: string; on: boolean };
  'patrol:contact': { patrolId: string };
  'vision:unlocked': Record<string, never>;
  'veneer:crack': { seconds: number };
  'story:beat': { id: string; label: string };
  'track:updated': { track: Track };
}
