/**
 * The player's own notes.
 *
 * Everything else in the simulation that is called evidence is evidence
 * *against* the player: frames, impacts, tamper logs, filed by a machine that
 * is very good at filing. This is the other ledger — what a sixteen-year-old
 * has actually seen, read and been told, and what they have worked out by
 * putting two of those things next to each other.
 *
 * It is deliberately small. A clue is a sentence with a source. A deduction is
 * a pair of things you already know that mean something together, and it only
 * exists once the player has put them together themselves. Nothing here is
 * scored and nothing here is displayed as a number; what the notes add up to is
 * read, at the end, by the people you choose to show them to.
 *
 * Pure, like the rest of `src/sim`: no DOM, no clock, no randomness.
 */

export type ClueSource = 'record' | 'place' | 'person' | 'overheard' | 'self';

export interface ClueDef {
  id: string;
  thread: string;
  /** A short name, the way you would write it in the margin. */
  title: string;
  /** What you actually saw, read or were told. */
  body: string;
  source: ClueSource;
  /** Where it came from, in words: "CM-207", "Mara, at the shop". */
  where: string;
}

export interface DeductionDef {
  id: string;
  thread: string;
  /** Two things you know. Either may itself be a deduction. */
  from: readonly [string, string];
  title: string;
  body: string;
  /** A clue this shows to be wrong. */
  disproves?: string;
  /** Load-bearing: one of the findings the ending reads. */
  key?: boolean;
}

export interface ThreadDef {
  id: string;
  /** The open question, in the player's own words. */
  question: string;
  /** What it becomes once a key deduction on this thread is made. */
  answered: string;
}

export interface CaseDefs {
  threads: readonly ThreadDef[];
  clues: readonly ClueDef[];
  deductions: readonly DeductionDef[];
}

export type ConnectResult =
  | { kind: 'new'; deduction: DeductionDef }
  | { kind: 'known'; deduction: DeductionDef }
  | { kind: 'nothing' }
  | { kind: 'unknown-input' };

export interface CasefileSnapshot {
  clues: Array<[string, number]>;
  deductions: Array<[string, number]>;
  seen: string[];
}

export class Casefile {
  private readonly clueDefs = new Map<string, ClueDef>();
  private readonly deductionDefs = new Map<string, DeductionDef>();
  /** Clue id -> the tick it was learned. Insertion order is discovery order. */
  readonly clues = new Map<string, number>();
  readonly deductions = new Map<string, number>();
  /** Entries the player has looked at in the notebook since they arrived. */
  readonly seen = new Set<string>();

  constructor(readonly defs: CaseDefs) {
    for (const c of defs.clues) this.clueDefs.set(c.id, c);
    for (const d of defs.deductions) this.deductionDefs.set(d.id, d);
  }

  clue(id: string): ClueDef | undefined { return this.clueDefs.get(id); }
  deduction(id: string): DeductionDef | undefined { return this.deductionDefs.get(id); }

  /** Anything in the notes, clue or deduction. */
  has(id: string): boolean { return this.clues.has(id) || this.deductions.has(id); }

  /** Write something down. Returns false if it was already there. */
  learn(id: string, tick: number): boolean {
    if (this.clues.has(id)) return false;
    if (!this.clueDefs.has(id)) throw new Error(`unknown clue ${id}`);
    this.clues.set(id, tick);
    return true;
  }

  /**
   * Put two things side by side.
   *
   * Order does not matter. Connecting two things that mean nothing together
   * costs nothing and says so; the notebook is a place to think, not a quiz.
   */
  connect(a: string, b: string, tick: number): ConnectResult {
    if (!this.has(a) || !this.has(b) || a === b) return { kind: 'unknown-input' };
    for (const d of this.defs.deductions) {
      const [x, y] = d.from;
      if (!((x === a && y === b) || (x === b && y === a))) continue;
      if (this.deductions.has(d.id)) return { kind: 'known', deduction: d };
      this.deductions.set(d.id, tick);
      return { kind: 'new', deduction: d };
    }
    return { kind: 'nothing' };
  }

  /** A clue the player's own reasoning has since shown to be wrong. */
  isDisproved(clueId: string): boolean {
    for (const id of this.deductions.keys()) {
      if (this.deductionDefs.get(id)?.disproves === clueId) return true;
    }
    return false;
  }

  /** How many load-bearing findings the player has actually made. */
  get keyFindings(): number {
    let n = 0;
    for (const id of this.deductions.keys()) if (this.deductionDefs.get(id)?.key) n++;
    return n;
  }

  get keyTotal(): number {
    return this.defs.deductions.filter((d) => d.key).length;
  }

  /** Something the player still believes that their own notes contradict — or would, if they looked. */
  believesMisinformation(misleading: readonly string[]): boolean {
    return misleading.some((id) => this.clues.has(id) && !this.isDisproved(id));
  }

  /** Has the question on this thread been answered by a key deduction? */
  threadAnswered(threadId: string): boolean {
    for (const id of this.deductions.keys()) {
      const d = this.deductionDefs.get(id);
      if (d?.key && d.thread === threadId) return true;
    }
    return false;
  }

  /** Entries on a thread, clues first then deductions, in the order found. */
  entriesOn(threadId: string): { clues: ClueDef[]; deductions: DeductionDef[] } {
    const clues: ClueDef[] = [];
    for (const id of this.clues.keys()) {
      const c = this.clueDefs.get(id);
      if (c && c.thread === threadId) clues.push(c);
    }
    const deductions: DeductionDef[] = [];
    for (const id of this.deductions.keys()) {
      const d = this.deductionDefs.get(id);
      if (d && d.thread === threadId) deductions.push(d);
    }
    return { clues, deductions };
  }

  /**
   * How many connections on a thread are still there to be made from what the
   * player already holds. Never which ones — only that looking harder at what
   * you have is worth it, or that it is time to go and find something new.
   */
  openConnections(threadId?: string): number {
    let n = 0;
    for (const d of this.defs.deductions) {
      if (threadId && d.thread !== threadId) continue;
      if (this.deductions.has(d.id)) continue;
      if (this.has(d.from[0]) && this.has(d.from[1])) n++;
    }
    return n;
  }

  get unseen(): number {
    let n = 0;
    for (const id of this.clues.keys()) if (!this.seen.has(id)) n++;
    for (const id of this.deductions.keys()) if (!this.seen.has(id)) n++;
    return n;
  }

  markAllSeen(): void {
    for (const id of this.clues.keys()) this.seen.add(id);
    for (const id of this.deductions.keys()) this.seen.add(id);
  }

  snapshot(): CasefileSnapshot {
    return { clues: [...this.clues], deductions: [...this.deductions], seen: [...this.seen] };
  }

  restore(s: CasefileSnapshot): void {
    this.clues.clear(); this.deductions.clear(); this.seen.clear();
    for (const [id, t] of s.clues) if (this.clueDefs.has(id)) this.clues.set(id, t);
    for (const [id, t] of s.deductions) if (this.deductionDefs.has(id)) this.deductions.set(id, t);
    for (const id of s.seen) this.seen.add(id);
  }
}

/**
 * Structural checks over authored case content, in the same spirit as
 * `validateWorld`: a deduction that names a clue nobody can find is a door
 * painted on a wall.
 */
export function validateCase(defs: CaseDefs): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const threads = new Set(defs.threads.map((t) => t.id));
  for (const c of defs.clues) {
    if (ids.has(c.id)) out.push(`duplicate id ${c.id}`);
    ids.add(c.id);
    if (!threads.has(c.thread)) out.push(`clue ${c.id} on unknown thread ${c.thread}`);
  }
  for (const d of defs.deductions) {
    if (ids.has(d.id)) out.push(`duplicate id ${d.id}`);
    ids.add(d.id);
    if (!threads.has(d.thread)) out.push(`deduction ${d.id} on unknown thread ${d.thread}`);
  }
  const pairs = new Set<string>();
  for (const d of defs.deductions) {
    for (const f of d.from) if (!ids.has(f)) out.push(`deduction ${d.id} needs unknown ${f}`);
    if (d.from[0] === d.from[1]) out.push(`deduction ${d.id} connects a thing to itself`);
    const key = [...d.from].sort().join('+');
    if (pairs.has(key)) out.push(`two deductions from the same pair ${key}`);
    pairs.add(key);
    if (d.disproves && !defs.clues.some((c) => c.id === d.disproves)) {
      out.push(`deduction ${d.id} disproves unknown clue ${d.disproves}`);
    }
  }
  return out;
}
