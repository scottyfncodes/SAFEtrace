/**
 * Where an afternoon is kept between visits.
 *
 * Not a save system with slots and names — one afternoon, remembered, the way
 * a phone remembers where you were in a podcast. And, separately, which
 * endings a player has already seen, because the second afternoon is a
 * different game once you know how the first one ended.
 *
 * The simulation itself is not serialised: risk, tracks and drones are the
 * weather, and they are allowed to start fresh. What is kept is what the
 * player did and what they know.
 */
import type { CasefileSnapshot } from '../sim/casefile';

export interface SavedAfternoon {
  v: 1;
  savedAt: number;
  story: { state: unknown; fired: string[] };
  casefile: CasefileSnapshot;
  player: { x: number; y: number; heading: number };
  readNodes: string[];
  discoveredNodes: string[];
  /** Nodes whose `discovered` flag was set by QUERY/TRACE. */
  revealed: string[];
  priorContacts: number;
  /** Whether the Community Safety Score has been found, and where. Absent in older saves. */
  scoreFoundAt?: string | null;
  /** A line for the continue button: where the afternoon had got to. */
  label: string;
}

const KEY = 'safetrace.afternoon.v1';
const ENDINGS_KEY = 'safetrace.endings.v1';

export function loadAfternoon(): SavedAfternoon | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedAfternoon;
    return s && s.v === 1 ? s : null;
  } catch { return null; }
}

export function saveAfternoon(s: SavedAfternoon): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode, full disk */ }
}

export function clearAfternoon(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

export function loadEndingsSeen(): string[] {
  try {
    const raw = localStorage.getItem(ENDINGS_KEY);
    const v = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

export function recordEndingSeen(id: string): string[] {
  const seen = loadEndingsSeen();
  if (!seen.includes(id)) seen.push(id);
  try { localStorage.setItem(ENDINGS_KEY, JSON.stringify(seen)); } catch { /* best effort */ }
  return seen;
}
