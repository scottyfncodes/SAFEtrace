# 35 — The prop that followed the wrong hand

Fifth report on the slingshot, and the first one that wasn't about input at
all. "It's not working on mobile, idk." Two follow-up questions narrowed it:
tapping SLING "half-works but feels wrong," and specifically — "jumps
unexpectedly, I can move the aimer around but not fluidly and can't figure
out at all how to actually pull it back, much less fire, and much less
aimed at anything."

That reads like the input bug from doc 34 all over again, except doc 34 was
already fixed and verified end to end in a browser. Reproducing it the same
way — synthetic touch, then real CDP touch dispatch — the gesture worked.
Draw climbed, a projectile appeared on release, aim mode held. Numerically,
nothing was wrong. So the numbers were the wrong thing to look at, and this
pass looked at the screen instead: three screenshots through the actual
gesture, aim thumb down, both thumbs down, pulled back.

## What the screen showed that the console didn't

`drawSlingInHands()` drew the fork at the aim thumb's raw screen position and
the pouch at the pull thumb's raw screen position — the theory being that
nothing on screen is a metaphor for the input, it *is* the input, so gluing
the prop to the actual finger needs no translation. It reads fine as a
sentence. Against a real two-thumb grip it did two things at once, both
exactly matching the report:

- A thumb resting in the ordinary middle of its own half of the screen —
  not an edge case — puts the two hands most of a phone's width apart. The
  cords from two fork tips to one pouch that far over don't fan out, they
  cross each other in a wide X across the center of the screen. That's "not
  aimed at anything."
- The aim thumb's entire job is dragging to swing the camera. Every bit of
  aiming physically relocated the fork, and the arms holding it, because the
  fork's position *was* the aim thumb's position. That's "jumps
  unexpectedly" and "not fluid," described exactly.

Neither of these is a bug in the gesture. The gesture already reports the
right values — a camera delta for aim, a draw amount from 0 to 1 for pull.
The bug was that the drawing code ignored both of those and read raw
coordinates instead, which happen to be highly correlated with the real
values but are not the same thing, and diverge exactly at "comfortable
midscreen grip," which is where a thumb actually rests.

A second, quieter case of the same mistake: on mouse, the fork/pouch fields
were only ever populated from touch, so on desktop the pouch never moved at
all regardless of draw — only a subtle cord-sag shift hinted at anything
happening. Nobody reported this one, probably because "the mouse version
looks a little static" doesn't feel like a bug worth mentioning next to
"can't fire."

## The fix

The fork now sits at one fixed point — `slingRest` — for as long as a shot
is being lined up, full stop. It doesn't matter what the aim thumb is doing,
because the aim thumb was never the fork's job to render; `takeAimDrag`
already reads the *change* in the aim thumb's position and feeds it straight
to the camera. The prop never needed to know where the thumb landed, only
that it moved, and it was tracking the wrong one of those two facts.

The pouch moves along one fixed axis out from the fork — down and to the
side, toward where a pulled-back right hand actually ends up — by an amount
proportional to `draw`, 0 at rest and 1 at a full pull. `draw` is
`sim.player.draw`, which is already correct and already device-agnostic:
mouse or touch, it's the same number, so the fix is free on both and the
long-invisible desktop case is fixed as a side effect of fixing the one that
was reported.

Everything downstream of the fork and pouch positions — the taper on each
branch, the cord-crossing-avoidance pairing that picks which prong ties to
which anchor, the sag and the leather pouch and the seated-back hand — didn't
need to change. It was already generic over "where are the two ends of this
cord," it just used to get handed the wrong two points.

## What removing the old wiring took with it

Once the fork and pouch stopped needing the raw thumb position, nothing else
did either. `TouchEngine.slingHand` and `TouchEngine.slingGrip` — getters
that existed to hand the renderer exactly the coordinates it now no longer
reads — came out, along with the private `aimTrack` getter that only existed
to feed `slingHand`, and the matching fields and per-frame assignments in
the renderer and in `main.ts`. All of it was demand created by the bug; with
the bug gone, so was the demand.

## How this was checked

Screenshots, deliberately, not assertions — the numbers were already right
and had already been checked twice. Three before the fix (aim entered, both
thumbs down at rest, pulled back) showing the crossing cords and a fork that
had visibly moved. Two after: one at a confirmed full draw
(`draw: 1`, logged from `window.safetrace`), one with the pull thumb held at
that same full draw while the aim thumb was dragged to a completely
different part of the screen. The camera view changes correctly between
those last two — proving the drag still reaches the camera — while the
fork, pouch, and cord geometry are pixel-identical between them, proving the
prop no longer reacts to it at all.

## What was tested

378 tests, unchanged — this was a rendering fix downstream of values every
existing test already covers, not a new code path. `npm run typecheck`
clean, `npx vite build` clean. Verified visually in a real browser via
Playwright screenshots before and after, which is what actually caught it.
