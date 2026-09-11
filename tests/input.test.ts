import { describe, expect, it } from 'vitest';
import { InputManager } from '../src/core/input';

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
