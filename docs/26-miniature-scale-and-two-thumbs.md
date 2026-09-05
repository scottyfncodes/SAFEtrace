# 26 — A smaller town, two thumbs, and rocks

Sixth pass driven by human play. Nine changes.

## 1. Scale: Hot Wheels → Micro Machines

The brief was explicit that this is not a zoom-out, and the first attempt
proved why. Going straight to a steep overhead — pitch 41°, a 34° lens —
pushed the horizon off the top of the frame and took every drone, every roof
and every distant street with it. What was left was ground in two flat colours:
not a miniature, a texture.

What the impression is actually made of, in the order it matters:

1. **A long lens.** A wide lens is what makes a place feel big — it stretches
   the near ground and throws the far ground away. A long one flattens the
   depth between near and far until a street reads as objects arranged on a
   table, which is the trick every photograph of a model railway plays. 54°,
   then 46°, now **40°**.
2. **More town in frame at once.** The rig carries further back and a little
   higher (eye distance 18 m → 27 m), and the long lens flattens what that
   distance would otherwise stretch. The frame now holds roughly 170 m of
   Bellhaven front to back instead of 80. Streets become blocks; houses become
   things arranged along them.
3. **A soft far field.** Every photograph of a model is shot with a shallow
   depth of field, and the eye reads that fall-off as *closeness to a small
   thing*. A real blur is a full-frame filter pass on a phone; a wash of the
   sky's colour over the far ground says the same thing to the same eye.
4. **`FAR` 105 m → 195 m.** At 105 the far third of the new frame was flat
   green fill with no town in it. A miniature only reads if you can see the far
   edge of the thing. Headless Chromium holds 60 fps at the new draw distance;
   this is the one change worth re-checking on a real phone.

The angle is left near where it was, about two parts back to one part up. The
rider comes out about a fifth smaller than before — small enough to read as a
figure crossing a town, large enough to steer precisely.

## 2. No POP button

A dedicated jump button is what a game gives you when it does not trust its
tricks. TRICK pops on its own — that is one motion under a foot — so POP is
gone and nothing has replaced it. Three buttons: TRICK, sling, VISION. The
keyboard keeps Space.

## 3. Steering

Two things were making the board feel numb, and both were overcorrections from
the pass that fixed it feeling like an RC car.

* Authority carried an extra cubic on top of a smoothstep, so most of it lived
  in the last third of the thumb's throw. Now: smoothstep alone.
* The angular band was 1.30 rad — you had to point three quarters of a right
  angle off the nose to ask for a full carve. Now 0.80.
* `turnAccel` 6.2 → 9.4, and the turn-rate ceiling with it: 0.82 rad/s at full
  speed was a thirteen-metre arc, which is a car's turn. 1.15 rad/s is about
  nine metres — a hard carve you commit to and can still hold a line through.

The board still builds its turn rather than snapping to it, still carries
through a carve, and still cannot pivot on the spot. Two tests bracket the new
feel: half a second of a hard demand is most of the way round; a thumb barely
off centre is still a correction.

## 4. The rider

Nobody rides a skateboard with straight legs. The rider was a stiff column:
hips at a fixed height, one straight quad per leg. Now:

* Hips sit lower and drop further under load — into a carve, through a pop, on
  a landing — so there is always bend in reserve and the stance reads *ready*.
* Legs have a **knee**: two segments meeting at a joint pushed out over the
  toes, further forward the deeper the crouch, which is the geometry of
  squatting.
* The torso leans across the board with the carve, the shoulders lead it, and
  the arms come out for balance — further out the harder the board is working,
  the leading one dropping into the turn.
* A pushing leg straightens as it reaches for the road; the planted one stays
  bent.

## 5. Slingshot: a side of the glass each

| | Before | Now |
| --- | --- | --- |
| Look | drag anywhere not on the sling | **left thumb**, a rate stick |
| Draw and fire | grab a rectangle bottom-left | **right thumb**, anywhere right of centre |
| Aim offset from the draw | up to 0.20 rad | none |

The input requirement, and how it is met: **roles are decided once, at
touch-down, by which side of the glass the finger landed on.** Nothing
afterwards reassigns them, a second finger on an occupied side is inert, and
the look is read from its own pointer's own anchor — so releasing the shooting
thumb cannot promote, re-target or jump the aimer. The old model could: looking
was a drag, so *any* pointer not on the sling fed it.

The pull no longer swings the shot either. It was true to a slingshot and wrong
for two thumbs: the hand charging the shot was quietly moving the aim the other
hand had set, and letting go moved it back.

Five tests hold the independence, including both directions of the release
case. The look stick is drawn where it is planted, same shape as the movement
stick.

## 6. Rocks, unlimited

Twelve steel bearings, a counter in a pocket flap, rocks to walk back and
collect, resupply caches — all of it a tax on experimenting with the one tool
the game hands you. A player counting their shots is thinking about a menu
instead of a town. It is gravel now. You are standing on more of it.

The projectile is drawn as a small irregular lump with a lit and a dark side,
and one is left lying wherever a shot lands, because the world remembers.

## 7. Heat

Firing is not suspicious, and never was in the code — evidence only ever came
from what a shot *hit*. Two things were still wrong:

* A **noise** — a bin knocked over three streets away — could put a name on the
  list. That is the decoy, the single best thing the slingshot does, and being
  hunted for it kills the mechanic. `PURSUABLE_EVIDENCE` now names the kinds
  worth sending a unit for: a lens, a junction, a drone, a person.
* **A sustained score** was a third way onto the list. But the score is not a
  record of anything you did — it rises from behaviour flags, prediction error
  and standing near other people's incidents. Pursuit driven by it is pursuit
  for existing. Removed; there are now exactly two ways onto the list, and both
  are things you can point at.

## 8. No trick names

A caption over the animation is the game explaining itself. If a kickflip does
not read as a kickflip, the fix is the kickflip.

## 9. Removed

The aiming view's duplicate bearing column, the pocket-flap HUD element and its
CSS, `collectBearings`, `player:collect`, and the ammunition fields on the
player. `ammoCache` props stay in the four authored worlds as scenery — a bike
shop is still a bike shop — but they no longer resupply anything.
