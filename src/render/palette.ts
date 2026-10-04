/**
 * The colour of SAFEtrace — the inked town (docs/40).
 *
 * The street is printed, not lit: ink on paper, a few flat washes between
 * them, and screentone where a graphic novel would put it. That is the
 * environment, and it is deliberately quiet — muted, dirty, weathered, in
 * large graphic fields.
 *
 * Three colours mean something and nothing else may wear them (`SIGNAL`):
 * amber is the player and the player's own marks, cyan is the system and
 * the plan, orange is a warning. The people on screen are the only other
 * saturated things, because telling them apart is gameplay
 * (tests/legibility.test.ts) and because in a printed town a person is the
 * warmest thing in the frame.
 *
 * Machine vision (`MACHINE`) is unchanged by the print: it is a second
 * renderer reading the same records, and it is supposed to look like a
 * different product from the town it is reading.
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
  /**
   * Warning orange: attention, never alarm. Pushed toward red, away from the
   * player's amber — at #FF8B2B the two were nine degrees of hue apart.
   */
  orange: '#FF6326',
  /** Hardware white: the housing of everything SAFEtrace installs. */
  white: '#EEF2F3',
};

/**
 * The three meanings. Sacred: the environment may not borrow these hues, and
 * nothing may use one of them to mean something else (tests/art-direction).
 */
export const SIGNAL = {
  /** The player: the board, the hoodie, the flow ring, the player's own marks. */
  player: '#F2BE3C',
  /** The system and the plan. */
  system: TECH.cyan,
  /** A warning: a camera that has you, an officer coming for you. */
  warning: TECH.orange,
};

/**
 * The print: what the street view is drawn with.
 *
 * Paper and ink, and a short ramp of washes between them. Every value the
 * street uses comes from here or from `weather()` over authored paint, so a
 * future artist can retune the whole town from this one table.
 */
export const PRINT = {
  /** Unprinted stock: the sky, and the far distance fading into it. */
  paper: '#D7D0C0',
  /**
   * The ground past the edge of the modelled town. A verge's wash, a little
   * lighter for distance — paler than that and it reads as a band of fog.
   */
  paperShade: '#8A8976',
  /** The ink. Slightly blue, never pure black. */
  ink: '#16181D',
  /** The town past the modelled edge, as a flat silhouette under the sky. */
  skyline: '#9E9786',
  /** Ink at the weight a scratch or a rule is drawn on paper. */
  rule: 'rgba(22,24,29,0.5)',

  // The ground, from darkest to lightest. Roads are the graphic dark shape.
  road: '#2B2C2F',
  roadScratch: 'rgba(215,208,192,0.30)',
  roadPatch: '#34353A',
  laneMark: 'rgba(222,214,196,0.72)',
  footway: '#B2AB9C',
  forecourt: '#A39C8E',
  tile: '#A0968A',
  verge: '#7A7B68',
  vergeTick: 'rgba(30,33,26,0.55)',
  vergeHatch: 'rgba(30,33,26,0.38)',
  bareEarth: '#978A74',
  gravel: '#9A9385',
  dirt: '#8A7A66',
  water: '#5D6F73',

  /** Cast shadow: a flat wash of ink, hatched over (see tone.ts). */
  shadow: 'rgba(22,24,29,0.30)',
  /** Wood: poles, a bench, a tree's trunk. */
  timber: '#4D4239',
  /** Painted steel: sign posts, fence posts, railings. */
  steel: '#5E6266',
  treeDark: '#2E3830',
  treeLight: '#55604F',
  /** Glass by day, glass with a lamp behind it. */
  glass: '#262C31',
  /** A lit window: unprinted paper in the dark, not lamp-yellow — that hue is the player's. */
  glassLit: '#CBC4AE',
  door: '#3E332B',
  signBoard: '#CFC8B6',
  signInk: '#24292E',
  /** The street-name blades: an old municipal green, faded. */
  bladeGreen: '#3B5547',
  /** Bins: council green-grey. */
  bin: '#4A574F',
  /**
   * A hydrant, a cone, a post box. Street furniture that is bright in life
   * is printed dull here: red and orange are too near the warning, and a
   * saturated blue box is too near the system.
   */
  hydrant: '#7A5C58',
  cone: '#8F7B70',
  mailbox: '#3E4C5A',
  crate: '#8D806C',
};

/**
 * The sky over the town and the ground running out to it. Daytime under
 * heavy cloud: a dark slate lid, and a band of dirty light at the horizon so
 * the skyline reads as silhouette. Depth comes from value, not fog.
 */
export const SKY = {
  top: '#CEC7B6',
  mid: '#D4CDBD',
  horizon: '#D7D0C0',
  /** The far field: distance is printed lighter, fading into the paper. */
  haze: '#D7D0C0',
  ground: '#8A8976',
};

/**
 * The town's ink: a building's edges, a kerb, a slab joint. Lighter and
 * thinner than the ink on people, so a person is always the strongest edge.
 */
export const CITY_INK = '#16181D';

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
   * The player's amber — the flow ring, a stone's ripple, the ammo cache.
   * It is the same colour as the player, because they are the player's: the
   * name is kept for the plan view, which predates the signal table.
   */
  warning: SIGNAL.player,
  player: SIGNAL.player,
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
   * not the player's amber (that would read as a second player). Green is
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
  /** Trousers, skirts' tights, the dark half of a figure: picked per person. */
  trousers: ['#2F343C', '#3D3A36', '#4A4E55', '#5B5446', '#2B2F2A'],
  /** Skin, per resident and stable for them. */
  skinTones: ['#F0D2B6', '#D8A883', '#B47E58', '#7E5239', '#E6BE9C', '#9A6747'],
  /** Devon's bucket hat: pale, so the one shape that is his reads at distance. */
  friendHat: '#D9D1BC',
  /** Hair, and the ink line every figure is drawn with: graphic-novel, not photo. */
  hair: ['#1E1A17', '#3A2A20', '#5A3E28', '#8A6A44', '#C9B79A', '#2B2B33'],
  ink: '#14181D',
  /** The uniform: darker and bluer than anything a resident wears. */
  uniform: '#28374D',
  uniformDark: '#1A2432',
  /** Worn at the shoulder, and only when a unit is actually doing something. */
  responding: SIGNAL.warning,
  intervening: '#E0303A',
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
