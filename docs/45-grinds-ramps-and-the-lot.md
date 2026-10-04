# 45 — Grinds, ramps and the Lot

First playtest of the reshape: *get rid of the hook, add a grind button,
incorporate grinds, add ramps to jump, make the city more skatable.* So the
city is now skated the way a city is skated.

## The hook is gone

The sling line, its anchors, the masts and lamp standards, the bracket and
the HOOK button have all been removed. The stone sling is unchanged. Two
things from that pass stay because they're useful without it: flat roofs are a
surface you can land on and roll off, and a rider above a camera's mount is out
of its picture. Collision also still lets a rider out of anything solid by the
shortest way. In its place:

## Grinds (`sim/traversal/grinds.ts`)

- **Lines**: every rail (`builder.rail`), every ledge (the plaza, Maple Court,
  the school, the Lot), every bench, and the tops of the Channel walls. That's
  85 lines in the shipped town.
- **GRIND** (`C`, gamepad RB, the `GRIND` button on a phone):
  - On the ground it pops the board, the same one-motion rule as TRICK.
  - Pressed in the air, or held, it catches the nearest line that the board
    is over, near the height of, and roughly travelling along (within about
    60°).
  - A press is remembered for 0.4 s.
- **On the line** the board rides it at the line's height, losing a little speed.
  It hops off the end, falls off when it runs out of speed, or pops out on an
  ollie or a TRICK (flip out). The skating model rests while you're on a line.
- **Reading it**: the line you're heading for is lit in the player's colour
  before you press. On it, the trucks throw sparks and scrape. Grind names come
  from the kind of line (50-50, 5-0, crooked, feeble, smith, nose and tail
  slides, blunt).
- **Jobs**: a grind pays on the catch, plus per second on it, and chains with
  everything else.

## Ramps

Kickers are real slopes now, not triggers. The board rides up the surface and
leaves the lip with air from its speed and the slope, plus a fixed pop. At full
speed the Lot's kickers give about 2.8 m of air. Ramps are also drawn now: the
features were always in the world data but never rendered, so every ramp in
Bellhaven used to be invisible. One authored inside what later became the cafe
has been removed. Ramps stay off the roadway (an existing design test).

## The Lot

The Lot is a poured pad in the empty field between Commons Street and Ridgeline
Road, with paths in from all four sides. It has four kickers facing in, two
flat bars, a handrail, a long centre rail and a ledge. It's off the road graph
and off the modelled ground, so it's also the quietest place in town. The plaza
gains a kicker straight onto a flat bar between the ledges, plus two benches.

## Jobs and kit

Roof objectives went with the hook. Job points can now require **grinding**
(TAG: grind all three plaza ledges) or **air** (PHOTOGRAPH: take the shot at the
top of a kicker; SPEEDRUN ends in the air off the Lot kicker; the final job
grinds the Lot handrail and airs both kickers). The kit's hook perks are
replaced:
- **WAX**: grinds keep their speed.
- **BIG POP**: a fifth more air off lips and out of grinds.
