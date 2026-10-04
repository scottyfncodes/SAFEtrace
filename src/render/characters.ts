/**
 * People: posed, dressed and inked (docs/40 §5).
 *
 * The first pass drew people as flat cut-outs facing the lens: no arms, no
 * stride, a child the size of an adult. This is the replacement, and it is
 * one system for everybody on the street, the rider included:
 *
 * - **A skeleton in the world.** Hips, knees, feet, shoulders, elbows, hands
 *   and head are placed in three dimensions, facing where the person is
 *   actually heading, and posed by gait — standing with weight on one leg,
 *   walking, running, riding a board sideways. Knees and elbows come from
 *   the same two-bone solver the rider has always used.
 * - **A look.** Proportions (a child is a child), a garment with its own
 *   outline (a long coat, a dress, an apron, a uniform), a hat that is a
 *   shape (bucket, peaked, brimmed, beanie, hood), hair that covers more of
 *   the head from behind than from the front, and what they carry.
 * - **Ink, the way a person is inked.** One heavy outline round the whole
 *   figure first, so the silhouette is a single shape; colour inside it; a
 *   thin line only where a near arm crosses the body. Torso and head are cut
 *   into a lit side and a shadow side by the same sun the town uses.
 *
 * Pose and look are pure data (tested). `paintFigure` is the only part that
 * touches a canvas, through a projector, so the street renderer stays the
 * only thing that knows about cameras.
 */
import type { Vec2 } from '../core/math';
import { solveTwoBone } from '../core/math';
import { hashString } from '../core/rng';
import { PRINT, SIGNAL, VENEER, alpha, mix, shade } from './palette';

export interface P3 { x: number; y: number; z: number }

export interface Joints {
  pelvis: P3; chest: P3; head: P3;
  hipL: P3; hipR: P3; kneeL: P3; kneeR: P3; footL: P3; footR: P3;
  shL: P3; shR: P3; elL: P3; elR: P3; handL: P3; handR: P3;
  /** Which way the chest faces, world radians. */
  facing: number;
  /** Which way the feet point, for shoes (a skater's are across the board). */
  toes: number;
  /** Which way the head looks, if not where the chest faces: a skater looks down the board. */
  look?: number;
}

/** Proportions. Lengths are metres at scale 1; everything is multiplied by scale. */
export interface Body {
  scale: number;
  /** Half the shoulder width. */
  shoulder: number;
  /** Half the hip width. */
  hip: number;
  headR: number;
  /** Limb thickness, metres. */
  limb: number;
  /** Forward lean of the upper body, metres at the shoulders. */
  stoop: number;
}

export const ADULT: Body = { scale: 1, shoulder: 0.22, hip: 0.15, headR: 0.13, limb: 0.145, stoop: 0 };

export type Gait = 'stand' | 'walk' | 'run' | 'ride';
export type Gesture = 'stop' | 'radio' | null;

export type Hat = 'none' | 'beanie' | 'bucket' | 'peaked' | 'brim' | 'cap' | 'hood' | 'headband';
export type Hair = 'short' | 'long' | 'bun' | 'crop';
export type Garment = 'jacket' | 'hoodie' | 'coat' | 'dress' | 'tee' | 'apron' | 'uniform' | 'cardigan' | 'vest';
export type Carry = 'none' | 'satchel' | 'backpack' | 'handbag' | 'parcel' | 'board';

export interface Look {
  body: Body;
  garment: Garment;
  top: string;
  bottom: string;
  skin: string;
  hair: string;
  hairStyle: Hair;
  hat: Hat;
  hatColour: string;
  shoes: string;
  /** Shorts: the shins are bare. */
  shorts?: boolean;
  carry: Carry;
  carryColour: string;
  /** A small mark on the chest: Priya's lanyard badge, in the system's cyan. */
  badge?: string;
  /** Apron, belt, coat lining: the garment's second colour. */
  trim?: string;
}

// ------------------------------------------------------------------ colour

const hueOf = (c: string): { h: number; chroma: number } => {
  const s = c.replace('#', '');
  const r = parseInt(s.slice(0, 2), 16) / 255, g = parseInt(s.slice(2, 4), 16) / 255, b = parseInt(s.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, chroma: d };
};
const gap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

/**
 * Clothes may be colourful; they may not be a signal. On a figure twenty
 * pixels tall hue is what is read first, and a mustard coat was reading as a
 * second player and a rust shirt as a warning. Anything close to amber or
 * warning orange is taken down into a brown — still that person's colour,
 * no longer one that means something.
 */
export function wearable(c: string): string {
  if (!c.startsWith('#') || c.length !== 7) return c;
  const { h, chroma } = hueOf(c);
  if (chroma < 0.28) return c;
  for (const s of [SIGNAL.player, SIGNAL.warning]) {
    if (gap(h, hueOf(s).h) < 18) {
      // Toward its own grey, and down a little: the hue stays, the claim on it goes.
      const v = parseInt(c.slice(1, 3), 16) * 0.3 + parseInt(c.slice(3, 5), 16) * 0.55 + parseInt(c.slice(5, 7), 16) * 0.15;
      const g = Math.round(v).toString(16).padStart(2, '0');
      return shade(mix(c, `#${g}${g}${g}`, 0.7), -0.18);
    }
  }
  return c;
}

// -------------------------------------------------------------------- pose

export interface PoseInput {
  at: Vec2;
  /** Ground height under the feet: a board's deck, a kerb. */
  z?: number;
  facing: number;
  gait: Gait;
  /** Stride phase, radians: advances with distance actually covered. */
  phase: number;
  body: Body;
  /** Stable per person: which leg they stand on, how they hold themselves. */
  seed?: number;
  gesture?: Gesture;
}

const LEG_U = 0.45, LEG_L = 0.44, ARM_U = 0.29, ARM_L = 0.28;

/**
 * A person's skeleton for a gait. Standing has weight on one leg and the
 * hands at rest; walking swings opposite arm and leg and lifts the foot that
 * is coming through; running leans in, drops the hips and bends the arms;
 * riding stands across the board, knees bent, arms out for balance.
 */
export function pose(p: PoseInput): Joints {
  const k = p.body.scale;
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
  const rx = -fy, ry = fx;                       // the right hand
  const g0 = p.z ?? 0;
  const at = (f: number, r: number, z: number): P3 => ({ x: p.at.x + (fx * f + rx * r) * k, y: p.at.y + (fy * f + ry * r) * k, z: g0 + z * k });
  const s = Math.sin(p.phase), c = Math.cos(p.phase);
  const seed = p.seed ?? 0;
  const weight = seed % 2 ? 1 : -1;              // which leg they stand on

  let pelvisZ = 0.92, lean = p.body.stoop, sway = 0;
  let footL = at(0, -0.1, 0), footR = at(0, 0.1, 0);
  let handL = at(0.02, -0.26, 0.8), handR = at(0.02, 0.26, 0.8);
  let toes = p.facing;

  if (p.gait === 'stand') {
    sway = 0.03 * weight;
    footL = at(weight > 0 ? 0.1 : 0, -0.13, 0);
    footR = at(weight < 0 ? 0.1 : 0, 0.13, 0);
    pelvisZ = 0.9;
  } else if (p.gait === 'walk') {
    const A = 0.3;
    footL = at(s * A, -0.1, Math.max(0, c) * 0.09);
    footR = at(-s * A, 0.1, Math.max(0, -c) * 0.09);
    pelvisZ = 0.9 - 0.025 * Math.abs(s);
    handL = at(-s * 0.2, -0.25, 0.8 + Math.max(0, -s) * 0.04);
    handR = at(s * 0.2, 0.25, 0.8 + Math.max(0, s) * 0.04);
  } else if (p.gait === 'run') {
    const A = 0.5;
    footL = at(s * A, -0.09, Math.max(0, c) * 0.2);
    footR = at(-s * A, 0.09, Math.max(0, -c) * 0.2);
    pelvisZ = 0.88 + 0.03 * Math.abs(c);
    lean += 0.11;
    handL = at(-s * 0.32 + 0.12, -0.22, 1.08 + Math.max(0, -s) * 0.1);
    handR = at(s * 0.32 + 0.12, 0.22, 1.08 + Math.max(0, s) * 0.1);
  } else {
    // Across the board: front foot over the front truck, back foot over the
    // tail, which in the body's frame is to the right and left.
    pelvisZ = 0.74;
    footL = at(0, -0.36, 0);
    footR = at(0, 0.38, 0);
    toes = p.facing;
    lean = 0.08;
    handL = at(0.12, -0.55, 1.05 + s * 0.04);
    handR = at(0.05, 0.55, 0.98 - s * 0.04);
  }

  if (p.gesture === 'stop') handR = at(0.5, 0.18, 1.45);
  if (p.gesture === 'radio') handL = at(0.1, -0.12, 1.36);

  const pelvis = at(0, sway, pelvisZ);
  const chest = at(lean, sway * 0.4, pelvisZ + 0.52);
  const hipL = at(0, sway - p.body.hip, pelvisZ), hipR = at(0, sway + p.body.hip, pelvisZ);
  const shL = at(lean, sway * 0.4 - p.body.shoulder, pelvisZ + 0.5);
  const shR = at(lean, sway * 0.4 + p.body.shoulder, pelvisZ + 0.5);
  const head = at(lean * 1.15, sway * 0.3, pelvisZ + 0.52 + 0.2 + p.body.headR * 0.4);

  const fwd = { x: fx, y: fy };
  // Knees forward; elbows back and a little out.
  const kneeL = solveTwoBone(hipL, footL, LEG_U * k, LEG_L * k, fwd);
  const kneeR = solveTwoBone(hipR, footR, LEG_U * k, LEG_L * k, fwd);
  const elL = solveTwoBone(shL, handL, ARM_U * k, ARM_L * k, { x: -fx * 0.8 - rx * 0.4, y: -fy * 0.8 - ry * 0.4 });
  const elR = solveTwoBone(shR, handR, ARM_U * k, ARM_L * k, { x: -fx * 0.8 + rx * 0.4, y: -fy * 0.8 + ry * 0.4 });
  return {
    pelvis, chest, head, hipL, hipR, kneeL, kneeR, footL, footR, shL, shR, elL, elR, handL, handR,
    facing: p.facing, toes, look: p.gait === 'ride' ? p.facing - Math.PI / 2 : undefined,
  };
}

// ------------------------------------------------------------------- looks

const pick = <T>(xs: readonly T[], id: string, salt: string): T => xs[hashString(id + salt) % xs.length];

const HATS_ADULT: Hat[] = ['none', 'none', 'none', 'beanie', 'cap', 'brim'];
const HAIR: Hair[] = ['short', 'long', 'bun', 'crop', 'short'];
const GARMENTS: Garment[] = ['jacket', 'coat', 'dress', 'hoodie', 'cardigan', 'jacket'];

/** A passer-by: built from what kind of person they are and who they are. */
export function residentLook(id: string, kind: 'adult' | 'child' | 'dogWalker' | 'jogger', tint: string, hood = false): Look {
  const h = hashString(id + ':look');
  const skin = pick(VENEER.skinTones, id, ':skin');
  const hair = pick(VENEER.hair, id, ':hair');
  const top = wearable(tint);
  const bottom = pick(VENEER.trousers, id, ':legs');
  const tall = 0.94 + (h % 12) / 100;
  if (kind === 'child') {
    return {
      body: { scale: 0.64, shoulder: 0.21, hip: 0.15, headR: 0.165, limb: 0.15, stoop: 0 },
      garment: h % 2 ? 'hoodie' : 'jacket', top, bottom, skin, hair, hairStyle: pick(HAIR, id, ':hs'),
      hat: hood ? 'hood' : h % 3 === 0 ? 'beanie' : 'none', hatColour: shade(top, -0.25),
      shoes: '#E4E0D6', shorts: h % 4 === 0, carry: 'backpack', carryColour: pick(['#3E4C5A', '#5B4A3A', '#6E4A5A'], id, ':bag'),
    };
  }
  if (kind === 'jogger') {
    return {
      body: { ...ADULT, scale: tall, shoulder: 0.21, limb: 0.135 },
      garment: 'tee', top, bottom: '#2B2F35', skin, hair, hairStyle: h % 2 ? 'crop' : 'bun',
      hat: 'headband', hatColour: shade(top, -0.45), shoes: '#E4E0D6', shorts: true, carry: 'none', carryColour: PRINT.ink,
    };
  }
  const garment = hood ? 'hoodie' : pick(GARMENTS, id, ':g');
  return {
    body: { ...ADULT, scale: tall, shoulder: garment === 'dress' ? 0.18 : 0.2, stoop: h % 7 === 0 ? 0.06 : 0 },
    garment, top, bottom, skin, hair, hairStyle: pick(HAIR, id, ':hs'),
    hat: hood ? 'hood' : pick(HATS_ADULT, id, ':hat'), hatColour: shade(top, -0.35),
    shoes: '#2A2622', carry: kind === 'dogWalker' ? 'none' : pick(['none', 'none', 'satchel', 'handbag'] as Carry[], id, ':carry'),
    carryColour: pick(['#4A3B30', '#2F343C', '#6B5340'], id, ':cc'),
    trim: shade(top, -0.3),
  };
}

/** The uniform: broad, square, belted, a peaked cap. */
export function officerLook(id: string): Look {
  return {
    body: { ...ADULT, scale: 1.04, shoulder: 0.25, hip: 0.15, limb: 0.14 },
    garment: 'uniform', top: VENEER.uniform, bottom: VENEER.uniformDark,
    skin: pick(VENEER.skinTones, id, ':skin'), hair: VENEER.hair[0], hairStyle: 'crop',
    hat: 'peaked', hatColour: VENEER.uniformDark, shoes: '#15181C', carry: 'none', carryColour: PRINT.ink,
    trim: '#151B24',
  };
}

/**
 * Devon. The only bucket hat in town, pale against everything; a long green
 * tee to mid-thigh; shorts; his board in his hand when he is not on it. He
 * is Devon before he is green, and before he is close.
 */
export const DEVON: Look = {
  body: { ...ADULT, scale: 0.97, shoulder: 0.2, limb: 0.13 },
  garment: 'tee', top: VENEER.friend, bottom: '#2F343C', skin: VENEER.skin, hair: VENEER.hair[0], hairStyle: 'short',
  hat: 'bucket', hatColour: VENEER.friendHat, shoes: '#E4E0D6', shorts: true, carry: 'board', carryColour: shade(VENEER.friend, -0.45),
};

/** The rider: amber hoodie, dark trousers, a dark beanie, light skate shoes. */
export const RIDER: Look = {
  body: { ...ADULT, scale: 0.98, limb: 0.13 },
  garment: 'hoodie', top: SIGNAL.player, bottom: VENEER.trousers[0], skin: VENEER.skin, hair: VENEER.hair[0], hairStyle: 'short',
  hat: 'beanie', hatColour: PRINT.ink, shoes: '#E4E0D6', carry: 'none', carryColour: PRINT.ink,
};

/** The named people of Bellhaven, so you know them before they speak. */
export function castLook(id: string, tint: string): Look | null {
  const top = wearable(tint);
  switch (id) {
    // The bike shop: a work apron over rolled sleeves, hair tied up.
    case 'mara': return {
      body: { ...ADULT, scale: 0.98, shoulder: 0.2 }, garment: 'apron', top, bottom: '#2F343C',
      skin: VENEER.skinTones[3], hair: VENEER.hair[0], hairStyle: 'bun', hat: 'none', hatColour: PRINT.ink,
      shoes: '#2A2622', carry: 'none', carryColour: PRINT.ink, trim: '#3B3A36',
    };
    // UNDERWATCH Regional Operations: a long tailored coat, and a lanyard
    // badge in the system's own cyan — the only person who wears it.
    case 'priya': return {
      body: { ...ADULT, scale: 1.02, shoulder: 0.19 }, garment: 'coat', top, bottom: '#24272C',
      skin: VENEER.skinTones[2], hair: VENEER.hair[1], hairStyle: 'long', hat: 'none', hatColour: PRINT.ink,
      shoes: '#15181C', carry: 'handbag', carryColour: '#24272C', badge: SIGNAL.system, trim: shade(top, -0.35),
    };
    // A courier: cap, a parcel carried in both hands.
    case 'courier': return {
      body: { ...ADULT, scale: 1.0 }, garment: 'jacket', top, bottom: '#2F343C',
      skin: VENEER.skinTones[4], hair: VENEER.hair[2], hairStyle: 'crop', hat: 'cap', hatColour: shade(top, -0.3),
      shoes: '#2A2622', carry: 'parcel', carryColour: '#9A8264', trim: shade(top, -0.3),
    };
    // Mrs. Carvalho: a cardigan and a skirt, a little stooped, a handbag.
    case 'carvalho': return {
      body: { ...ADULT, scale: 0.92, shoulder: 0.18, stoop: 0.07 }, garment: 'dress', top, bottom: '#3B3A40',
      skin: VENEER.skinTones[0], hair: VENEER.hair[4], hairStyle: 'bun', hat: 'none', hatColour: PRINT.ink,
      shoes: '#2A2622', carry: 'handbag', carryColour: '#4A3B30', trim: shade(top, -0.3),
    };
    // Mr. Brennan: a long coat and a flat brimmed hat.
    case 'brennan': return {
      body: { ...ADULT, scale: 1.0, stoop: 0.05 }, garment: 'coat', top, bottom: '#2F343C',
      skin: VENEER.skinTones[1], hair: VENEER.hair[4], hairStyle: 'crop', hat: 'brim', hatColour: '#2F2B27',
      shoes: '#2A2622', carry: 'none', carryColour: PRINT.ink, trim: shade(top, -0.3),
    };
  }
  return null;
}

// ------------------------------------------------------------------- paint

export type Projector = (x: number, y: number, z: number) => { x: number; y: number; s: number } | null;

export interface PaintOpts {
  /** Outline width at this distance, CSS pixels: the person class of ink.ts. */
  ink: number;
  /** Direction the light travels (sim.sun): shadow sides face along it. */
  sun: Vec2;
  /** The eye, in the world. */
  eye: P3;
  /** A leash to a dog's collar, if they are walking one. */
  leash?: P3;
}

type Pt = { x: number; y: number; s: number };
interface Part { depth: number; draw: (pass: 'ink' | 'fill') => void; inner?: boolean }

/**
 * Paint one figure. Two passes: every part's ink, which unions into a single
 * silhouette outline, then every part's colour, far to near. A near arm or a
 * carried thing gets its own thin line where it crosses the body.
 */
export function paintFigure(ctx: CanvasRenderingContext2D, proj: Projector, j: Joints, look: Look, o: PaintOpts): void {
  const P = (q: P3) => proj(q.x, q.y, q.z);
  const pts: Record<string, Pt | null> = {};
  for (const k of ['pelvis', 'chest', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'footL', 'footR', 'shL', 'shR', 'elL', 'elR', 'handL', 'handR'] as const) {
    const v = P(j[k]);
    if (!v) return;
    pts[k] = v;
  }
  const q = pts as Record<string, Pt>;
  const k = look.body.scale;
  const ink = o.ink;
  const INK = PRINT.ink;
  const dist = (a: P3) => Math.hypot(a.x - o.eye.x, a.y - o.eye.y, a.z - o.eye.z);
  const fx = Math.cos(j.facing), fy = Math.sin(j.facing);
  // Facing the eye, or turned away from it: hair, face and a bag's side depend on it.
  const toEye = { x: o.eye.x - j.head.x, y: o.eye.y - j.head.y };
  const tl = Math.hypot(toEye.x, toEye.y) || 1;
  const front = (fx * toEye.x + fy * toEye.y) / tl;   // 1 facing the eye, -1 away
  const lk = j.look ?? j.facing;
  const headFront = (Math.cos(lk) * toEye.x + Math.sin(lk) * toEye.y) / tl;
  /*
   * Detail by size. Under about thirty pixels tall a hand, a shoe, a strap
   * or a brow is a speck that costs as much to draw as an arm; the outline,
   * the garment, the hat and the stride are what read, so that is all a
   * small figure gets.
   */
  const tallPx = (q.footL.y + q.footR.y) / 2 - q.head.y;
  const small = tallPx < 34;
  const rx = -fy, ry = fx;
  // Which side of the body the sun is on: the other side is in shadow.
  const shadowRight = rx * o.sun.x + ry * o.sun.y > 0;

  const parts: Part[] = [];
  const limb = (a: P3, b: P3, pa: Pt, pb: Pt, w: number, col: string, inner = false) => {
    parts.push({
      depth: (dist(a) + dist(b)) / 2, inner,
      draw: (pass) => {
        const wpx = Math.max(1.2, w * k * (pa.s + pb.s) / 2);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
        if (pass === 'ink') { ctx.strokeStyle = INK; ctx.lineWidth = wpx + ink * 2; ctx.stroke(); return; }
        if (inner) { ctx.strokeStyle = INK; ctx.lineWidth = wpx + ink * 0.9; ctx.stroke(); }
        ctx.strokeStyle = col; ctx.lineWidth = wpx; ctx.stroke();
      },
    });
  };
  const poly = (ps: Pt[], depth: number, col: string, shadow?: { ps: Pt[]; col: string }, lines?: Array<[Pt, Pt]>) => {
    parts.push({
      depth,
      draw: (pass) => {
        ctx.beginPath();
        ps.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        ctx.closePath();
        if (pass === 'ink') { ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = ink * 2; ctx.stroke(); ctx.fillStyle = INK; ctx.fill(); return; }
        ctx.fillStyle = col; ctx.fill();
        if (shadow) {
          ctx.beginPath();
          shadow.ps.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
          ctx.closePath(); ctx.fillStyle = shadow.col; ctx.fill();
        }
        if (lines) {
          ctx.strokeStyle = alpha(INK, 0.7); ctx.lineWidth = Math.max(0.7, ink * 0.5);
          ctx.beginPath();
          for (const [a, b] of lines) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
          ctx.stroke();
        }
      },
    });
  };
  const disc = (c: Pt, r: number, depth: number, col: string, inner = false) => {
    parts.push({
      depth, inner,
      draw: (pass) => {
        ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(0.8, r), 0, Math.PI * 2);
        if (pass === 'ink') { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(0.8, r) + ink, 0, Math.PI * 2); ctx.fill(); return; }
        if (inner) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(c.x, c.y, r + ink * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); }
        ctx.fillStyle = col; ctx.fill();
      },
    });
  };
  const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: a.s + (b.s - a.s) * t });
  const add = (a: P3, f: number, r: number, z: number): P3 => ({ x: a.x + (fx * f + rx * r) * k, y: a.y + (fy * f + ry * r) * k, z: a.z + z * k });

  // ---- legs and shoes
  const shins = look.shorts ? look.skin : look.bottom;
  for (const side of ['L', 'R'] as const) {
    const hip = j[`hip${side}`], knee = j[`knee${side}`], foot = j[`foot${side}`];
    limb(hip, knee, q[`hip${side}`], q[`knee${side}`], look.body.limb * 1.1, look.bottom);
    limb(knee, foot, q[`knee${side}`], q[`foot${side}`], look.body.limb * 0.95, shins);
    const tx = Math.cos(j.toes), ty = Math.sin(j.toes);
    const heel = { x: foot.x - tx * 0.05 * k, y: foot.y - ty * 0.05 * k, z: foot.z + 0.04 * k };
    const toe = { x: foot.x + tx * 0.17 * k, y: foot.y + ty * 0.17 * k, z: foot.z + 0.04 * k };
    const ph = small ? null : P(heel), pt = small ? null : P(toe);
    if (ph && pt) limb(heel, toe, ph, pt, 0.09, look.shoes);
  }

  // ---- torso: shoulders to hips, or to the hem of whatever they wear
  const hemZ = look.garment === 'coat' ? 0.42 : look.garment === 'dress' ? 0.38 : look.garment === 'tee' && look.hat === 'bucket' ? 0.66 : 0.8;
  const flare = look.garment === 'coat' ? 0.06 : look.garment === 'dress' ? 0.12 : 0.02;
  const hemL = P({ ...add(j.hipL, 0, -flare, 0), z: (look.body.scale * hemZ) + (j.pelvis.z - 0.9 * k) });
  const hemR = P({ ...add(j.hipR, 0, flare, 0), z: (look.body.scale * hemZ) + (j.pelvis.z - 0.9 * k) });
  const neck = P(add(j.chest, 0, 0, 0.06));
  if (!hemL || !hemR || !neck) return;
  const torso = [q.shL, neck, q.shR, hemR, hemL];
  const midTop = neck, midBot = lerpPt(hemL, hemR, 0.5);
  const shadowSide = shadowRight ? [midTop, q.shR, hemR, midBot] : [q.shL, midTop, midBot, hemL];
  const lines: Array<[Pt, Pt]> = [];
  if (look.garment === 'coat' && front > -0.2) lines.push([neck, midBot]);
  if (look.garment === 'uniform') lines.push([lerpPt(q.shL, hemL, 0.62), lerpPt(q.shR, hemR, 0.62)]);
  if (look.garment === 'cardigan' && front > -0.2) lines.push([neck, lerpPt(midTop, midBot, 0.7)]);
  const torsoDepth = dist(j.chest) + 0.001;
  poly(torso, torsoDepth, look.top, { ps: shadowSide, col: shade(look.top, -0.28) }, lines);
  // A belt, or an apron's bib, on the front of the body.
  if (look.garment === 'uniform') {
    const b0 = lerpPt(q.shL, hemL, 0.6), b1 = lerpPt(q.shR, hemR, 0.6), b2 = lerpPt(q.shR, hemR, 0.68), b3 = lerpPt(q.shL, hemL, 0.68);
    parts.push({ depth: torsoDepth - 0.002, draw: (pass) => { if (pass === 'ink') return; ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y); ctx.closePath(); ctx.fillStyle = look.trim ?? INK; ctx.fill(); } });
  }
  if (look.garment === 'apron' && front > 0) {
    const a0 = lerpPt(q.shL, q.shR, 0.3), a1 = lerpPt(q.shL, q.shR, 0.7);
    const kneeMid = lerpPt(q.kneeL, q.kneeR, 0.5);
    const a2 = { x: kneeMid.x + (a1.x - a0.x) * 0.7, y: kneeMid.y, s: 1 }, a3 = { x: kneeMid.x - (a1.x - a0.x) * 0.7, y: kneeMid.y, s: 1 };
    parts.push({ depth: torsoDepth - 0.002, draw: (pass) => { if (pass === 'ink') { ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.lineTo(a3.x, a3.y); ctx.closePath(); ctx.fillStyle = INK; ctx.lineWidth = ink * 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.fill(); return; } ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.lineTo(a3.x, a3.y); ctx.closePath(); ctx.fillStyle = look.trim ?? INK; ctx.fill(); } });
  }
  if (look.badge && front > 0.2 && !small) {
    const b = lerpPt(lerpPt(q.shL, q.shR, 0.62), midBot, 0.22);
    parts.push({ depth: torsoDepth - 0.003, draw: (pass) => { if (pass === 'ink') return; const r = Math.max(1, 0.035 * b.s); ctx.fillStyle = look.badge!; ctx.fillRect(b.x - r, b.y - r * 1.3, r * 2, r * 2.6); } });
  }

  // ---- arms: upper in the garment, forearm too unless it is a vest or tee
  const sleeve = look.garment === 'vest' ? look.skin : look.top;
  const fore = look.garment === 'vest' || look.garment === 'tee' || look.garment === 'apron' ? look.skin : look.top;
  for (const side of ['L', 'R'] as const) {
    const sh = j[`sh${side}`], el = j[`el${side}`], hand = j[`hand${side}`];
    const nearer = !small && (dist(sh) + dist(hand)) / 2 < torsoDepth - 0.04;
    limb(sh, el, q[`sh${side}`], q[`el${side}`], look.body.limb * 0.95, sleeve, nearer);
    limb(el, hand, q[`el${side}`], q[`hand${side}`], look.body.limb * 0.8, fore, nearer);
    if (!small) disc(q[`hand${side}`], 0.05 * k * q[`hand${side}`].s, dist(hand) - 0.001, look.skin, nearer);
  }

  // ---- carried things
  if (look.carry === 'backpack') {
    const c = add(j.chest, -0.17, 0, -0.18), pc = P(c);
    if (pc) { const w = 0.3 * k * pc.s, h = 0.36 * k * pc.s; parts.push(rect(pc, w, h, dist(c), look.carryColour)); }
  } else if (look.carry === 'satchel') {
    const c = add(j.hipR, 0, 0.1, 0.02), pc = P(c);
    if (pc) {
      const w = 0.26 * k * pc.s, h = 0.2 * k * pc.s;
      parts.push(rect(pc, w, h, dist(c), look.carryColour, !small));
      const strapTop = q.shL;
      if (!small)
      parts.push({ depth: torsoDepth - 0.002, draw: (pass) => { if (pass === 'ink') return; ctx.strokeStyle = shade(look.carryColour, -0.3); ctx.lineWidth = Math.max(1, 0.035 * pc.s); ctx.beginPath(); ctx.moveTo(strapTop.x, strapTop.y); ctx.lineTo(pc.x, pc.y); ctx.stroke(); } });
    }
  } else if (look.carry === 'handbag') {
    const c = { ...j.handL, z: j.handL.z - 0.1 * k }, pc = P(c);
    if (pc) parts.push(rect(pc, 0.2 * k * pc.s, 0.16 * k * pc.s, dist(c) - 0.01, look.carryColour, true));
  } else if (look.carry === 'parcel') {
    const c = add(j.chest, 0.3, 0, -0.32), pc = P(c);
    if (pc) parts.push(rect(pc, 0.42 * k * pc.s, 0.3 * k * pc.s, dist(c) - 0.05, look.carryColour, true));
  } else if (look.carry === 'board') {
    // The deck stood on its tail beside him, in his right hand.
    const top = { ...j.handR, z: j.handR.z + 0.12 * k }, bot = { x: j.handR.x, y: j.handR.y, z: 0.03 };
    const pt = P(top), pb = P(bot);
    if (pt && pb) limb(top, bot, pt, pb, 0.2, look.carryColour, true);
  }
  if (o.leash) {
    const pl = P(o.leash), ph = q.handR;
    if (pl) parts.push({ depth: dist(j.handR) - 0.002, draw: (pass) => { if (pass === 'ink') return; ctx.strokeStyle = alpha(INK, 0.85); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ph.x, ph.y); ctx.quadraticCurveTo((ph.x + pl.x) / 2, Math.max(ph.y, pl.y) + 4, pl.x, pl.y); ctx.stroke(); } });
  }

  // ---- head, hair, hat
  const hp = q.head;
  const R = look.body.headR * k * hp.s;
  const headDepth = dist(j.head);
  const up = P({ ...j.head, z: j.head.z + 0.1 });
  const ux = up ? (up.x - hp.x) : 0, uy = up ? (up.y - hp.y) : -1;
  const ul = Math.hypot(ux, uy) || 1;
  const U = { x: ux / ul, y: uy / ul };                       // screen up
  const fwdS = P(add(j.head, 0.3, 0, 0));
  const F = fwdS ? { x: (fwdS.x - hp.x) / (R * 3 || 1), y: (fwdS.y - hp.y) / (R * 3 || 1) } : { x: 0, y: 0 };
  const capOf = (cover: number, col: string, extra = 0) => {
    // A cap of colour over the top of the head, `cover` of the way down.
    const a0 = Math.atan2(U.y, U.x);
    const spread = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * cover)));
    return (pass: 'ink' | 'fill') => {
      if (pass === 'ink') return;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, R + extra, a0 - spread, a0 + spread);
      ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
    };
  };
  // Hood up, or hair falling behind the head: drawn first, behind it.
  if (look.hat === 'hood') {
    parts.push({ depth: headDepth + 0.02, draw: (pass) => { ctx.beginPath(); ctx.arc(hp.x - U.x * R * 0.05, hp.y - U.y * R * 0.05, R * 1.3 + (pass === 'ink' ? ink : 0), 0, Math.PI * 2); ctx.fillStyle = pass === 'ink' ? INK : shade(look.top, -0.12); ctx.fill(); } });
  } else if (look.hairStyle === 'long') {
    parts.push({ depth: headDepth + (front > 0 ? 0.02 : -0.02), draw: (pass) => { const w = R * 1.05, top = { x: hp.x, y: hp.y }, bot = { x: hp.x - U.x * R * 2.4, y: hp.y - U.y * R * 2.4 }; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.strokeStyle = pass === 'ink' ? INK : look.hair; ctx.lineWidth = w * 2 + (pass === 'ink' ? ink * 2 : 0); ctx.stroke(); } });
  }
  parts.push({
    depth: headDepth,
    draw: (pass) => {
      if (pass === 'ink') { ctx.beginPath(); ctx.arc(hp.x, hp.y, R + ink, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill(); return; }
      ctx.beginPath(); ctx.arc(hp.x, hp.y, R, 0, Math.PI * 2); ctx.fillStyle = look.skin; ctx.fill();
      // The head's shadow side, cut by the same sun as the body.
      const sx = shadowRight ? rx : -rx, sy = shadowRight ? ry : -ry;
      const sp = P({ x: j.head.x + sx * 0.2, y: j.head.y + sy * 0.2, z: j.head.z });
      if (sp) { const a = Math.atan2(sp.y - hp.y, sp.x - hp.x); ctx.beginPath(); ctx.arc(hp.x, hp.y, R, a - Math.PI / 2, a + Math.PI / 2); ctx.closePath(); ctx.fillStyle = shade(look.skin, -0.25); ctx.fill(); }
      if (look.hat === 'hood') return;
      // Hair: more of the head from behind than from in front.
      const cover = look.hairStyle === 'crop' ? 0.3 + Math.max(0, -headFront) * 0.35 : 0.42 + Math.max(0, -headFront) * 0.4;
      capOf(cover, look.hair)('fill');
      if (look.hairStyle === 'bun') { ctx.beginPath(); ctx.arc(hp.x + U.x * R * 0.95 - F.x * R * 0.5, hp.y + U.y * R * 0.95 - F.y * R * 0.5, R * 0.42, 0, Math.PI * 2); ctx.fillStyle = look.hair; ctx.fill(); }
      // A face, close enough to have one: a brow and a nose on the side it faces.
      if (headFront > 0.25 && R > 5) {
        ctx.strokeStyle = alpha(INK, 0.6); ctx.lineWidth = Math.max(0.8, R * 0.09);
        const cx = hp.x + F.x * R * 0.55, cy = hp.y + F.y * R * 0.55;
        ctx.beginPath(); ctx.moveTo(cx - R * 0.35, cy - R * 0.12); ctx.lineTo(cx + R * 0.35, cy - R * 0.12);
        ctx.moveTo(cx, cy - R * 0.05); ctx.lineTo(cx + F.x * R * 0.15, cy + R * 0.25); ctx.stroke();
      }
    },
  });
  if (look.hat !== 'none' && look.hat !== 'hood') {
    parts.push({
      depth: headDepth - 0.003,
      draw: (pass) => {
        const col = look.hatColour;
        const brim = (w: number, h: number, dy: number, offF = 0) => {
          const cx = hp.x + U.x * R * dy + F.x * R * offF, cy = hp.y + U.y * R * dy + F.y * R * offF;
          ctx.beginPath(); ctx.ellipse(cx, cy, R * w + (pass === 'ink' ? ink : 0), R * h + (pass === 'ink' ? ink : 0), Math.atan2(U.x, -U.y), 0, Math.PI * 2);
          ctx.fillStyle = pass === 'ink' ? INK : col; ctx.fill();
        };
        const crown = (cover: number, lift: number) => {
          if (pass === 'ink') { ctx.beginPath(); ctx.arc(hp.x + U.x * R * lift, hp.y + U.y * R * lift, R + ink, Math.atan2(U.y, U.x) - 1.7, Math.atan2(U.y, U.x) + 1.7); ctx.closePath(); ctx.fillStyle = INK; ctx.fill(); return; }
          ctx.save(); ctx.translate(U.x * R * lift, U.y * R * lift); capOf(cover, col, R * 0.04)('fill'); ctx.restore();
        };
        switch (look.hat) {
          case 'beanie': crown(0.58, 0.12); break;
          case 'headband': if (pass === 'fill') { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, R * 0.28); ctx.beginPath(); ctx.arc(hp.x, hp.y, R * 0.98, Math.atan2(U.y, U.x) - 1.3, Math.atan2(U.y, U.x) + 1.3); ctx.stroke(); } break;
          case 'bucket': brim(1.75, 0.42, 0.42); crown(0.5, 0.22); break;
          case 'brim': brim(1.9, 0.38, 0.5); crown(0.45, 0.35); break;
          case 'peaked': brim(1.05, 0.3, 0.55, 0.7 * Math.max(0, headFront) + 0.35); crown(0.45, 0.32); break;
          case 'cap': brim(0.9, 0.26, 0.45, 0.8 * Math.max(0, headFront) + 0.3); crown(0.48, 0.12); break;
        }
      },
    });
  }

  parts.sort((a, b) => b.depth - a.depth);
  ctx.save();
  for (const p of parts) p.draw('ink');
  for (const p of parts) p.draw('fill');
  ctx.restore();

  function rect(c: Pt, w: number, h: number, depth: number, col: string, inner = false): Part {
    return {
      depth, inner,
      draw: (pass) => {
        const x = c.x - w / 2, y = c.y - h / 2;
        if (pass === 'ink') { ctx.fillStyle = INK; ctx.fillRect(x - ink, y - ink, w + ink * 2, h + ink * 2); return; }
        if (inner) { ctx.fillStyle = INK; ctx.fillRect(x - ink * 0.5, y - ink * 0.5, w + ink, h + ink); }
        ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
      },
    };
  }
}

// --------------------------------------------------------------------- dog

export const DOG_COATS = ['#3A2F27', '#8A6E52', '#D4CBB8', '#26282C'];

/** A dog on a lead, trotting: the one thing in town that tells you "dog walker". */
export function paintDog(ctx: CanvasRenderingContext2D, proj: Projector, at: Vec2, facing: number, phase: number, coat: string, o: PaintOpts): P3 | null {
  const fx = Math.cos(facing), fy = Math.sin(facing), rx = -fy, ry = fx;
  const W = (f: number, r: number, z: number): P3 => ({ x: at.x + fx * f + rx * r, y: at.y + fy * f + ry * r, z });
  const hind = W(-0.28, 0, 0.36), fore = W(0.24, 0, 0.4), head = W(0.42, 0, 0.55), tail = W(-0.48, 0, 0.55);
  const ph = proj(hind.x, hind.y, hind.z), pf = proj(fore.x, fore.y, fore.z), phd = proj(head.x, head.y, head.z), pt = proj(tail.x, tail.y, tail.z);
  if (!ph || !pf || !phd || !pt) return null;
  const legs: Array<[P3, P3]> = [];
  for (const [f, r, ph0] of [[0.22, 0.08, 0], [0.22, -0.08, Math.PI], [-0.26, 0.08, Math.PI], [-0.26, -0.08, 0]] as const) {
    const sw = Math.sin(phase * 2 + ph0) * 0.1;
    legs.push([W(f, r, 0.36), W(f + sw, r, 0.0)]);
  }
  const ink = o.ink * 0.8;
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }, w: number, col: string) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
  ctx.save();
  ctx.lineCap = 'round';
  const s = (ph.s + pf.s) / 2;
  for (const pass of ['ink', 'fill'] as const) {
    const col = pass === 'ink' ? PRINT.ink : coat, add = pass === 'ink' ? ink * 2 : 0;
    for (const [a, b] of legs) { const pa = proj(a.x, a.y, a.z), pb = proj(b.x, b.y, b.z); if (pa && pb) seg(pa, pb, 0.06 * s + add, col); }
    seg(ph, pf, 0.22 * s + add, col);
    seg(pt, ph, 0.04 * s + add, col);
    ctx.beginPath(); ctx.arc(phd.x, phd.y, 0.11 * s + add / 2, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
  }
  ctx.restore();
  return W(0.32, 0, 0.45);
}

/** Where a walked dog's collar is, for the lead. Matches `paintDog`. */
export function dogCollar(at: Vec2, facing: number): P3 {
  return { x: at.x + Math.cos(facing) * 0.32, y: at.y + Math.sin(facing) * 0.32, z: 0.45 };
}
