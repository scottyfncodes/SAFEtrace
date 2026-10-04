/**
 * People, as silhouettes.
 *
 * Silhouette first, colour second, detail third. A person on a phone through
 * a long lens is twenty to sixty pixels tall, so what tells them apart is the
 * outline: a long coat, a hood, a brimmed hat, a bag on one hip, a peaked
 * cap. Each figure here is a handful of flat shapes in the person's own
 * plane — across and up, in metres — that the street renderer stands up
 * facing the camera and inks as a person.
 *
 * This is the replacement for three stacked cards, and it is still not final
 * character art: it is the shape language that final art would follow.
 */
import { hashString } from '../core/rng';

/** What a shape is painted with; the renderer resolves each to a colour. */
export type Fill = 'legs' | 'garment' | 'garmentDark' | 'skin' | 'hair' | 'hat' | 'bag';

export interface Shape { fill: Fill; pts: ReadonlyArray<readonly [number, number]> }
export interface Figure { shapes: Shape[]; /** Height of the top of the head, metres. */ top: number }

export type Build = 'coat' | 'hoodie' | 'skirt' | 'brim' | 'satchel' | 'officer' | 'devon';

/** An n-gon round a centre, flattened: heads, crowns of hats. */
function round(cu: number, cz: number, ru: number, rz: number, n = 8): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    out.push([cu + Math.cos(a) * ru, cz + Math.sin(a) * rz]);
  }
  return out;
}

/** Two legs as one shape with a notch between them. */
function legs(top: number, hip: number, foot = 0.13, gap = 0.035): Shape {
  return {
    fill: 'legs',
    pts: [[-foot - 0.02, 0], [-gap, 0], [0, top * 0.82], [gap, 0], [foot + 0.02, 0], [hip, top], [-hip, top]],
  };
}

const HEAD_Z = 1.64;
const head = (z = HEAD_Z): Shape => ({ fill: 'skin', pts: round(0, z, 0.115, 0.13) });

const BUILDS: Record<Build, Figure> = {
  // A long coat to the knee: the commonest grown-up outline on a cold street.
  coat: {
    top: 1.8,
    shapes: [
      legs(0.62, 0.12),
      { fill: 'garment', pts: [[-0.22, 0.48], [0.22, 0.48], [0.19, 1.2], [0.23, 1.44], [0.08, 1.5], [-0.08, 1.5], [-0.23, 1.44], [-0.19, 1.2]] },
      head(),
      { fill: 'hair', pts: [[-0.125, 1.66], [-0.1, 1.77], [0, 1.8], [0.1, 1.77], [0.125, 1.66], [0.06, 1.72], [-0.06, 1.72]] },
    ],
  },
  // Hood up, boxy, hands in the pocket: the hood carries at any distance.
  hoodie: {
    top: 1.8,
    shapes: [
      legs(0.84, 0.15),
      { fill: 'garment', pts: [[-0.24, 0.78], [0.24, 0.78], [0.25, 1.42], [0.1, 1.5], [-0.1, 1.5], [-0.25, 1.42]] },
      { fill: 'garmentDark', pts: round(0, 1.67, 0.16, 0.16) },
      { fill: 'skin', pts: round(0, 1.64, 0.085, 0.1) },
    ],
  },
  // A skirt or a dress: a trapezoid that changes the whole read.
  skirt: {
    top: 1.78,
    shapes: [
      legs(0.5, 0.1, 0.11, 0.05),
      { fill: 'garment', pts: [[-0.27, 0.42], [0.27, 0.42], [0.15, 1.05], [0.21, 1.42], [0.07, 1.48], [-0.07, 1.48], [-0.21, 1.42], [-0.15, 1.05]] },
      head(1.62),
      { fill: 'hair', pts: [[-0.13, 1.42], [-0.15, 1.65], [-0.08, 1.77], [0.08, 1.77], [0.15, 1.65], [0.13, 1.42], [0.09, 1.6], [-0.09, 1.6]] },
    ],
  },
  // An older man in a brimmed hat, a little stooped.
  brim: {
    top: 1.78,
    shapes: [
      legs(0.78, 0.13),
      { fill: 'garment', pts: [[-0.21, 0.72], [0.21, 0.72], [0.22, 1.36], [0.05, 1.44], [-0.12, 1.45], [-0.25, 1.36]] },
      head(1.58),
      { fill: 'hat', pts: [[-0.24, 1.66], [0.24, 1.66], [0.11, 1.7], [0.1, 1.79], [-0.1, 1.79], [-0.11, 1.7]] },
    ],
  },
  // A short jacket and a bag on a strap: the bag breaks the outline on one side.
  satchel: {
    top: 1.8,
    shapes: [
      legs(0.86, 0.14),
      { fill: 'garment', pts: [[-0.22, 0.8], [0.22, 0.8], [0.24, 1.44], [0.08, 1.5], [-0.08, 1.5], [-0.24, 1.44]] },
      { fill: 'bag', pts: [[0.2, 0.74], [0.42, 0.74], [0.42, 1.02], [0.2, 1.02]] },
      { fill: 'bag', pts: [[-0.2, 1.44], [-0.13, 1.46], [0.33, 1.02], [0.28, 0.98]] },
      head(),
      { fill: 'hair', pts: round(0, 1.71, 0.125, 0.085) },
    ],
  },
  // The uniform: broad, square, a belt, and a peaked cap.
  officer: {
    top: 1.86,
    shapes: [
      legs(0.86, 0.15, 0.15),
      { fill: 'garment', pts: [[-0.22, 0.8], [0.22, 0.8], [0.29, 1.4], [0.27, 1.48], [-0.27, 1.48], [-0.29, 1.4]] },
      { fill: 'garmentDark', pts: [[-0.225, 0.86], [0.225, 0.86], [0.23, 0.95], [-0.23, 0.95]] },
      head(1.63),
      { fill: 'hat', pts: [[-0.13, 1.72], [0.13, 1.72], [0.23, 1.68], [0.24, 1.72], [0.14, 1.78], [0.12, 1.86], [-0.12, 1.86], [-0.14, 1.78]] },
    ],
  },
  /*
   * Devon: a bucket hat, a long tee to mid-thigh, shorts. The hat is the
   * whole identification at distance — no other figure in Bellhaven has a
   * wide soft brim on a small crown — so he is Devon before he is green.
   */
  devon: {
    top: 1.86,
    shapes: [
      { fill: 'skin', pts: [[-0.15, 0], [-0.04, 0], [0, 0.38], [0.04, 0], [0.15, 0], [0.13, 0.5], [-0.13, 0.5]] },
      { fill: 'legs', pts: [[-0.17, 0.46], [0.17, 0.46], [0.18, 0.74], [-0.18, 0.74]] },
      { fill: 'garment', pts: [[-0.25, 0.64], [0.25, 0.64], [0.24, 1.42], [0.09, 1.5], [-0.09, 1.5], [-0.24, 1.42]] },
      head(1.63),
      { fill: 'hat', pts: [[-0.25, 1.69], [0.25, 1.69], [0.13, 1.76], [0.11, 1.86], [-0.11, 1.86], [-0.13, 1.76]] },
    ],
  },
};

const CIVILIAN: Build[] = ['coat', 'hoodie', 'skirt', 'brim', 'satchel'];

/** A resident's build: stable for the person, varied across the street. */
export function buildFor(id: string): Build {
  return CIVILIAN[hashString(id + ':build') % CIVILIAN.length];
}

/** How tall, and which way round — so two people in the same build still differ. */
export function statureFor(id: string): { scale: number; flip: boolean } {
  const h = hashString(id + ':stature');
  return { scale: 0.92 + ((h % 15) / 100), flip: (h >> 4) % 2 === 0 };
}

export function figure(b: Build): Figure { return BUILDS[b]; }

/** A figure crouched over a board: Devon riding. Everything below the hips folds. */
export function riding(b: Build): Figure {
  const f = BUILDS[b];
  const sink = 0.16;
  return {
    top: f.top - sink,
    shapes: f.shapes.map((s) => ({
      fill: s.fill,
      pts: s.pts.map(([u, z]) => [u * (z < 0.8 ? 1.25 : 1), z < 0.8 ? z * 0.8 : z - sink] as const),
    })),
  };
}
