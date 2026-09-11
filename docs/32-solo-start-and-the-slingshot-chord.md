# 32 — A solo start, a smaller town, and the slingshot nobody could fire

Four notes from one message, none of them related to each other except that
all four turned out to be real.

## The camera pulls back again

"Even smaller perspective." The chase camera already carries the design
rationale for exactly this axis — a long lens and a rig that dollies back
together are, in the file's own words, "most of the miniature" — so this is a
continuation of that curve rather than a new idea. The lens narrows from 40°
to 34°, and the rig's distance and height both move out by roughly a quarter
(29–36 m back, 14.5–17.5 m up, scaling with speed as before). The pitch is
untouched — the same file already explains why: past thirty degrees the
horizon leaves the frame and takes every drone and every rooftop with it, and
that ceiling didn't move just because the rig got further back.

## The game starts solo

Devon used to spawn eleven metres from the player and follow from the first
tick — `devonFollowing = true` was the default, not something that became true.
So the session opened mid-companionship: the first thing that ever happened in
a new game was somebody else, already there, already matching your speed.

He spawns eighty-odd metres down Maple Court now, standing, and
`devonFollowing` starts `false`. A new beat, `meet-devon`, is the only thing
that ever calls `Sim.meetDevon()` — proximity-gated, the same pattern the
Channel and CM-207 beats already use — so *"Devon: took you long enough"* is
now a reaction to something that actually happened: the player got there. The
ambient CARE weather ping, which never had anything to do with Devon, keeps
its own simple time gate; the channel suggestion that used to fire twelve
seconds into the session now fires ten seconds after the meeting instead,
so it stays a conversation with two lines in it rather than a countdown that
happens to have Devon's name on one of them.

The false-positive plot is unaffected — `runIdentityMatch` picks by district
prior, which was always static data on the Subject, never a function of
where Devon is standing.

## Ramps built into the street

"Things to jump over and ramps are cool, but shouldn't impede traffic in the
street" turned out to be literally true of two features, not a feeling. A
`SkateFeature` — a kicker, a bank, a stair set — never blocks movement;
`resolveCollision` only ever consults building footprints, so a ramp sitting
inside a driving lane doesn't crash into anything or fail any physics
assertion. It just reads as a ramp built into the street, because it is one,
and nothing about that shows up as a bug until someone is standing on the
actual pavement asking why there's a bank in it.

Found by intersecting every kicker/bank/gap/drop polygon against the town's
own `asphalt`-kind surfaces:

- The bank against the library's east wall sat exactly on the connector road
  down to Commons Way — a skate feature built into a real traffic lane. Moved
  ten metres east, off the asphalt, still on the plaza's own paving.
- The Ridgeline school's front stairs ran the wrong way: `facing: 90` put a
  22-metre run straight across Ridgeline Loop and out the far side, when what
  the site wants is a wide, shallow flight of steps down from the forecourt.
  Turned to `facing: 0` (width along the entrance, not across the road) and
  pulled back to land in the four-metre strip between the building and the
  kerb.

A test in `tests/world.test.ts` now checks every jumpable feature against
every asphalt patch in the shipped town, so a third one doesn't have to wait
for somebody to notice it by eye.

## The slingshot nobody could fire

This is the one worth dwelling on, because "can't get it to work" turned out
to be exactly true, and only on one input method.

The touch build fires the way a real slingshot does: draw, then let go.
Releasing the right thumb *is* the shot — there is no separate trigger. The
mouse build never worked that way. `intent.aim` — the flag that puts the
character into the drawing stance and starts loading `player.draw` — was bound
to **right** mouse. Firing required **left** mouse, and only counted while
`player.aiming` was still true, which means only while right mouse was *still
held*. To fire a slingshot at a keyboard, the actual required input was: hold
right, then click left without releasing right first.

Nobody was going to find that by trying "hold left mouse to draw the band,
release to throw" — which is what the README has said the whole time, because
it's what the touch build actually does, and the mouse build was simply never
brought in line with it. A player following the documented control finds that
holding left mouse alone does nothing (`player.aiming` needs `intent.aim`,
which needed right mouse), and a player who discovers the chord by accident
still has to keep both buttons down through the transition, which is not
"draw and release," it's "draw, then perform a separate un-drawn action while
still drawing."

Left mouse (and the equivalent gamepad trigger) now does the whole job:
holding it draws, releasing it fires. The toggle variant of the same setting
— click once to draw, click again to let go — gets the equivalent fix, so the
one input mode that was never reachable through the settings UI isn't left
quietly broken either.

Confirmed with a real `InputManager` and a fake event target rather than by
reasoning about the code: `tests/input.test.ts` dispatches a bare
`mousedown{button:0}` / `mouseup{button:0}` pair — nothing on the right button,
ever — and asserts the draw starts on the first and the shot fires on the
second.

## What was tested

364 tests, up from 358. `npm run typecheck` clean, `npm test` all passing,
`npx vite build` green.
