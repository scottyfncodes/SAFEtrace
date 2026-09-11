# 33 — A fourth button, and a lens that went too far

Three notes, and the middle one is a correction of the previous pass's own
work rather than a new complaint about something older.

## The slingshot's left-thumb toggle, made to match how aiming actually feels

"Slingshot still not working intuitively. Is there a better feeling left
thumb toggle?" — after the mouse chord was already fixed, so this is about
touch: specifically, the gesture that leaves aim mode.

The left thumb drags to aim and, lifted without having dragged, leaves the
mode — a tap. But "tap" was borrowed wholesale from the button vocabulary,
which also requires the lift to come inside `tapMs`, 240 milliseconds. That
is the wrong model for a thumb that is genuinely aiming: holding a line
steady while deciding whether you are done is the *ordinary* shape of using
a sight, not a slow button press, and a quarter of a second is nothing next
to how long that decision takes. Anybody who paused to actually look at
something before deciding to stop aiming held past the window, and their
lift did nothing — they had to tap again, quickly, having already lifted
once for no visible reason.

The fix drops the time bound for this one gesture and keeps only the
distance one: `onRelease`'s `'aim'` case now leaves the mode whenever the
thumb lifts having moved no further than `tapSlop`, however long it sat
there first. A resting, undragged thumb was always the intent; the duration
check was never doing anything but rejecting the normal case. Two tests: a
900 ms motionless hold still exits, and an actual drag — however long or
short — still does not.

## GRAB: a fourth button, cycling through six

Requested directly: a grab button, cycling through grabs. The existing
flip-trick system was the template and the deliberate opposite at the same
time. A `TrickSpec` is two numbers about the deck's rotation and a duration;
tricks are picked *randomly* because a flip is over in under half a second —
which one it turns out to be is the discovery, and rolling for it is the
point (`requestTrick`'s own comment says as much). A grab has no rotation at
all — the deck stays put and a hand goes down to a point on it — and it is
held for as long as the player can stay in the air, which makes it a choice
the player is making rather than a roll they are watching. A button that
hands back whatever it already gave you is not a choice, so `GRABS` cycles:
`requestGrab` advances `player.grabIndex` on every press, landed or bailed,
and never repeats until the list wraps.

Six real grabs, each a point on the deck (`f` fore/aft, `r` toe/heel,
matching the renderer's own `onBoard()` coordinates exactly) and which arm
reaches for it: INDY and STALEFISH are the back hand's edges, MUTE and MELON
the front hand's, NOSEGRAB and TAILGRAB either hand at the tips. The rig
underneath only ever knew left and right, never a rider's front and back
hand, so `side` picks an arm rather than claiming an anatomical precision
this rig was never built for — the names and the points on the deck are the
real ones, the hand assignment is the one approximation, and the code says
so rather than pretending otherwise.

The pose reuses machinery that already existed rather than inventing a new
one: `onBoard(f, r, u)` is the exact function `collectRider` already uses to
turn the deck through a flip, so sending an arm's two-bone IK target through
it means the hand travels with the board, in the board's own frame, for
free. A grab in progress blocks a trick and a trick in progress blocks a
grab — one motion at a time, the same rule tricks already followed — and a
crash landing retracts credit the same tick it would have been given,
because holding on through a slam is not landing it.

On the phone, GRAB is a fourth circle, and the three that were already there
had no room to spare for it. The diagonal TRICK sits on runs out of
clearance from every other button on a 320 px phone if extended any further
left — the aiming-mode split down the middle of the glass sits at the exact
halfway point, and going further out on that diagonal put the new circle
across it, which a test caught immediately (`'expected \'aim\' to be
\'pull\''`, on five of the nine viewports, which is what a real geometry
violation looks like from outside). GRAB climbs the column instead, directly
above TRICK, at PLAN's own smaller size — a press-once-and-hold control can
afford to be a slightly further reach than a flick can. The screen-coverage
budget on the smallest phone in the matrix goes from seven per cent to
eight, which is the honest cost of a fourth circle and is now what the test
asserts rather than papering over.

## The lens went too far

The previous pass narrowed the vertical field of view a third time — 40°,
already narrowed twice before, down to 34° — to buy back the rider's size
after pulling the rig further out for "an even smaller perspective." The
very next report was "skating around feels more limiting than it does
freeing," and the two are the same fact seen from two sides: a longer lens
is also a narrower window onto whatever is beside the rider, and a skater's
field of view is not scenery. It is the input the whole skill runs on — you
carve around what you can see coming, weave through what you can see is
there, and forty degrees of a phone screen is not a lot of world to be
making those calls inside thirty-four.

The fix un-does exactly the one change that cost that, and nothing else:
`VFOV` is 40° again — where it sat through every pass before the one that
went too far. The rig itself stays where the previous pass put it, further
back and higher (`ChaseCamera.dist`/`.height`, untouched) — that half of
"smaller and further away" was never the problem, and pulling back actually
*helps* situational awareness rather than costing it. So the town still
reads more like a model than it did two passes ago; the rider just gets
their side-vision back paying for it.

No test pins a field-of-view constant — it was never a number any test
touched, on either side of this — so there is nothing to update here beyond
the comment explaining the reversal honestly, which matters more than usual
given it is undoing this project's own most recent work.

## What was tested

376 tests, up from 364: eight for the grab cycle and its landing/bail/
mutual-exclusion rules, one for the touch tap, one for the keyboard binding,
and two for the aim-exit gesture (a long motionless hold now exits; an
actual drag still never does). `npm run typecheck` clean, `npx vite build`
green.
