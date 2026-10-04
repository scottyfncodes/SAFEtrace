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
  /** Cameras the player has noticed, for the plan. Absent in older saves. */
  knownSensors?: string[];
  /** A line for the continue button: where the afternoon had got to. */
  label: string;
}

// Storage keys keep the game's original name on purpose: renaming them would
// silently lose every player's saved afternoon and endings. Never shown.
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

/**
 * Jobs: the best each one has been done, in each of the four ways a run can
 * be good, plus the best overall. Kept apart from the afternoon, so starting
 * a new afternoon never costs a personal best.
 */
export interface JobRecord {
  total: number;
  grade: string;
  time: number;
  style: number;
  exposure: number;
  flow: number;
  ghost: boolean;
  runs: number;
}
const JOBS_KEY = 'underwatch.jobs.v1';

export function loadJobRecords(): Record<string, JobRecord> {
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

/** Fold one finished run into the records. Returns the record and which bests it set. */
export function recordJobRun(
  id: string, r: { total: number; grade: string; time: number; style: number; exposure: number; flow: number; ghost: boolean },
): { record: JobRecord; bests: Array<'total' | 'time' | 'style' | 'exposure' | 'flow'> } {
  const all = loadJobRecords();
  const prev = all[id];
  const bests: Array<'total' | 'time' | 'style' | 'exposure' | 'flow'> = [];
  const record: JobRecord = prev ? { ...prev, runs: prev.runs + 1 } : { ...r, runs: 1 };
  if (prev) {
    if (r.total > prev.total) { record.total = r.total; record.grade = r.grade; bests.push('total'); }
    if (r.time < prev.time) { record.time = r.time; bests.push('time'); }
    if (r.style > prev.style) { record.style = r.style; bests.push('style'); }
    if (r.exposure < prev.exposure) { record.exposure = r.exposure; bests.push('exposure'); }
    if (r.flow > prev.flow) { record.flow = r.flow; bests.push('flow'); }
    record.ghost = prev.ghost || r.ghost;
  }
  all[id] = record;
  try { localStorage.setItem(JOBS_KEY, JSON.stringify(all)); } catch { /* best effort */ }
  return { record, bests };
}
