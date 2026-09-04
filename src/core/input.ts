/**
 * Input -> intent. The simulation only ever sees `Intent`, so remapping,
 * hold-vs-toggle, and gamepad support cost the sim nothing.
 */
import { clamp } from './math';

export interface Intent {
  /** -1 left .. +1 right */
  steer: number;
  push: boolean;
  pushPressed: boolean;
  brake: boolean;
  ollieHeld: boolean;
  olliePressed: boolean;
  ollieReleased: boolean;
  /** One press, one trick. Which trick is not the input layer's business. */
  trickPressed: boolean;
  toggleStance: boolean;
  aim: boolean;
  fire: boolean;
  firePressed: boolean;
  vision: boolean;
  interact: boolean;
  interactPressed: boolean;
  /** Aim target in screen pixels; the renderer converts to world space. */
  pointer: { x: number; y: number };
  pointerActive: boolean;
  /**
   * Screen-space unit direction to aim along, from the player. Touch supplies
   * this because a drawn slingshot has a direction rather than a cursor;
   * pointer devices leave it null and supply `pointer` instead.
   */
  aimVector: { x: number; y: number } | null;
  /**
   * How far the slingshot is drawn, 0..1. `null` means the device has no
   * continuous draw axis, so the character loads it at their own rate.
   */
  drawAmount: number | null;
  /**
   * A direction to travel in, in screen space, with magnitude 0..1.
   *
   * This is the difference between steering a vehicle and moving a person. A
   * stick that says "turn left" needs the player to model the character's
   * heading before they can go anywhere; a stick that says "that way" does not.
   * Devices with an absolute stick supply this; a keyboard supplies `steer`.
   */
  moveVector: { x: number; y: number } | null;
  /** Requests to enter or leave the stationary aiming mode. */
  aimModePressed: boolean;
  skip: boolean;
}

export const emptyIntent = (): Intent => ({
  steer: 0, push: false, pushPressed: false, brake: false,
  ollieHeld: false, olliePressed: false, ollieReleased: false, trickPressed: false,
  toggleStance: false, aim: false, fire: false, firePressed: false,
  vision: false, interact: false, interactPressed: false,
  pointer: { x: 0, y: 0 }, pointerActive: false,
  aimVector: null, drawAmount: null, moveVector: null,
  aimModePressed: false, skip: false,
});

/**
 * Fold one intent into another. Adapters are additive: a player may hold a key
 * while touching the screen, and neither should cancel the other.
 */
export function mergeIntent(base: Intent, add: Intent): Intent {
  base.steer = Math.abs(add.steer) > Math.abs(base.steer) ? add.steer : base.steer;
  base.push ||= add.push;
  base.pushPressed ||= add.pushPressed;
  base.brake ||= add.brake;
  base.ollieHeld ||= add.ollieHeld;
  base.olliePressed ||= add.olliePressed;
  base.ollieReleased ||= add.ollieReleased;
  base.trickPressed ||= add.trickPressed;
  base.toggleStance ||= add.toggleStance;
  base.aim ||= add.aim;
  base.fire ||= add.fire;
  base.firePressed ||= add.firePressed;
  base.vision ||= add.vision;
  base.interact ||= add.interact;
  base.interactPressed ||= add.interactPressed;
  base.skip ||= add.skip;
  if (add.pointerActive) { base.pointer = add.pointer; base.pointerActive = true; }
  if (add.aimVector) base.aimVector = add.aimVector;
  if (add.drawAmount !== null) base.drawAmount = add.drawAmount;
  if (add.moveVector) base.moveVector = add.moveVector;
  base.aimModePressed ||= add.aimModePressed;
  return base;
}

export interface InputOptions {
  holdToAim: boolean;
  holdForVision: boolean;
}

const CODE = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  push: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  ollie: ['Space'],
  trick: ['KeyR'],
  stance: ['ShiftLeft', 'ShiftRight'],
  vision: ['KeyQ'],
  interact: ['KeyE'],
  /**
   * Stand still and line up a shot: the same state a thumb reaches with the
   * sling button, so both devices exercise the same thing.
   */
  aimMode: ['KeyF'],
  skip: ['Escape', 'Enter'],
};

export class InputManager {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private mouse = { x: 0, y: 0, left: false, right: false, leftPressed: false, active: false };
  private visionToggle = false;
  private aimToggle = false;
  readonly options: InputOptions = { holdToAim: true, holdForVision: true };
  private detach: Array<() => void> = [];

  attach(target: HTMLElement | Window = window): void {
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.down.add(e.code);
      this.pressed.add(e.code);
    };
    const ku = (e: KeyboardEvent) => { this.down.delete(e.code); this.released.add(e.code); };
    const mm = (e: MouseEvent) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true;
    };
    const md = (e: MouseEvent) => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    };
    const mu = (e: MouseEvent) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    };
    const ctx = (e: Event) => e.preventDefault();
    const blur = () => { this.down.clear(); this.mouse.left = false; this.mouse.right = false; };

    const t = target as Window;
    t.addEventListener('keydown', kd as EventListener);
    t.addEventListener('keyup', ku as EventListener);
    t.addEventListener('mousemove', mm as EventListener);
    t.addEventListener('mousedown', md as EventListener);
    t.addEventListener('mouseup', mu as EventListener);
    t.addEventListener('contextmenu', ctx);
    t.addEventListener('blur', blur);

    this.detach.push(() => {
      t.removeEventListener('keydown', kd as EventListener);
      t.removeEventListener('keyup', ku as EventListener);
      t.removeEventListener('mousemove', mm as EventListener);
      t.removeEventListener('mousedown', md as EventListener);
      t.removeEventListener('mouseup', mu as EventListener);
      t.removeEventListener('contextmenu', ctx);
      t.removeEventListener('blur', blur);
    });
  }

  dispose(): void { for (const d of this.detach) d(); this.detach = []; }

  private any(codes: string[], set: Set<string>): boolean {
    for (const c of codes) if (set.has(c)) return true;
    return false;
  }

  private gamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const g of navigator.getGamepads()) if (g && g.connected) return g;
    return null;
  }

  /** Produce this frame's intent and clear edge state. */
  sample(): Intent {
    const i = emptyIntent();
    const gp = this.gamepad();

    let steer = 0;
    if (this.any(CODE.left, this.down)) steer -= 1;
    if (this.any(CODE.right, this.down)) steer += 1;
    if (gp) {
      const ax = gp.axes[0] ?? 0;
      if (Math.abs(ax) > 0.15) steer += ax;
    }
    i.steer = clamp(steer, -1, 1);

    const gpBtn = (n: number) => !!gp?.buttons[n]?.pressed;

    i.push = this.any(CODE.push, this.down) || gpBtn(0);
    i.pushPressed = this.any(CODE.push, this.pressed);
    i.brake = this.any(CODE.brake, this.down) || gpBtn(1);
    i.ollieHeld = this.any(CODE.ollie, this.down) || gpBtn(2);
    i.olliePressed = this.any(CODE.ollie, this.pressed);
    i.ollieReleased = this.any(CODE.ollie, this.released);
    i.trickPressed = this.any(CODE.trick, this.pressed);
    i.toggleStance = this.any(CODE.stance, this.pressed) || gpBtn(3);
    i.interact = this.any(CODE.interact, this.down);
    i.interactPressed = this.any(CODE.interact, this.pressed);
    i.aimModePressed = this.any(CODE.aimMode, this.pressed);
    i.skip = this.any(CODE.skip, this.pressed);

    const aimRaw = this.mouse.right || (gp ? (gp.buttons[6]?.value ?? 0) > 0.4 : false);
    if (this.options.holdToAim) {
      i.aim = aimRaw;
    } else {
      if (aimRaw && !this.aimToggle) this.aimToggle = true;
      else if (aimRaw && this.aimToggle) this.aimToggle = false;
      i.aim = this.aimToggle;
    }

    i.fire = this.mouse.left || (gp ? (gp.buttons[7]?.value ?? 0) > 0.4 : false);
    i.firePressed = this.mouse.leftPressed;

    const visionRaw = this.any(CODE.vision, this.down) || gpBtn(4);
    if (this.options.holdForVision) {
      i.vision = visionRaw;
    } else {
      if (this.any(CODE.vision, this.pressed)) this.visionToggle = !this.visionToggle;
      i.vision = this.visionToggle;
    }

    i.pointer.x = this.mouse.x;
    i.pointer.y = this.mouse.y;
    i.pointerActive = this.mouse.active;

    this.pressed.clear();
    this.released.clear();
    this.mouse.leftPressed = false;
    return i;
  }
}
