# 24 — The third-person skate camera

## The audit, before any code

| Question | Finding |
|---|---|
| Rendering architecture | Oblique top-down 2D. Polygon footprints with a `ROOF_K = 0.42` lift faking height. Not a projection. |
| How the player is represented | A rounded rectangle with an ellipse on it. |
| How movement works | `sim/player.ts`: heading, carve rate by speed, lateral grip, push impulses. Sound, and unchanged by this pass. |
| Camera | `ViewCamera` — a 2D pan/zoom with speed-based framing. |
| Jump | Real: `ollieImpulse`, an `AIR` stance, gravity, landing tolerance. |
| Slingshot | Already first-person, built last pass, with its own pinhole projection. |
| **What can be preserved** | **Everything.** The simulation, the world data, surveillance, story, evasion, progression, the machine layer. |
| **What must change** | The camera and the player's representation — and only those. |

### The finding that decided the approach

**A perspective renderer already existed.** The stationary aiming mode needed one
last pass, so the projection, the near-plane clipping and the painter's ordering
were already written and shipping. **A third-person chase camera is that same
projection with the eye pulled back behind the rider and pitched down.**

So the minimum viable path was not a 3D conversion. It was: generalise the
first-person renderer into a shared perspective camera with two modes, and give
it a rider to draw. `firstPerson.ts` became `perspective.ts`. Nothing in
`src/sim` changed to make the camera work.

### The limitation, documented rather than bulldozed

**The machine layer cannot follow into perspective cheaply, and should not.**
Coverage cones, network edges, the prediction fan and evidence rings are 65 call
sites bound to the flat camera — and more importantly they are *more* legible
from above, not less. A coverage cone seen from inside it is a shape you cannot
read.

So: **VISION is now the plan view.** Third person is your body — you, the board,
the pavement, and the lens on the wall pointing at you. Holding VISION crosses
to the machine's picture of you, which is a map, because that is what the
machine has. The peel has always been the transition between those two things;
now the two things actually look different.

Zero machine-layer code changed. Every surveillance system is mechanically
untouched.

## What was built

**The chase camera.** Trails the board rather than being bolted to it: yaw eases
toward the nose (not the travel direction, which juddered every time the board
washed out), the rig opens from 4.9 m to 7.8 m with speed and flattens its pitch
so more road comes into frame, the look-at point lags under acceleration, and
the eye pulls in if a building gets between it and the rider.

**The rider.** The deck is real ground-aligned geometry that turns with the
heading — not a billboard — because the entire point is that you can see the
board turn under you. Four wheels, so it reads as rolling. Two legs: the front
foot across the deck, the back one off the tail and reaching for the road during
a push, driven by `pushPhase` so it happens when a push happens. Torso and head
shift forward over the pushing foot and lean into the carve.

**Camera-relative steering.** The stick's screen direction is rotated by the
camera yaw in `main.ts` — the composition root, because that is a fact about the
camera and the simulation must not know cameras exist. Pushing up means "the way
I am facing" instead of "north".

**Cameras as objects.** Each sensor is now a bracket, a housing box oriented
along its facing, and a lens disc on the front that turns with the sweep and
lights when it actually has you. The surveillance model is untouched; what
changed is that the thing doing the watching is a physical object you can see
pointing at you.

**The slingshot in hands.** Two arms, two hands, a wooden fork, and elastic that
visibly stretches with the draw with a bearing sitting in the pouch. Drawn in
screen space, because it is held against the eye — so it costs nothing and never
clips into a wall.

## What this is not

It is not a 3D game. There is no z-buffer, no lighting model, no textures, no
mesh pipeline, no new assets. It is the same flat-colour vector world, projected
through a pinhole instead of flattened. Painter's order by depth, one clip
plane, and a distance cull. That is the whole cost.

---
## Pass 2 — layering, framing, stance, and shooting people

### The depth bug, and why it was not a player hack

The rider kept disappearing under grass and grass grew over the road. The cause
was not the player: **every face was sorted by average camera depth, and ground
surfaces are all coplanar at z = 0.** Sorting coplanar polygons by centroid
distance is meaningless — a large lawn whose centre happens to be nearer than
the rider paints straight over them.

The fix is a depth *strategy*, not a special case. Faces now sort in two
classes: the ground plane is painted first in the authored `priority` order the
flat renderer has always used (grass 0, pavement 1, carriageway 2, driveways 3,
plazas 4 …), then everything that stands up is sorted back to front by depth.
The rider is not forced above anything and still goes behind walls, props and
trees. The contact shadow is painted onto the ground plane, because it is a mark
on the road rather than an object standing on it.

### Stance

The pushing foot used to flip with the lean, so the rider swapped stance
mid-carve. It is locked: **left foot forward on the deck, right foot pushes.**

### The board rolls

The deck used to stay flat while the rider rotated around it — the clearest
possible tell that a thing is a vehicle. The whole deck now banks on its long
axis, the wheels bank with it, the front foot rides the tilted edge, and the
body leans over it. Turn input → board angle → rider → camera, in that order.

### The pop

Driven from the simulation's own vertical state (`crouch`, `landTimer`) rather
than guessed from height, so it cannot drift out of time with the board: knees
fold as it loads, the body extends through the rise, the tail snaps down and the
nose comes up, and the landing is absorbed.

## Shooting people

**The slingshot can hit a person, and can never hurt one.** Making people
unhittable is a lie a player catches in ten seconds. Making them damageable
turns a disruption tool into a weapon, and the whole design says it is not one.

So the bearing lands, and nothing happens to them. What happens is that a person
in a town full of cameras has just had something thrown at them:

- **They stop and look at you** for three seconds, then leave, quickly, away
  from you. They do not resume their walk.
- **Everyone within 26 m with line of sight turns round too**, and the message
  names how many.
- **`PERSON_STRUCK` evidence** is written, weighted 46 — the heaviest kind in
  the game, and it does no damage at all.
- **An incident opens where it happened, and stays open.** Risk is recomputed
  from the world every tick, so a number added to the track would be gone by the
  next frame; the pressure has to come from something that persists. An open
  incident is a place that is now dangerous.
- **On camera is worse than off it.** A frame lets fusion attribute the incident
  to a name, and an incident with your name on it is a different thing from an
  incident near you. That difference is the whole mechanic, and it is tested.
- **A unit is routed**, for forty seconds of attention.

No morality meter, no rebuke, no karma. The player is never told this was wrong.
The town simply becomes harder to move through, which is a more interesting
sentence. The question the slingshot asks about a person is *can I get away with
this*, and the answer is usually no.

The same slingshot, the same projectile physics, the same first-person mode.
Only the world's response differs by what was hit.
