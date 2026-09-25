# 39 — Controls, and the held sling

Fifteenth pass. The brief was game feel, not layout: *can I skate around
Bellhaven, hold the slingshot on the right, aim naturally while still moving,
release to fire, and immediately carry on skating without fighting the
interface?* Before this pass the honest answer was no. This document records
what was wrong, the control audit, what changed, and how it was played.

## What was wrong

| | Finding |
| --- | --- |
| **Two steps and a state** | Throwing on a phone was: tap `SLING` to take it out, then pull back anywhere on the right half of the glass, then tap `SLING` again to put it away. That is three touches, two controls and a state to remember for one stone, and while the sling was out, every drag on the right half was a throw rather than a look. |
| **Stopped the board** | Drawing the sling coasted the rider to a stop over about a second. That was the right answer when aiming took both thumbs. It did not any more: the left thumb was still on the stick, so the rider stopped under a hand that was asking them to go. |
| **No room to pull** | `SLING` sat in the bottom-right corner, where there is no glass behind a thumb to pull back into. That is why the pull had been moved to "anywhere on the right", which is what created the state above. |
| **The plan was a movement mode** | You could skate in the plan, north-up on a map at four pixels a metre. The stick meant one thing in the plan and another the frame it closed, and leaving the plan meant finding `PLAN` again before you could do the thing you had just decided to do. |
| **No diversion language** | Nothing on screen said what a stone would *do*. The plan could tell you, with a pin down, which cameras a noise would turn; the throw itself could not. |

## The audit

Every control on a phone, asked the brief's questions.

| Control | Verdict | Why |
| --- | --- | --- |
| Stick (left, floating) | **Keep** | Predictable, planted wherever the thumb lands, and nothing else lives on the left. |
| `SLING` | **Rebuilt** | The whole shot is now one touch on the control itself: press, hold, pull, let go. Moved up the thumb's arc so there is a full draw of glass behind it. |
| `TRICK` (tap flip, hold grab) | **Keep, moved to the corner** | It is what a skater presses most, mid-run, without looking. It takes the spot under the resting thumb that `SLING` gave up. |
| `PLAN` | **Keep, rethought** | Smaller, bottom row, left of `TRICK`. It opens a stop-and-look state; closing it is no longer its job alone (below). |
| "Sling out" state and `PUT AWAY` in the street | **Removed** | There is nothing to take out and nothing to put away. `PUT AWAY` survives only in the classic first-person view. |
| Drag-anywhere-to-throw on the right half | **Removed** | Empty glass is for looking round again, everywhere, always. |
| `FIRE`, `GRAB`, a second tap | **Never added** | Letting go is the shot. Holding `TRICK` is the grab. |
| Tap on the world to talk / look / reach | **Keep** | Already contextual: the prompt appears on the thing, and the whole glass is the target. |
| `Notes`, pause (top-left) | **Keep** | Meta controls, out of the thumb zones, never needed mid-run. |
| Throw hint ("pull back from here") | **Replaced** | One short line under `SLING` until the first stone has gone: `HOLD · PULL BACK · LET GO`. |

## The held sling

**Press.** The thumb lands on `SLING` and the sling is drawn from that frame.
There is no view change and no mode: the stick under the other thumb is
untouched, the board keeps rolling (it loses a little to friction, and a push
with a sling drawn is 60 % of a push), and carving costs 15 % rather than 35 %.
The cost of throwing at speed is where it always was — the sway on the shot.

**Hold.** Held still, the hand draws the pouch straight back on its own, to
about half, over half a second. So press, hold, let go is a useful throw up the
street, and the control visibly goes from resting to drawn without the thumb
doing anything.

**Aim.** The thumb then moves the *pouch*, from wherever the hand has drawn it:
back for further, across to point it, forward toward the target for a shorter
lob. The direction is the pouch reversed, as on any slingshot, and the draw is
how far the pouch is from the fork. The moment the thumb starts to aim, the
hand stops drawing on its own, so the bearing never drifts under a thumb that
is holding a line. An earlier version of this pass took the larger of "the
hand's draw" and "the thumb's pull", and playing it found the flaw at once: once
the hand had drawn, nothing nearer than about 35 m could be thrown at. The bin
across the path was out of reach.

**Release.** Letting go is the shot, read from where the pouch was 80 ms
before the lift so the smear of a thumb coming off glass does not skew it. Two
releases throw nothing: a brush under 130 ms that never pulled, and a pouch
pushed forward into the fork until the band is slack (`SLACK · LET GO TO PUT IT
DOWN`). After a shot the band takes 0.3 s to recover. That gives the snap a
moment to be seen and stops a double-tap loosing two stones as one, and a
thumb that drew during it finds the sling ready when the recovery ends.

### What it looks like

- **At rest:** a quiet dark disc, the same as the others, with a forked stick
  and cord across it and `SLING` beneath. A thin ring closes round it while the
  band recovers after a shot.
- **Held:** the disc lifts and warms (amber rim, a shade lighter); the cord
  leaves the fork and stretches to the pouch; a ring round the fork fills
  clockwise with the draw and turns red at full; a chevron outside the ring
  says which way the stone will go. `TRICK` and `PLAN` step back to a quarter
  of their brightness, so the sling is the one thing happening.
- **In the street:** the fork in the rider's hands points along the throw and
  stretches with the draw; the dotted arc runs the real ballistic path. Under
  where it comes down, a line of words says what the stone would do there.
- **Released:** the pouch snaps back through the fork and rings, one ring
  flashes outward from the control, a whip of air leaves the fork in the
  street along the throw, and the control is quiet again.

### A tool for noise first

The line under the arc is the diversion language the throw was missing. It
leads with who would turn to look, using the same arithmetic and the same
knowledge rule as the plan's pin (before VISION, only cameras the player has
noticed count):

| Where it comes down | Reads |
| --- | --- |
| Road, lawn, wall, with cameras in earshot | `NOISE · TURNS 2 CAMERAS` |
| …in a street that has heard too much | `NOISE · THEY'D LOOK BACK AT YOU` |
| …with nobody to hear | `NOISE · NOBODY LOOKS` |
| A bin, a sign, a car | `BIN · LOUD · TURNS 3` |
| A camera / drone / relay box | `CAMERA · KNOCK IT ASIDE` / `DRONE · KNOCK IT OFF LINE` / `RELAY BOX` |
| A tree | `TREE · RUSTLE` |
| A person | `THAT'S A PERSON` |

Nothing about sabotage was removed; the words simply lead with what a noise
does, because that is what the slingshot is mostly for.

The same interaction scales to whatever a stone is later asked to do — tip a
sign, trip a sensor, knock a shutter — because the control only ever says
*where* and *how hard*; what the stone meets decides what happens, and the
readout names it.

## The plan: a stop, to look

The plan is where you stop and read the town. The board rolls out to a stand
under you over about a second (not a halt), and nothing you do can act on the
street from here: no aim, no pop, no push. The map, the cameras you know, the
pin and what a stone at the pin would turn are what the view is for.

**Leaving it is doing the next thing.** Set off on the stick (or `W`), pop,
press `TRICK`, press `SLING`, press `F`: the plan closes and that same input
carries straight on into the street, camera-relative, in the same frame. `PLAN`
and `Q` still close it too. A stick already held when the plan opened does not
count until it has been let go once, so opening the plan on the move never
bounces it shut. A mouse click on the map is still a pin and never closes it.

That makes it a tactical state rather than a movement mode: *hide, open the
plan, read who is watching and where a noise would carry, pin the route, push
off*. It costs something too — stopping in view of a camera to read a map is
loitering in view of a camera.

## Layout

The right thumb pivots from the palm just beyond the bottom-right corner.

| | Drawn | Target | Where | Why |
| --- | --- | --- | --- | --- |
| `TRICK` | r 29 | r 42 | the corner | pressed most, without looking |
| `SLING` | r 31 | r 48 | 64 left, 122 up of `TRICK` | on the arc, with a full draw of glass behind it toward the palm and to the edge |
| `PLAN` | r 21 | r 34 | 100 left of `TRICK`, bottom row | a deliberate reach, never on the way to anything |

Tests hold every phone in the matrix — 320 × 454 up to 430 × 739, both
landscapes — to: touch targets ≥ 68 px, ≥ 16 px between any two hit circles,
all targets inside the safe area, the movement pad's derived edge 20 px clear,
nothing in the middle third, under 8 % of the glass covered, a full 120 px draw
behind `SLING` downward and to the right edge, and every control within 230 px
of the corner.

## Played

Driven through real touch events in Chromium at 390 × 844, 320 × 454, 430 × 739
and 844 × 390, and with keyboard and mouse at 1280 × 760:

| | Scenario | Result |
| --- | --- | --- |
| 1–3 | Skate, then hold `SLING` while moving | Speed held at 8.4–8.7 m/s through the whole draw |
| 4 | Adjust aim | The arc and chevron follow the thumb every frame; the bearing holds still under a thumb holding a line |
| 5–6 | Release; carry on | One stone, the draw back to zero, 0.3 s recovery, still rolling at ≥ 8.5 m/s |
| 7–8 | Diversion at a sign by a camera | Readout `SIGN · LOUD · TURNS 1`; the stone hit the sign and one camera turned to it |
| 9–10 | Plan in, plan out | The board rolled out to a stand; `PLAN` or a push closed it |
| 11 | Plan straight into movement | The push that closed it was already moving the rider, camera-relative |
| 12 | Plan straight into a tool | `SLING` pressed on the map: the plan closed and the sling was drawing in the same touch |
| 13 | Rapid switching | Three flicks in under a second threw three stones while skating; a `TRICK` tap straight after still flipped |
| 14 | Screen sizes | As above on every size; the held ring crowds the rider on a 320 × 454 SE, and the held growth was cut from 12 % to 6 % for it |
| 15 | Accidental presses | A brush on `SLING` throws nothing and says so; slack puts it down; roles are fixed at touch-down, so sliding across `TRICK` or `PLAN` mid-pull presses nothing |
| — | Desktop | Mouse pull throws on the move; `Q`, click to pin (plan stays), `W` leaves the plan into motion |

## What is still open

- The press-and-hold draw rate and the half-draw it settles at (0.45 over
  550 ms) were set by feel in one sitting, on emulated touch. They want a real
  thumb on a real phone.
- The classic first-person sling is unchanged, and still a pause-menu option.
- A gamepad throws as before (right stick points, trigger draws and releases);
  the plan's exit-by-doing applies to it through the same intent.
