# 43 — The sling line

The reshape brief: UNDERWATCH is a skateboarding traversal game about a city
that is watching you, and the slingshot is the mechanic that makes it
distinct. The slingshot as built threw stones. It still does, exactly as
before. This pass gives it the other use: **hook the band over something and
you are the stone.**

## What was added, and what was not touched

Nothing in the skating model's tuning changed. The line is a constraint laid
over the board *after* the board has taken its step: `updatePlayer` runs as it
always did, then `stepLine` removes whatever would stretch the line and adds
what reeling in gives back. With no hook pressed the board is bit-for-bit what
it was (a test asserts it).

| | |
|---|---|
| `src/sim/traversal/poleLine.ts` | The pole line, moved out of the renderer. The pole you see is the pole you hook. |
| `src/sim/traversal/anchors.ts` | Utility poles, cameras on poles, signs and hoops, masts on flat roofs, and light standards where a plaza has no pole line. |
| `src/sim/traversal/slingline.ts` | Hook, swing, zip, release. |
| `World.supportAt` | Flat roofs are a surface. Houses are pitched: they are cleared, not landed on. |
| `sensors.ts observe` | A rider more than 0.6 m above a camera's mount is not in its picture. |

## The swing

- **Hook** (`C`, gamepad RB, `HOOK` on a phone) catches the bracketed anchor.
  A press a quarter-second early is honoured when something comes into reach.
- **Held**, the line reels in and takes up slack as it comes, so it catches at
  the closest pass. Reeled in, angular momentum is conserved: the swing speeds
  up. The band also pulls along the swing, so a slow hook still goes somewhere.
- **The charge is the arc.** A quarter-turn round the anchor is a full charge.
  There is no timing window: the arc is visible, and the ring at the hook point
  fills with it.
- **Let go** and the board leaves along the tangent, faster than it came in
  (speed over the board's cap is carried as `capBoost` and bleeds off once the
  wheels are down), and up: a full charge clears the anchor it swung round. A
  flick past a pole is a hop.
- The band lets go on its own after 2.2 turns or 3.4 s, and slips off rather
  than dragging the rider through a wall.

## Masts: getting on top of the town

A mast's building is in the way of any orbit, so a mast does something else:
it reels the rider **up the side of the building**, straight up until the board
is over the parapet, then in across the roof, and sets them down rolling. Let
go early and it is a leap from wherever the band had got to. A test searches
the town for a mast that takes a rider from the street to a roof, so that
stays possible whatever the layout does.

## Roofs

Any non-house building at least 2.2 m tall can be landed on and skated (a roof
rolls like smooth concrete). Rolling off the edge is a drop. Ledges and kerbs
are untouched. Most cameras are mounted 3–5 m up, so a roof is mostly off the
cameras' grid. Drones still look down.

## Reading it

Anchors in reach ahead get a small tick at the hook point while rolling. The
one a hook would catch gets a bracket with the key on it. While hooked, the band
runs from the rider's hands to the anchor, and the charge ring fills. Masts
carry a band of the player's colour at the hook point, the one piece of the
town painted the colour that means "yours".
