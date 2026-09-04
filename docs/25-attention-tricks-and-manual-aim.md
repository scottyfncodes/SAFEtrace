# 25 — Attention, tricks, and a slingshot nobody aims for you

Fifth pass driven by human play. Five changes, and three of them are the same
change: the game had been quietly doing things on the player's behalf, in both
directions, and stopping is the work.

## 1. Watched is not hunted

**What was wrong.** Asset tasking keyed off the risk score alone. A score is
something an ordinary afternoon raises — skate quickly, cut across a road, be
out at the wrong hour — so a drone was launched at somebody who had done
nothing. A probe had the player at 54% and `DRONE_DISPATCH` while skating in a
straight line. That turns the whole town into a chase and leaves nowhere to
simply be in it.

**The model.** `Track.wantedUntil` is a tick, and dispatch will not send an
asset after a track past it. Three things set it, and all three are things the
system can point at:

| Reason | Where |
| --- | --- |
| Evidence analysis links a piece of evidence to a name | `updateEvidence` |
| A witnessed person-strike puts a name on an open incident | `strikePerson` |
| Ten sustained seconds at INTERVENTION level | `updateWanted` |

It lasts two minutes and then lapses back to being merely watched, which never
stopped.

The score still does everything else it did: it climbs, it is broken down in
VISION, it drives the headline escalation level, and once somebody *is* wanted
it decides who gets sent — a drone to have a look, or a patrol standing in the
road at dispatch level and above.

**Deliberately untouched.** Anomaly-driven tasking. A thump three streets away
is a *place* to investigate, not a person to pursue, and the decoy is the whole
point of the slingshot.

**The default state is that nobody cares.**

## 2. Nothing aims for the player

The slingshot has been fixed twice and was wrong both times, in the same way.

1. The character solved the *height* of the arc for whatever was on the line and
   left the *bearing* wherever the thumb pointed. The reticle sat on a drone and
   the shot went past it.
2. So the bearing was bent onto the target — sixteen degrees, then six. That
   fixed a miss by taking the aiming away. A slingshot that closes the gap
   cannot teach anyone to shoot, and it makes every miss ambiguous: the player
   never learns whose it was.

**What is left is ranging, which is not aiming.** The sight is cast into the
world along the player's own look direction and elevation; whatever it lands on
— a target's silhouette, the ground, a point at sighting distance — sets the
distance; the character solves the arc to that point, the way somebody who has
thrown a thousand of these knows what reaches what. Direction is the player's,
always. Put the sight on a drone and it goes there. Put it two metres left and
the bearing goes two metres left, at the right height.

No snapping, no magnetism, no camera centring, no forced rotation. `aimTarget`
survives as a description — what the sight is literally on — and cannot lie,
because it is tested at the silhouette rather than a cone.

Tests express aiming as a look direction *and* a look elevation, because a test
that names an XY on the ground is not aiming at a camera four metres up.

## 3. Tricks

A `TRICK` button. One press, one trick, chosen from the seeded RNG:

| Trick | Flip (turns about the long axis) | Shove (turns about the vertical) |
| --- | --- | --- |
| Kickflip | −1 | 0 |
| Heelflip | +1 | 0 |
| Pop shove-it | 0 | −½ |
| Frontside shove-it | 0 | +½ |
| Varial flip | −1 | −½ |
| 360 shove-it | 0 | −1 |

Every one is a real trick with its real components, and the state the simulation
carries is those two numbers and a duration. The renderer transforms the deck's
four corners in the board's own frame: the deck flips and spins **under the
feet**, the rider tucks their knees up and catches it. Rotating the whole
character instead would produce a 180 — a different trick, and the tell that
nobody involved has stood on a board.

Asked for on the ground it pops first, because it is one motion under a foot.
Asked for in the air off a kicker it starts immediately. A pop buys about 1.3 s
of air and the longest trick takes 0.52 s, so landing mid-rotation only happens
to a trick asked for on the way down — and that is a bail, because it is.

The trick's name flashes for a moment. A button that rolls the dice has to say
what came up.

## 4. The camera, out another 75%

Distance and height scale together, so the rig dollies straight back along its
own view axis: the framing that was right, from further away, rather than a
steeper angle. The lens narrows from 54° to 46° to buy back a fifth of the
rider's apparent size, which also gives the aiming view the long lens a sight
picture wants.

## 5. Controls

* The stick has always centred where the thumb lands; that is now asserted for
  any landing point in the pad, and for the *next* thumb rather than the last.
* Buttons move from a row along the bottom to a two-by-two block in the
  bottom-right corner. The row put its left-most button in the middle of the
  screen, directly under a left thumb, and a fourth would have pushed it
  further. Bottom row: `POP` and `TRICK`, the things a skater does. Above:
  the sling and VISION, the things that change what the game is.
* Button hit areas grow outward toward their corner and stay tight on the side
  facing the movement pad, so forgiveness cannot eat a thumb that was skating.
* A bearing is a small steel ball — a billboarded disc with a rim and a
  highlight — not a flat card that read as a floating cube.
* The aiming view drew its own unlabelled column of bearing dots against the
  same edge as the HUD's labelled one. Two of a thing is worse than one: the
  second one is a question. Removed.

## Preserved

Relay 12's comprehension design, the reduced steering sensitivity, free 360°
look separated from firing, all four wheels on the ground, and the rule that the
slingshot can never physically harm a person.
