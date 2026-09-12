import { describe, expect, it } from 'vitest';
import { InputManager, mergeIntent } from '../src/core/input';
import { TouchEngine } from '../src/core/touch';

/**
 * A minimal stand-in for `Window` — just enough of `EventTarget` for
 * `InputManager.attach` to register on, with a way to fire events back at it
 * without a real DOM. The handlers only ever read plain properties off the
 * event (`.button`, `.code`, `.clientX`), so a plain object stands in fine.
 */
class FakeTarget {
  private listeners = new Map<string, Set<(e: unknown) => void>>();
  addEventListener(type: string, fn: (e: unknown) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  fire(type: string, detail: Record<string, unknown> = {}): void {
    for (const fn of this.listeners.get(type) ?? []) fn(detail);
  }
}

function harness() {
  const target = new FakeTarget();
  const input = new InputManager();
  input.attach(target as unknown as Window);
  return { target, input };
}

/**
 * The slingshot used to need two controls at once on a mouse — hold right to
 * draw, then click left to fire while right was still held — which nobody
 * would find without reading the source, and which the README never
 * described: it promises one control, "draw the band; release to throw".
 * These pin the fix down as a contract, not just a manual check.
 */
describe('the mouse slingshot is one control, the way the README says', () => {
  it('draws on nothing but a left-mouse hold, and fires on letting it go', () => {
    const { target, input } = harness();

    target.fire('mousedown', { button: 0 });
    expect(input.sample().aim).toBe(true);

    // Held, not yet released: still aiming, no shot.
    let i = input.sample();
    expect(i.aim).toBe(true);
    expect(i.firePressed).toBe(false);

    target.fire('mouseup', { button: 0 });
    i = input.sample();
    // The release itself is the shot.
    expect(i.firePressed).toBe(true);
    expect(i.aim).toBe(false);
  });

  it('never requires a second button to be held for the first to matter', () => {
    const { target, input } = harness();

    // Left alone, with the right button never touched at all.
    target.fire('mousedown', { button: 0 });
    input.sample();
    target.fire('mouseup', { button: 0 });
    const i = input.sample();

    expect(i.firePressed).toBe(true);
  });

  it('does not fire on the press, only on the release', () => {
    const { target, input } = harness();
    target.fire('mousedown', { button: 0 });
    const i = input.sample();
    expect(i.aim).toBe(true);
    expect(i.firePressed).toBe(false);
  });
});

/**
 * The bug the two fixes above did not touch, because neither of them ran the
 * mouse through the actual path a real frame does.
 *
 * `main.ts` calls `mergeIntent(this.input.sample(), this.touch.sample())`
 * every tick, on every device, and tells the touch engine whether the sim is
 * aiming with `touch.setAiming(sim.aimMode)` — a fact about the *simulation*,
 * not about whether anybody's finger is anywhere near a touchscreen. With
 * `aiming` true and nothing actually touched, `TouchEngine.sample()` still
 * used to report "not holding the sling: drawAmount 0" — a real default for a
 * real thumb that has landed on the aim side and not yet pulled anything,
 * asserted just as confidently with zero fingers on the glass. `mergeIntent`
 * overwrites `drawAmount` whenever the touch side is non-null, so that phantom
 * zero landed on top of the mouse's own charge on every single frame: on a
 * machine with no touchscreen at all, `player.draw` could not leave zero, and
 * releasing the mouse never fired anything. Both of the previous slingshot
 * fixes were real and both were sound, on the parts of the path they tested —
 * `InputManager` alone, `TouchEngine` alone — and neither of those tests ever
 * ran the merge that broke it, which is exactly why the report kept coming
 * back after each of them shipped.
 */
describe('the mouse slingshot survives an idle touch layer', () => {
  it('reaches full draw on a mouse hold even while the touch engine is "aiming"', () => {
    const { target, input } = harness();
    const touch = new TouchEngine();
    // What main.ts does the instant sim.aimMode goes true — on every device,
    // touchscreen or not.
    touch.setAiming(true);

    target.fire('mousedown', { button: 0 });
    let merged = mergeIntent(input.sample(), touch.sample());
    expect(merged.aim).toBe(true);
    expect(merged.drawAmount).toBeNull(); // nothing to say about it: no thumb involved

    // Sampling again with the mouse still held and still nothing touched.
    merged = mergeIntent(input.sample(), touch.sample());
    expect(merged.drawAmount).toBeNull();
    expect(merged.firePressed).toBe(false);

    target.fire('mouseup', { button: 0 });
    merged = mergeIntent(input.sample(), touch.sample());
    expect(merged.firePressed).toBe(true);
  });

  it('still describes a real touch correctly: aim thumb down, nothing pulled yet', () => {
    // The one case the fix has to leave alone: a real finger on the aim side
    // with the pull side untouched genuinely is "nothing loaded", and that
    // has to keep reading as drawAmount 0, not null.
    const touch = new TouchEngine();
    touch.setViewport({ w: 390, h: 844, safe: { top: 0, right: 0, bottom: 0, left: 0 } });
    touch.setAiming(true);
    touch.handle('down', { id: 1, x: 50, y: 400, t: 0 });
    const i = touch.sample();
    expect(i.aim).toBe(true);
    expect(i.drawAmount).toBe(0);
  });
});

describe('the keyboard grab binding', () => {
  it('asks for a grab on G, and only for the one frame it was pressed', () => {
    const { target, input } = harness();
    target.fire('keydown', { code: 'KeyG', repeat: false });
    expect(input.sample().grabPressed).toBe(true);
    // A press is a press, not a hold — the next sample sees nothing new
    // unless the key comes back up and down again.
    expect(input.sample().grabPressed).toBe(false);
  });
});
