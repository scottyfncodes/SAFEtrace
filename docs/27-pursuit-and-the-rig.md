# 27 — Pursuit, speed, and a rider with joints

Seventh pass driven by human play. Six changes.

## 1. What was actually mobilising the police

The dispatch gate from pass 25 held: over 43 seconds of probed skating, zero
tasks issued, both units on their routine beats 100–400 m away. The chase was
not coming from the surveillance model at all — it was **scripted**.

`the-crack`, a story beat that fires about twenty seconds into an ordinary
afternoon, called:

```ts
c.sim.dispatcher.flagAnomaly(c.sim.player.pos, ...)
```

An anomaly at the player's own position tasks a unit to go and investigate the
exact spot the player is standing on. The beat's authored content is *a drone's
shadow crosses them* — scenery. A shadow does not need anybody dispatched to
cast it. The drone is now put on a short route over the player instead, so it
genuinely flies across and carries on, and nobody is looking for anybody.

That is the loudest single source of "I have been skating for twelve seconds
and the entire police department has mobilised".

## 2. Speed

| | Before | Now |
| --- | --- | --- |
| Drone | 16.0 | 16.0 |
| Player, board | 11.0 (+2.5 flow) | unchanged |
| Player, on foot | 2.6 | **5.0** |
| Officer, responding | **12.5** | **4.6** |
| Officer, routine beat | **6.5** | **2.9** |

12.5 m/s is a 45 km/h sprint, and it was faster than the player's top speed on
a board — so once a unit was sent, the only outcomes were being caught or the
task timing out, and neither of those is the player escaping. 6.5 m/s is a
23 km/h "routine patrol", on foot.

A bail also used to drop the player to a 2.6 m/s walk with an officer closing
at nearly five times that. A kid who has just come off their board runs.

The hierarchy now holds in both directions, and is asserted:
**drone > board > running > officer > beat.**

## 3. Losing them

Track confidence already halves every 2.5 s unobserved, and units already route
to the track estimate rather than the truth — but with a unit moving faster than
the player, staleness never got a chance to matter.

Added: a track nothing has seen for six seconds has its pursuing tasks
cancelled. Duck behind one hedge and it is not an escape; break line of sight
and *keep going* and it is. Being lost is not being forgiven — the score is
still up and the file is still open, and anything that sees the player again
starts it over.

## 4. Air first, ground second

Tasking issued one asset per track, so whichever kind happened to be nearest
turned up and the other never appeared. These are two different threats:

* **A drone** is what you cannot outrun. Faster than any board in a straight
  line, but it turns wide (speed falls to 35% when it is not aligned), so a
  skater out-corners it and never out-runs it. Crucially, while it holds visual
  the track stays confident — which keeps *everyone else's* estimate of you
  fresh. A subject the system wants now gets a drone overhead at any level.
* **An officer** is what catches you when you make a mistake. Added once the
  score says the subject is worth a person's time.

One of each at most: committing the pool to one subject is exactly what a decoy
is supposed to prevent. This is what makes the slingshot the answer to the
drone rather than a weapon bolted onto a skating game — shoot it down and the
confidence decays, the ground unit is driving at guesswork, and you are gone.

## 5. The rig

**The knees were bending backwards, and the reason is worth writing down.** A
skater stands across the board, and the side their toes point at is the side
they push off — the right foot comes down on `+r`, so `+r` is the front of this
person. Knees were being pushed to `-r`. Everything about the rig that has a
front now derives from one vector.

That alone would have been a sign flip. The deeper problem was that the bend was
*a decoration*: a joint jammed into the middle of each leg at a fixed sideways
offset, tuned by hand for one pose and wrong in every pose nobody re-tuned.

Both legs and both arms now go through `solveTwoBone` in `core/math.ts`: given
two ends and two bone lengths there are exactly two places the joint can be,
mirror images across the line between the ends, and `bendTo` picks which —
forward for a knee, back and down for an elbow. Consequences fall out of the
triangle instead of being authored:

* Crouch deeper and the knee comes further over the toes on its own.
* Reach a foot to the road and the leg straightens on its own.
* Past full extension it straightens rather than tearing.

Five tests hold it, including both bones keeping their length and the
degenerate cases returning a real point.

**Arms exist now.** There were two sticks running from near the chest to a
hand, hinged nowhere, which is why the character read as a torso with legs.
They hang from a shoulder on the torso, break at an elbow that falls back and
down, and end in a hand: out and low for balance, further out the harder the
board is working, the leading one dropping into a carve, both counter-swinging
a run, wider in the air.

**Running.** A bail is now part of the chase rather than a penalty box, so it
needs to look like running. One phase drives both legs in opposition, taken from
the odometer so the stride is tied to ground actually covered.

## 6. Wheels

They were 0.22 m off the centreline on a deck 0.20 m half-wide, so they stuck
out past both edges and the board read as a go-kart. An eight-inch deck runs an
eight-inch axle: the wheels tuck just inside the edges, and the hanger goes
*under* the ply. Wheels move to 0.13, get slightly smaller, and each truck now
draws a hanger between its pair — so there is something holding them up rather
than two discs floating beside a plank.

## Not done, and why

**Restricted areas.** Listed as an example of a legitimate pursuit trigger
rather than a requirement. The offences that exist — interfering with a lens, a
junction, a unit, or throwing something at a person — already cover deliberate
damage and significant offences. A restricted-zone system is a new feature with
its own authoring, signage and enforcement rules, not a correction, so it is
called out here instead of half-built.

## Preserved

Every control from passes 25 and 26: one-finger look, second-finger pullback,
release to fire, the thumb-lands-where-it-lands joystick, no pop button, no
auto-lock, and the two-thumb independence that keeps the aimer from jumping.
