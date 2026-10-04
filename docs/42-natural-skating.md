# 42 — Natural skating

The brief was three words: make the skateboarding more natural. The skating
model had been tuned, over passes 22 to 37, until it *handled* like a board —
weight in the turn, an arc you carry through, a pop that clears a kerb — and
then left alone. Watched rather than driven, it still had tells. Three of
them were the kind a skater notices in the first second and a spectator feels
without being able to name, and this pass is those three, plus the small
things found on the way.

## What was wrong

| | Finding |
| --- | --- |
| **The push arrived before the foot did.** | The whole impulse landed on the frame the button did; a leg animation then played for a fifth of a second *after* the board had already jumped. While the foot was "down" it swept backwards and then forwards along the road, which is a foot sliding the wrong way on asphalt, and it snapped from the tail to the ground and back at both ends of the stride. |
| **The body leaned for the wrong reason.** | Lean followed the turn *rate*, so a slow board tic-tacking in a driveway leaned harder than a fast one in a long sweeping carve — the opposite of a person, who leans against the force actually trying to throw them off. |
| **The brake was a tighter corner.** | Holding brake at speed was a sharper carve with more friction: the board turned and the velocity followed, gripping *harder* than in a normal turn. A powerslide is the other thing entirely. |
| A tapped ollie extended from standing. | The knees had one frame to fold before the board was in the air, so a tap read as a hop. |
| The deck pitched in two steps. | Nose-up on the way up, a shallower fixed angle on the way down, with a step at the apex. |
| The head looked where the nose pointed. | Not round the turn, and not along the road in a slide. |

## The push

A stride is now a third of a second (`pushDuration` 0.34 s, inside the same
0.42 s rhythm), and the speed arrives only while the foot is on the road —
between 22% and 70% of the stride — on a raised cosine that peaks mid-drive.
The total is exactly what the one-frame shove used to deliver; it just
arrives through the sole of the foot. The scuff sound and the surveillance
noise fire when the foot touches down, not when the button does, and a foot
that never reaches the road (a pop in the middle of a stride) pushes
nothing. The foot-down window is also when the pushing foot can redirect the
board — `pushSteerBoost` used to apply for the whole stride.

The rig reads the same stride constants. The foot lifts off the tail, swings
out and forward, comes down just ahead of the hip, **stays put on the road
while the board rolls past it** — in the board's frame it only ever moves
backwards, by as much road as actually went by, capped at what a leg can
reach — then lifts and swings back to the tail. The standing knee bends as
the other foot goes down.

## Lean

Lean is now against the cornering load, speed times turn rate, with 6 m/s²
as a full lean — about thirty degrees on a real board. A fast, gentle carve
is a committed lean; a pivot on the spot is barely one. Sliding wheels push
back with nothing, so in a slide there is nothing to lean on and the lean
goes out. The head looks round the turn, ahead of the nose, by a little
under half the lean.

## The powerslide

Holding brake above 3.2 m/s lets the wheels go. The deck is kicked out to
about eighty degrees off the line of travel — frontside by default, so the
rider ends up facing where they are going; the stick picks the other side —
in about a third of a second, and the swing is run as a motion profile so it
stops *at* eighty rather than sailing past on its own momentum. Lateral grip
in the slide is nearly nothing (1.5% a frame against 34%), so the rider
keeps going the way they were going while four wheels dragged across the
road scrub the speed off. Past ninety a slide is a fall, and it never gets
there. Below walking pace it is a stop, and the brake is a foot on the road
as before.

Letting go, the wheels are still sliding and they drag the board straight:
the *heading* comes back to the line of travel, rather than the travel
snapping round to wherever the deck happened to point, which would have
been a right-angle turn out of thin air. The simulation carries this as
`slip`, 0..1 — one through a slide, fading after it as the board
straightens and grips — and grip, drag and the straightening torque all
scale with it, so the regrip finishes the job instead of stopping at a
threshold. Ordinary carving never moves `slip`.

In the rig the rider braces: low, weight back over the trailing edge while
the deck is pushed out ahead, arms wide, eyes along the road rather than the
deck. The wheels letting go is a short rising scrub of urethane,
`player:slide`, once per slide.

**The camera does not slide.** Found by playing it headless: the chase rig
faces the way the deck points, so the first powerslide spun the whole town
eighty degrees and back. It now follows the line of travel to the extent the
wheels are sliding — the same `slip` — and is back on the nose by the time
the board grips again.

## Smaller

- **A pop folds the knees** on the frame it happens, then extends through
  the rise. The timing of the pop is untouched: pressed-and-released is
  still airborne that frame, which half the tests depend on.
- **Deck pitch is one continuous curve** from the vertical speed: nose up
  off the pop, level at the apex, a touch nose-first coming down.

## What was deliberately left alone

Every number a human has already said yes to: the turning-radius curve, the
turn's own weight, the stick-to-heading translation and its band, the push
rhythm and total, the pop height, the landing tolerance, the speed cap, flow.
Tricks and grabs are the deck's business and were already right. The
flat-plan rider is a map mark and keeps its old stick legs.

## What was tested

`tests/skating.test.ts`, 17 tests: no speed before the foot is down and
nearly all of it while it is; the same total as before; the scuff on
touchdown; the profile's shape; the stride rests inside the rhythm; a foot
that never lands pushes nothing; lean grows with speed for the same ask,
barely moves pivoting, and leans into the turn; a pop with the knees folded;
the slide throws the board sideways while travel barely moves and speed
scrubs; frontside by default and the stick picks the side; never past
sideways; back in line by turning the board rather than the road; announced
once; a stop below walking pace. The existing handling tests (the RC-car
suite, the pop arc, early presses, aiming at a standstill) all still pass
unchanged: 584 tests.
