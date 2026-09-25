# 37 — The feel pass

Thirteenth pass. The brief was not a feature: make the game that already
exists feel good to play. It was played before anything changed — on a
1280×760 desktop and on 390×664 and 320×568 phone viewports, driven through
real pointer and touch events — and every change below is traced to
something that happened in that play.

## What playing it found

| | Finding |
| --- | --- |
| **Broken** | On a desktop the aiming view could not be turned. Only the touch drag ever moved the sling's bearing; the mouse did nothing, so a shot went wherever the board happened to be facing. |
| **Broken** | The sling drew itself. Holding the aiming mode counted as holding the draw, so the pouch loaded to full on its own clock the moment it came up. On a mouse there was no pull at all — a click fired a shot that was already drawn — and on a phone the pouch sprang back to full draw the instant the thumb let go. |
| **Broken** | Holding `W` took one stride and then coasted to a stop with the key still down. |
| **Broken** | The plan could not be moved in. Pushing was suppressed while it was open, it was a hold on a phone (one thumb holding a map open, one left for everything else), and it opened at the skating zoom — three houses, drawn in blue. |
| **Broken** | A mouse shot taken while skating aimed through the flat plan camera, which has not been what is on screen since pass 24. |
| **Thin** | A stone ended the frame it touched anything. No bounce, no roll, no dust, one sound for everything that was not metal — a raycast wearing a rock costume. |
| **Thin** | There was no reason to open the plan until the story unlocked VISION, and no way to tell anybody why you would. |
| **Loud** | The Community Safety Score widget filled the top-left quarter of a phone from the first frame. |
| **Cramped** | Forty degrees vertical on an upright phone is twenty-four degrees across. Skating on a phone was looking down a corridor. |
| **Found in play** | Devon, following, stood exactly on the line from the chase camera to the rider and hid them. |

## Controls

**Three buttons, not four.** `GRAB` was a fourth circle whose job was a
variant of `TRICK`'s — pop, and do something with the board. Tapping `TRICK`
still flips; holding it for a fifth of a second grabs, and the button says
so in small type. The hold is counted in frames as well as event time,
because a thumb held perfectly still sends no events at all and the first
version of this never fired on a real phone.

**`PLAN` is a toggle on a phone**, and lights while it is on. On a keyboard
`Q` taps open and closed, and a long hold still peeks and closes on release,
so both habits work.

**Held `W` pushes**, at the board's own rhythm — the push cooldown still
spaces the strides — which is what a thumb on the stick always did.

**Looking round.** A drag on empty glass, or the right mouse button, turns
the camera round the rider. The stick is camera-relative, so a camera that
kept chasing the board while the player turned it would spin the two of them
round each other; instead the camera holds where it was put for a second and
a half and then settles back behind the board, more gently than it follows
a carve.

## The camera

Further back — 36 to 44 metres against 29 to 36 — and set by the screen, not
by one number: the focal length says how big a metre is on this glass, and
the rig backs off until the board is a readable size and no bigger. The lens
now has a floor of 48 degrees across, which an upright phone reaches and a
landscape screen never does, so the desktop picture keeps its forty degrees
vertical exactly. Upright phones tip the view down slightly, trading sky for
street.

Walls: the rig used to pull straight in toward the rider when a house slid
between them, which is the camera-on-a-rope feeling at its worst. It now
mostly rises — a crane shot over the roof line — and only closes in by what
rising cannot fix.

Devon now rides off the player's shoulder, the same five and a half metres
away, rather than straight behind, which is where the camera is.

## PLAN

"I use PLAN when I want to work out how to get somewhere." That is the
answer, and everything in it serves it:

- It pulls up to a map — about four pixels a metre, a district or two
  across — and rises into it from the street rather than cutting.
- It shows what a person gives directions by: the districts, the buildings
  with names (the library, the community centre, the café, the schools), the
  people you have actually spoken to, where they are now, and the things you
  have stopped and looked at.
- Tap (or click) the map to put a pin down; tap the pin to pick it up. The
  pin draws a line from you with a distance on it.
- Back in the street the pin is a thin column of light standing on the spot,
  visible over roofs from streets away, with its distance — or, when it is
  behind you, an arrow round the edge of the glass. Arriving puts it away.
- You can skate with it open. The stick is north-up on the map, because the
  map is north-up. You still cannot aim, fire, pop or reach into anything
  from it.
- Drag to look around the map, scroll to zoom; moving off drifts it back to
  you. With VISION it opens a little closer, because the subject and forecast
  labels were drawn to be read at street scale.
- Its instructions — what it is for and how to close it — sit at the top
  until a pin has been put down.

## The Community Safety Score

It is not on the screen. The widget is gone from the HUD entirely, and the
score is **found**, in one of two places a curious player ends up:

- **A camera's record.** Reading any camera now lists who it is holding and
  the number beside them: `HOLDING SUBJECT 4417 · COMMUNITY SAFETY SCORE 94
  · NOMINAL`, in the panel's warm colour. That line, the first time, is the
  "wait — people have been tracking this?" moment.
- **The plan, once VISION** has put every subject on it bracketed with a
  score — yours among them.

Either way a single `FOUND` note says so, once. After that it lives in three
quiet places: the top of the player's own notes, in their own words ("Higher
is better, apparently. Nobody asked me."), a line on the plan, and a small
chip under the buttons only when it moves from one band to another. The
underlying system is untouched; `Sim.scoreDiscovered` and where it was found
are saved with the afternoon.

## The slingshot

**Pull.** The band is drawn only while something draws it — a held mouse
button or a thumb on the right half — and the draw comes quickly at first
and harder toward the end, about 0.8 s to full. Let off without a shot and it
eases back. The prongs bow in toward the pouch under load, the cords straighten,
a creak of cord on wood rises in pitch with the draw, and the view narrows by
about ten per cent: attention, not a scope. Hold a full draw more than a
second and a half and the arms start to shake, and the shot knows it.

**Aim.** A dotted arc lies in the world along the real ballistic path at the
draw being held: faint while slack, confident when drawn. It reaches the
thing under the sight when the pull is enough and visibly falls short when it
is not, which is how the draw is learned without a number. It stops at
whatever the stone will meet first — a wall, a bin, a tree — and ends in a
ring on the ground or a mark on the thing. Nothing snaps and nothing is
highlighted; the arc is physics, not a lock. On a desktop the mouse turns the
sling (pointer-locked where allowed, with warp spikes discarded), and
`A` `D` `W` `S` swing and tilt it for anybody who would rather.

**Release.** In the same frame: the pouch snaps forward through the fork,
overshoots and rings back and forth a few times with the cords slapping, the
view kicks up a touch and settles, and the release is a slap of cord, a whip
of air and a thump in the hand, all brighter the further it was drawn. The
stone is not drawn while it is within two metres of the eye, so the first
frame is the snap rather than a grey blob across the sight, and the arc is
held back for half a second so the stone is the thing to watch.

**Flight and weight.** A stone in flight is drawn a little larger than life,
tumbling, with a shadow on the ground under it. When it lands it does not
stop: it skips on asphalt and concrete, dies in a lawn, glances off a wall
and drops at its foot, rolls out, and settles where it stops. A stone on a
roof stays there. The first touch is still the shot's result; everything
after is the stone finishing what it started.

**Impact.** By what it hit: a lens rings and throws sparks, a lawn thuds and
puffs, a road cracks and skitters grit, a wall sheds chips, a bin clatters.
Sounds fall off with distance. A near, solid hit is a small jolt in the
aiming view; nothing shakes the screen.

**Character.** The existing world, doing more:

- **Bins go over**, lid off, pointing the way they were hit. Cones are
  knocked flat. Signs swing on their posts; poles shiver.
- **Trees can be hit.** A stone into a crown shakes it, drops leaves, and —
  the first time, in any given tree — sends birds out of it. After that the
  tree is just a tree, so it is something you discover rather than farm.
- **The town turns toward a sound.** A stone clattering onto a road, a bin
  going over, a car alarm, birds leaving a tree: the pan-and-tilt cameras
  that can hear it swing round to look for a while, and people nearby glance
  over. A stone into a bin on the far side of a junction is a camera looking
  the other way while you go past — or, thrown carelessly, a camera turning
  to look at exactly where you are standing.
- Shot results name only things with names: a camera or a drone says its
  id; a bin or a tree says nothing, because what it did is right there.

On a phone, the first time the sling comes up, two quiet words say which
thumb does what — `DRAG TO AIM` on the left, `HOLD · PULL BACK · LET GO` on
the right with a line showing the pull — and never again after the first
stone. The `SLING` button stays lit where it was, as `PUT AWAY`: the same
control in and out, instead of a gesture nobody could find. A pull that
starts on it is still a pull, because that corner is where a right thumb
rests.

## The slingshot, rebuilt

After the pass above the slingshot felt good *inside* its mode, and the mode
was the problem: raising it stopped the board, swapped third person for a
first-person lens, split the glass between two thumbs, and needed a hint, an
exit button and pointer lock to be usable. Five passes of reports had all
been about that structure. So the structure changed.

**It is a gesture now, not a place.** `SLING` takes the sling out — the
rider holds it up, the button lights, and nothing else changes: you are in
the street, still skating. A pull back anywhere on the right of the glass is
a throw. With a mouse, a drag back from anywhere is the same gesture, and a
still hold is point-and-hold at whatever is under the cursor. `F` keeps the
first-person view as a steady aim, and "Classic slingshot" in the pause menu
brings the whole old scheme back on a phone.

**What a pull means.** Its direction on the glass is a bearing on the
ground; its length is how far along it, from a flick (three metres) to all
the way back (ninety), finer at the short end. Whatever stands at that spot
is what the throw is aimed at, at its own height — pull to the foot of a
camera's pole and the arc is solved to the lens four and a half metres up.
Only the range and height come from the thing; the bearing is exactly where
the pull put it, so a pull a metre to the left is a miss a metre to the
left. Nothing snaps. The arc and its landing ring show all of it before you
let go.

Two versions were thrown out by playing them:

- *Aim point a fixed multiple of the pull, on the glass.* On an upright
  phone the horizon is a couple of hundred pixels above the rider, so an
  ordinary pull aimed at the sky and lobbed.
- *Power tied to pull length.* The nearest things are the shortest pulls,
  and a bin sixteen metres away was a pull too weak to fire at all. A thrown
  shot now never leaves with less than half a draw: close things get a flat,
  quick stone, and pulling further reaches further.

**Release.** The shot uses the pull as it was 80 ms before the thumb came
off — a lifting thumb rolls and smears a few pixels, and that smear was
where "it went left when I let go" came from. Pulling back to where you
started puts it down without throwing; a tap is still a tap on the world.

**Feel.** While a pull is held the camera stops following the board (the
aim is on the glass, so a turning camera would slide the world under a still
thumb) and eases in a little as the draw tightens. The sling in the rider's
hands points where you are pulling and stretches with it; the band shows
under the thumb (or the cursor); release snaps the pouch through the fork
and rings; every stone in flight leaves a thin bright streak, because a
seven-centimetre stone forty metres away is otherwise a thing you hear. You
can throw on the move — the board settles under a draw, and sway still grows
with speed and shrinks with flow.

**Noise as a tool, readable and with a cost.** A camera turned toward a
sound now says so where the player is: its status light goes amber for as
long as it is looking at the noise (a lens that actually has the player is
lit, and only that lens — every camera used to light up whenever any one of
them could see you). On the plan its cone turns amber and visibly swings off
its sweep, and the noise itself ripples on the map. And it costs something
to lean on: three noises within twenty-five metres inside fifty seconds is a
pattern, and SAFEtrace sends a unit to stand exactly where it happened —
which is the place a player using noise as cover was about to go through. (Superseded by pass 38: the count rule became the disturbance ledger,
where the third noise in a place is noticed and the fifth is a pattern. See
[`38-stealth-manipulation-and-escalation.md`](38-stealth-manipulation-and-escalation.md).)
Cameras also draw out to 120 m from the eye again; since the rig moved back
they had been disappearing a house or two up the street.

A gamepad throws the same way: the right stick points it (how far it is
pushed is how far it goes), the right trigger draws and lets go.

**A bug the rebuild found.** A mouse throw on the move never fired, before
or after this pass: the frame the button came up said "not aiming", and the
simulation only fires a sling that is being held. The first-person mode
forced aiming on, which hid it.

## Playing the investigation

A second session played the back half through the UI — the stop, the
objective, the plan, CM-207, a conversation — and found three more things:

- **The objective names a street the map did not.** "SOURCE NODE: CM-207 —
  NORTHGATE" was written on the promise that the player knows what Northgate
  Lane looks like from the map, and the map named districts, not streets.
  Every road was already authored with its name; the builder threw it away.
  It is kept now, as data the simulation never reads, and the plan letters
  each street along its longest straight run, upright whichever way the
  street goes. Finding CM-207 is now reading a map rather than guessing, and
  there is still no marker on it. The map can also zoom out far enough to
  see the whole town at once.
- **On an upright phone the conversation card covered the conversation.**
  Framing centres the two people talking, and the card has to sit above the
  thumbs, which is the same place. While framing a conversation on a tall
  screen the camera now tips down so the speakers sit in the top half.
- **"Found it at the plan."** The notes now say "on the plan", or "in CM-207's
  record".

## UI

- The corner is two small buttons, `Notes` and pause, and nothing else.
- The pause menu's control lists were stale (a phone "right thumb tap" was
  listed as an ollie, which it has not been for passes) and now describe the
  game as it plays.
- The node panel hides while the plan is open, since the plan cannot act on
  it.
- The plan's instructions sit below the notification and toast row on both
  devices.

## What was deliberately left alone

The story, the case, the five endings, evidence, pursuit and dispatch, the
skating model's constants, the two-thumb split while aiming, and the art. The
only simulation changes outside the slingshot are: pushing is allowed while
the plan is open, the score's discovery flag, Devon's follow station moving
off the camera line, and cameras turning toward a sound.

## What was tested

466 tests (from 409). New: `tests/feel.test.ts` — the draw only builds while
pulled, eases in, eases off, fires with the held draw, and shakes when held
too long; bounce by surface, rolling out, wall ricochet, a stone that keeps
going after it first touches the road; cameras turning toward a sound and
back; birds once per tree; no prop ids in shot results; skating with the plan
open but not shooting from it; held `W`, `Q` tap and hold, mouse look with
warp rejection; the score not known at the start, found at a camera, found on
the VISION plan and not before, and found once; the lens floor and the
unchanged landscape lens; ground-under-pointer as the exact inverse of
projection; and Devon off the camera line. `tests/touch.test.ts` now asserts
three buttons and no `GRAB`, hold-to-grab (including a thumb that never
moves), tap-to-flip, `PLAN` as a toggle that leaves both thumbs free, map
dragging, and `SLING` as the way back out of aiming. `tests/throw.test.ts`
covers the drag-back sling: taking it out without a mode, the classic
scheme, the stick and buttons still working, a pull and its draw, the
80 ms release rewind, putting a pull down, taps still being taps, the plan
keeping its drags, the mouse's pull and point-and-hold, and the simulation
hitting a lens on its pole, reaching a close bin with a flick, and throwing
on the move without ever entering the aiming view.
