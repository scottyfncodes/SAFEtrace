# 34 — The slingshot that was never actually drawing

Fourth report. "Slingshot still not working intuitively. What about removing
the arms entirely — left thumb on the handle to aim, right thumb pulls back,
release to fire?"

The proposed design is exactly the shipped one, which is what made this pass
different from the previous two. Both earlier fixes — the mouse's two-button
chord, the touch toggle's 240ms window — were real, and neither was tested
past the boundary of the thing it fixed: an `InputManager` on its own, a
`TouchEngine` on its own. Neither test ever ran the two together, which is
the one thing every real frame does. This time the game was actually driven
in a browser, mouse and touch both, through the real path, before touching
anything.

## What that found

A mouse hold on the sling never moved `player.draw` off zero, in a real
Chromium tab, through `main.ts`'s real loop:

```
t+100ms draw= 0
t+200ms draw= 0
t+300ms draw= 0
t+400ms draw= 0
t+500ms draw= 0
```

`main.ts` calls `mergeIntent(this.input.sample(), this.touch.sample())` every
tick, on every device, and tells the touch engine whether the sim is aiming
with `touch.setAiming(sim.aimMode)` — a fact about the *simulation*, not
about whether there is a touchscreen within a thousand miles. With `aiming`
true and nothing physically touching the glass, `TouchEngine.sample()` still
ran its "not holding the sling: the band is slack" branch and reported
`drawAmount: 0` — a correct default for a real thumb sitting on the aim side
with nothing pulled, asserted with exactly the same confidence when there
was no thumb at all. `mergeIntent` overwrites `drawAmount` whenever the touch
side is non-null:

```ts
if (add.drawAmount !== null) base.drawAmount = add.drawAmount;
```

So that phantom zero landed on top of whatever the mouse's own charge was
computing, every single frame, on any machine without a touchscreen.
`player.draw` could not leave zero. Releasing never fired anything. Neither
of the previous two fixes touched this at all — they were both real, and
both were downstream of a value that was being erased before either of them
ran.

The fix is one condition: the "nothing pulled" default now only fires when
`this.tracks.size > 0` — some finger is actually down somewhere on the
engine, on the aim side, just not pulling yet. With zero touches anywhere,
`sample()` leaves `drawAmount` at its `emptyIntent()` default of `null`,
which is the one value `mergeIntent` is defined to leave alone.

## How this was actually checked

Not by re-reading the code more carefully — that had already happened twice.
The dev server was run, and both devices were driven through the real
`main.ts` loop in a real browser:

**Mouse**, via Playwright, reading `window.safetrace`'s dev hook directly —
`draw` climbing every 100ms and a projectile appearing on release, both
before and after the fix, to see the actual before/after rather than assume
it from the diff:

```
before: 0, 0, 0, 0, 0            → projectiles after release: 0
after:  0.30, 0.48, 0.67, 0.85, 1.0  → projectiles after release: 1
```

**Touch**, via synthetic `PointerEvent`s with `pointerType: 'touch'`
dispatched on `window` — the exact thing `TouchAdapter` listens for — walking
the whole gesture: tap SLING, both thumbs down, pull the right one back,
release it, lift the left one. It worked before this pass and still does
after it; the fix only had to stop touching the one branch that was never
touch's problem. (The first attempt at this check used real CDP
`Input.dispatchTouchEvent` calls, which reached the page but never reached
the app: nothing observable happened, for a boring reason once found — the
tap landed while the opening advertisement was still running, which steps
the simulation but discards the real `Intent` outright for anything but
`skip`, so the tap was received and then thrown away a moment later. Skipping
the ad first fixed the harness, not the game.)

Two regression tests pin the actual bug at the point it lived, not at either
engine alone: `mergeIntent(input.sample(), touch.sample())` with the mouse
held and zero touches ever placed reaches `firePressed` on release; the same
setup with one real touch on the aim side still correctly reports
`drawAmount: 0`, so the fix does not quietly break the case it has to leave
alone.

## On removing the arms

The proposed redesign is the one already shipped, functioning now for the
first time. Nothing about the rendered hands holding the sling caused any
part of this — the failure was three layers below anything drawn on screen,
in the intent merge that runs before the sim or the renderer ever see a
frame. There is nothing to simplify away here that the bug was hiding behind.

## What was tested

378 tests, up from 376. `npm run typecheck` clean, `npx vite build` green.
Both devices additionally verified end to end in a real browser, which is
the check that actually mattered this time.
