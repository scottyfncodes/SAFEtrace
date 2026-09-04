# 23 — Usability pass 02: JXM1, movement, and stationary aiming

**Driven by:** the second human playtest. Relay 12, Model C, and the Northgate →
Relay 12 evidence relationship are untouched.

---
## 1. JXM1

**What it was.** `JX-M1` — "MAPLE COURT JUNCTION" — a network node at (155, 258).
The player spawns at (158, 214), **forty-four metres away**. The inspect panel
opened on 14 m proximity, so within seconds of first moving a box appeared
reading `JX-M1 / MAPLE COURT JUNCTION / SEGMENT S-M1 · NOMINAL` with five verb
buttons under it: QUERY, TRACE, REROUTE, SUPPRESS, MASK.

Answering the audit questions honestly:

| | |
|---|---|
| Triggered by | walking within 14 m of any network node |
| Action required | none |
| Dismissible | **no** — clearing it re-acquired on the next frame |
| Prepared for | **no** — no beat had said node, segment, or QUERY |
| Visual language | five buttons, i.e. the language of action-required |

*If a blind player sees this for the first time, the most reasonable
interpretation they can form is "I don't know what this is."* It presented with
the urgency of an interface that wants something, and wanted nothing.

**Its role** is investigation — the back half of the game, where the network is
a place you read. It is not notification, not objective, not flavour.

**Fix, three parts.**

1. **It does not exist until VISION does.** `updateFocus` returns nothing while
   `visionUnlocked` is false. Until Devon is stopped, Bellhaven is a nice place
   with nothing to inspect, which is the opening move of the whole game. The
   story already introduces QUERY at CM-207; now nothing arrives before it.
2. **It says what category it is.** A line above the identifier:
   `SAFEtrace NETWORK · Segment relay`. Not an explanation of the fields — a
   foothold, so the answer is "I've found something on their network" rather
   than "I don't know what this is."
3. **It can be waved away.** A Close control, and a dismissal that survives
   proximity until the player moves off or asks for the node by name.

---
## 2. Movement

**Root cause.** The previous pass fixed *starting* and left the model wrong.
The stick was a **rudder**: horizontal offset steered a heading, vertical was a
throttle. To go somewhere the player had to model the character's current
heading, work out which way to rotate it, and hold. That is a command issued to
a pawn, not a hand on a character — which is exactly what "still not fun or
intuitive" describes.

**Design.** The thumb now names a **direction**. Push the stick where you want
to go and the character goes there; how far you push is how fast.

- `Intent.moveVector` — a screen-space direction with magnitude, alongside the
  keyboard's `steer`. One translation, `steerOf()`, used everywhere a rudder
  used to be read (rolling, on foot, bailing, and the flow meter).
- Momentum is untouched. The carve curve still decides how fast the board can
  answer, so at speed you still cannot spin on the spot. That is the part worth
  keeping and the part the reference actually has.
- `TUNE.pivotRate` — a floor on turn rate below 2.4 m/s, because a board at a
  standstill is turned by the rider stepping it round, and "navigate around
  objects without fighting the control" was the failing case.
- Resting a thumb still rolls.

**Everything else became a button.** Bottom-right: OLLIE, SLING, VISION. Drawn
where they are, glyphs rather than words, dimmed when unavailable. The upward
flick and the two-finger VISION hold are gone — there are no hidden gestures
left in the game.

No skating, tricks, rails, combos or scoring were added.

---
## 3. Stationary first-person aiming

Requested twice; built. `src/render/firstPerson.ts`.

**The flow, exactly as specified:** tap the sling → the board stops → the view
drops to the character's eyeline at their current position → drag to aim →
release to fire → the shot resolves → tap to return.

- A plain pinhole projection: yaw and pitch from the aim, eye height 1.62 m,
  per-polygon near-plane clipping, painter's order by depth. No z-buffer, and a
  suburb does not need one.
- Surfaces are projected flat, buildings as wall quads plus a roof with
  back-faces skipped, and everything that moves as a camera-facing card.
- It keeps the flat-colour vector language of the veneer rather than reaching
  for texture it does not have. It reads as SAFEtrace, not as a military FPS.
- **The character does not move an inch.** `aimAnchor` is captured on entry and
  the position is re-pinned after physics every tick, so no input can drift it.
  That is asserted in tests, not hoped for.
- Feedback: a reticle that closes as the band loads, a draw arc, the lock
  bracket on whatever the solver has actually acquired, bearings remaining, and
  one word — the target's id, `SHORT`, or `MISS` — after the shot.
- It cannot trap the player. Out of bearings releases the mode on its own; a tap
  leaves it; the HUD's competing layers are hidden while it is up.

---
## 4. SAFEtrace noise, and the opening

The score and the notification tiers were rebuilt in pass 01 and the round-two
findings predate that build. One thing was still wrong, and it is the §12 ask:
the opening was at full volume.

**The town now gets louder as it gets more interested in you.** Until VISION is
unlocked, `context` and `ambient` messages are dropped entirely — only what is
actually happening reaches the player. Nothing is rewritten and nothing is
softened; the same words arrive later, when there is a frame to hang them on.

---
## What did not change

Relay 12. `CM-207`, `04:41:07`, `JX-207`, `TX-2`, segment topology, the
`JX-R12` consequence, Model C, and inference over exposition. Verified by the
full relay regression plus `validateWorld` clean.
