/**
 * Three colour systems — near-future urban noir (docs/39).
 *
 * The veneer is the town as it is: concrete, asphalt, faded paint, weathered
 * brick, a sky that is mostly cloud. Muted, textured, human, slightly worn. It
 * is still a place you would want to skate; it is no longer a brochure.
 *
 * The machine is the opposite on purpose: clean, sharp, precise, and
 * attractive. Electric cyan, acid green, warning orange — and nothing else.
 * The system is not presented as evil, it is presented as trustworthy, which
 * is worse. The contrast between the two is the game's premise in one image:
 * a messy, ambiguous world, and a system that is extremely confident about it.
 *
 * The people on screen are the exception to the muting. The rider, Devon and
 * the uniform keep their full colour, because telling them apart at a glance
 * is gameplay (tests/legibility.test.ts), and because in a grey city a person
 * is the warmest thing in the frame.
 */

/**
 * SAFEtrace's own accents. Everything the company makes, says or draws uses
 * these and only these, and nothing in the physical town does.
 */
export const TECH = {
  /** Electric cyan: the system at rest, working, reassuring. */
  cyan: '#2FE3F2',
  /** The same cyan, deep enough to print on a white sign or a pale wall. */
  cyanInk: '#0B7F8E',
  /** Acid green: a match, a forecast, a confident conclusion. */
  acid: '#B6F23A',
  /** Warning orange: attention, never alarm. */
  orange: '#FF8B2B',
  /** Hardware white: the housing of everything SAFEtrace installs. */
  white: '#EEF2F3',
};

/**
 * The sky over the town and the ground running out to it. Daytime under
 * heavy cloud: a dark slate lid, and a band of dirty light at the horizon so
 * the skyline reads as silhouette. Depth comes from value, not fog.
 */
export const SKY = {
  top: '#2C333A',
  mid: '#565F66',
  horizon: '#8C8676',
  /** The faint far-field wash; kept light-handed so it never reads as fog. */
  haze: '#6E7473',
  ground: '#3A3E33',
};

/**
 * The town's ink: a building's edges, a kerb, a slab joint. Lighter and
 * thinner than the ink on people, so a person is always the strongest edge.
 */
export const CITY_INK = '#0E1114';

/**
 * Wear a colour down into the town.
 *
 * Building paint comes from content, authored when Bellhaven was a pastel
 * suburb. Rather than re-author every wall, the renderer weathers it on the
 * way to the glass: most of the saturation goes, it darkens a little, and it
 * drifts toward the concrete everything here is really made of. Different
 * houses still read as different houses; none of them reads as new.
 */
export function weather(c: string, amount = 1): string {
  const [r, g, b] = hex(c);
  const grey = r * 0.3 + g * 0.55 + b * 0.15;
  const keep = 1 - 0.55 * amount;           // saturation that survives
  const dark = 1 - 0.3 * amount;            // and the grime on top of it
  const tint = [150, 148, 140];             // weathered concrete
  const k = 0.12 * amount;
  const ch = (v: number, t: number) => Math.round(((grey + (v - grey) * keep) * dark) * (1 - k) + t * k);
  return `rgb(${ch(r, tint[0])},${ch(g, tint[1])},${ch(b, tint[2])})`;
}

export const VENEER = {
  void: '#7E8483',
  asphalt: '#30353A',
  asphaltEdge: '#262A2E',
  smoothConcrete: '#6F706B',
  roughConcrete: '#67645D',
  tile: '#6F685E',
  grass: '#474A3D',
  grassDark: '#3F4437',
  gravel: '#69645B',
  dirt: '#5C5042',
  water: '#3D545B',
  shadow: 'rgba(10,13,18,0.42)',
  shadowSoft: 'rgba(10,13,18,0.24)',
  wallWarm: '#7A7064',
  wallCool: '#666D71',
  roofTerracotta: '#5A3F36',
  roofSlate: '#2C3136',
  line: 'rgba(12,14,18,0.5)',
  roadMark: 'rgba(222,216,196,0.42)',
  accent: TECH.cyanInk,
  /**
   * The town's and the player's amber — the flow ring, a stone's ripple, the
   * ammo cache. Not SAFEtrace's warning orange, which nothing outside the
   * system may wear.
   */
  warning: '#E8A33D',
  player: '#E8563F',
  /*
   * Devon was blue. The uniform, below, is also blue — darker and greyer, but
   * this is a game about being watched by the police, and "blue figure,
   * standing still, near you" is a read the eye makes before it gets as far
   * as comparing shades. A playtester's first reaction to a screenshot of
   * their own best friend was "oh that's Devon?? I thought that was the cop!"
   *
   * So blue is the uniform's alone now. Devon gets a colour from nowhere near
   * it: not the civilian palette below (he is a named character, not one more
   * resident), not amber or red (those are the officer's own alert states),
   * not the player's orange (that would read as a second player). Green is
   * the one hue nothing else in a person's silhouette uses.
   */
  friend: '#5FBF52',
  tree: '#323D30',
  /*
   * People, and telling them apart.
   *
   * A resident used to be one grey-blue and an officer a slightly darker one,
   * on the same silhouette. At the size a person subtends on a phone through a
   * long lens those are the same figure — so every one of the town's nineteen
   * residents read as police, and the two actual officers read as nobody in
   * particular. A player who cannot tell a neighbour from a constable is being
   * hunted by the whole town.
   *
   * Residents wear their own clothes, picked per person and stable for the
   * life of the session. None of them is the uniform.
   */
  civilian: [
    '#A8624C', '#73905E', '#C29548', '#806FA0',
    '#4F8E9E', '#A87E90', '#8F8775', '#B5523F',
  ],
  /** Hair, and the ink line every figure is drawn with: graphic-novel, not photo. */
  hair: ['#1E1A17', '#3A2A20', '#5A3E28', '#8A6A44', '#C9B79A', '#2B2B33'],
  ink: '#14181D',
  /** The uniform: darker and bluer than anything a resident wears. */
  uniform: '#28374D',
  uniformDark: '#1A2432',
  /** Worn at the shoulder, and only when a unit is actually doing something. */
  responding: '#E8A33D',
  intervening: '#FF5C47',
  skin: '#F2D3B8',
  treeLight: '#3F4C3B',
  glass: 'rgba(70,88,98,0.88)',
};

export const MACHINE = {
  void: '#05090D',
  surface: '#0A161E',
  surfaceAlt: '#10252F',
  structure: '#1E5A66',
  structureBright: '#3790A0',
  data: TECH.cyan,
  identity: '#F2F7F9',
  /** A conclusion the system is sure of: MATCH, CONFIDENCE, the forecast line. */
  confirm: TECH.acid,
  coverage: 'rgba(47,227,242,0.12)',
  coverageEdge: 'rgba(47,227,242,0.45)',
  prediction: TECH.acid,
  edge: 'rgba(55,144,160,0.42)',
  riskLow: TECH.cyan,
  riskMid: TECH.orange,
  riskHigh: '#FF4A3D',
  grid: 'rgba(46,110,124,0.28)',
};

/** Colour-blind-safe variant: risk is carried by lightness as well as hue. */
export const MACHINE_SAFE = {
  ...MACHINE,
  riskLow: '#8FD9FF',
  riskMid: '#FFD98F',
  riskHigh: '#FFFFFF',
  prediction: '#DDF7A8',
  confirm: '#DDF7A8',
};

export function riskColour(risk: number, safe = false): string {
  const m = safe ? MACHINE_SAFE : MACHINE;
  if (risk < 30) return m.riskLow;
  if (risk < 65) return m.riskMid;
  return m.riskHigh;
}

/** Linear blend between two hex colours. */
export function mix(a: string, b: string, t: number): string {
  const pa = hex(a), pb = hex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function hex(c: string): [number, number, number] {
  if (c.startsWith('rgb')) {
    const m = c.match(/[\d.]+/g);
    return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [0, 0, 0];
  }
  const s = c.replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

export function shade(c: string, amount: number): string {
  const [r, g, b] = hex(c);
  const k = amount >= 0 ? 1 - amount : 1 + amount;
  const add = amount >= 0 ? 255 * amount : 0;
  return `rgb(${Math.round(r * k + add)},${Math.round(g * k + add)},${Math.round(b * k + add)})`;
}

export function alpha(c: string, a: number): string {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

export const SURFACE_COLOUR: Record<string, string> = {
  asphalt: VENEER.asphalt,
  smoothConcrete: VENEER.smoothConcrete,
  roughConcrete: VENEER.roughConcrete,
  tile: VENEER.tile,
  grass: VENEER.grass,
  gravel: VENEER.gravel,
  dirt: VENEER.dirt,
  water: VENEER.water,
};
