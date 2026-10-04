/**
 * The kit: what a good run earns.
 *
 * Kept small on purpose. Nothing here makes the board faster or the rider
 * tougher in a way that a better player would not have beaten anyway; each
 * perk opens a way of skating the city that was not there before — a pole
 * hooked from further off, a launch out of a tighter corner, a landing that
 * used to be a slam, a board quiet enough to roll under a lens. The player's
 * hands remain the thing that is being upgraded.
 *
 * Rep is earned by finishing jobs, and more for finishing them well: one for
 * the job, and one more for each grade above C. It is computed from the
 * bests, so it can only go up, and replaying a job for an S is worth it.
 */
export type PerkId = 'longLine' | 'quickReel' | 'softTrucks' | 'quietBearings';

export interface PerkDef {
  id: PerkId;
  name: string;
  /** What it lets you do, in one line. */
  does: string;
  rep: number;
}

export const PERKS: readonly PerkDef[] = [
  { id: 'longLine', name: 'LONG LINE', does: 'Hook anchors from a third further away.', rep: 3 },
  { id: 'quickReel', name: 'QUICK REEL', does: 'A full launch from a sixty-degree swing, not ninety.', rep: 7 },
  { id: 'softTrucks', name: 'SOFT TRUCKS', does: 'Land fifteen degrees further off line without slamming.', rep: 12 },
  { id: 'quietBearings', name: 'QUIET BEARINGS', does: 'Pushes and landings no longer turn cameras.', rep: 18 },
];

export type Kit = Record<PerkId, boolean>;

export const NO_KIT: Kit = { longLine: false, quickReel: false, softTrucks: false, quietBearings: false };

const GRADE_REP: Record<string, number> = { S: 3, A: 2, B: 1, C: 0 };

/** Rep from a set of per-job best grades. */
export function repFor(bestGrades: readonly string[]): number {
  return bestGrades.reduce((n, g) => n + 1 + (GRADE_REP[g] ?? 0), 0);
}

export function kitFor(rep: number): Kit {
  const k: Kit = { ...NO_KIT };
  for (const p of PERKS) if (rep >= p.rep) k[p.id] = true;
  return k;
}

/** What each perk does to the numbers. */
export const KIT_EFFECT = {
  /** Hook reach multiplier. */
  longLine: 1.35,
  /** Arc for a full charge, as a share of the usual quarter-turn. */
  quickReel: 2 / 3,
  /** Degrees added to the landing tolerance. */
  softTrucks: 15,
  /** Board noise reach multiplier (bails stay loud). */
  quietBearings: 0,
};
