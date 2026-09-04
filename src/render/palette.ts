/**
 * Three colour systems.
 *
 * The veneer is warm and saturated because Bellhaven is a nice place; the
 * horror is structural, not chromatic. The machine is cold, luminous and
 * deliberately beautiful — the system is not presented as evil, it is presented
 * as elegant, which is worse.
 */

export const VENEER = {
  void: '#DCE9F2',
  asphalt: '#6E7A85',
  asphaltEdge: '#5B6771',
  smoothConcrete: '#C3C7C4',
  roughConcrete: '#C9C4B8',
  tile: '#D6CFC2',
  grass: '#8FB369',
  grassDark: '#7CA25C',
  gravel: '#A9A294',
  dirt: '#B29A78',
  water: '#7FB2C4',
  shadow: 'rgba(58,76,107,0.24)',
  shadowSoft: 'rgba(58,76,107,0.13)',
  wallWarm: '#F0E3D0',
  wallCool: '#DCE4E8',
  roofTerracotta: '#C4714E',
  roofSlate: '#56626E',
  line: 'rgba(40,52,66,0.30)',
  roadMark: 'rgba(246,242,230,0.55)',
  accent: '#2C8C8C',
  warning: '#E8A33D',
  player: '#E8563F',
  friend: '#3F8FE8',
  tree: '#5E8A54',
  treeLight: '#7BA766',
  glass: 'rgba(180,214,232,0.85)',
};

export const MACHINE = {
  void: '#060B12',
  surface: '#0C1A26',
  surfaceAlt: '#13293A',
  structure: '#2A5D6E',
  structureBright: '#3F8798',
  data: '#4FE0C4',
  identity: '#F2F5F7',
  coverage: 'rgba(44,140,140,0.16)',
  coverageEdge: 'rgba(79,224,196,0.45)',
  prediction: '#7B6BFF',
  edge: 'rgba(63,135,152,0.42)',
  riskLow: '#4FE0C4',
  riskMid: '#E8C33D',
  riskHigh: '#FF5C47',
  grid: 'rgba(52,110,128,0.30)',
};

/** Colour-blind-safe variant: risk is carried by lightness as well as hue. */
export const MACHINE_SAFE = {
  ...MACHINE,
  riskLow: '#8FD9FF',
  riskMid: '#FFD98F',
  riskHigh: '#FFFFFF',
  prediction: '#B7A8FF',
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
