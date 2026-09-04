# 22 — Usability pass 01: movement, aiming, score, notifications

**Built on:** `2bae1e1`
**Driven by:** the first human playtest. Four findings, all first-contact.

Relay 12's comprehension mechanic, Model C, the Northgate → Relay 12 evidence
relationship and the segment consequence are untouched. Nothing here explains
anything to the player that they were previously expected to work out.

---
## 1. Movement — could not work out how to start

**Root cause, in the code.** Two things, and the second is the real one.

The steering anchor was dropped exactly under the thumb that made it, and a
push required holding *forward of the anchor* by 12 px. So placing a thumb and
holding it — the first thing anybody does — produced a throttle of precisely
zero. The player had to hold ahead of an invisible point they had themselves
just created, and nothing on screen said so.

Compounding it, `ControlsRenderer` was documented as "deliberately almost
invisible… there is no permanent joystick sitting on Bellhaven". The pad only
existed where a thumb already was. On a cold start there was nothing to aim a
first touch at.

**Fix.** `TOUCH_TUNING.throttleBias = 20`: the anchor is dropped 20 px *behind*
the landing point, so a resting thumb is already forward of neutral and rolls.
Braking still works and now costs a deliberate 32 px pull. The bias is
re-applied after an ollie re-anchors, or landing a trick would silently stop
the board.

Plus one affordance, and only one: a breathing ring at the natural left-thumb
position, drawn until the player has travelled 12 m under their own power, then
gone for good. No arrow, no label, no legend.

The prompt strip's first line changed from `forward to push` to `hold to roll`,
because the old line described the old control.

**Verified on an iPhone 13 viewport (390 × 664 CSS px):** a thumb placed and
held perfectly still for three seconds carries the player a full block. Score
95 → 100 and the `LOITERING` flag clears while moving, which is the intended
mental model arriving on its own.

---
## 2. Slingshot — partly understood, could not hit a drone

**Root cause, and it is a real bug.** The character solved the *elevation* of
the arc for whatever the ballistic solver had locked onto, and left the
*bearing* wherever the player's thumb happened to point. The acquisition cone
was therefore wider than the shot was accurate: past about six degrees off, the
solver picked the drone, solved the arc to its altitude, and the bearing sailed
past it.

Worse, none of this was visible. The solver had always been silently choosing a
target; the player had a band under their thumb, a dotted arc, and no way to
know what the game had already decided they were pointing at.

Measured before the fix, mobile path, drone parked at altitude:

| drag error | lock shown | result |
|---|---|---|
| 0–6° | drone | hit |
| **9–15°** | **drone** | **miss** |
| 20°+ | none | miss |

A lock that appears and then misses is worse than no lock at all.

**Fix, three parts.**

1. **Bearing as well as elevation.** When a target is acquired, the aim angle
   snaps onto it. Sway still decides whether the shot lands, so this buys a
   fair shot rather than a free one — and it is what "someone who has done this
   a thousand times" was always supposed to mean.
2. **Show the lock.** A four-corner bracket on the acquired target, drawn with
   a dark backing stroke because the veneer is a bright sunny suburb and a thin
   light line vanishes on a phone held outdoors.
3. **Drone hitbox 0.9 m → 1.3 m.** The drone is drawn as a 1.4 × 1.0 m body
   with rotors reaching 1.27 m from centre. The hitbox was smaller than the
   picture, so a bearing could pass visibly through a rotor and count as a
   miss.

Acquisition tolerance also widened from `along × 0.11` to `along × 0.14`. A
thumb sets the angle *and* the draw with one gesture, so the two fight each
other; the cone is generous on purpose, and the bracket is what makes it honest
rather than mysterious.

**Result:** if the bracket is on it, you hit it — 0° through 16°, 8–38 m, at
every altitude a drone actually flies at, on a half-drawn shot. Past 20° no
bracket appears, and now the player can see that.

---
## 3. The first-person aiming proposal

**Recommendation: adopt the separation, not the camera.** See §4 of the report.

The insight in the proposal is right — the player was being asked to steer,
push and aim with two thumbs at once. That is now separated: `TUNE.aimSettleDecel`
coasts the board to a stop over about a second while the pouch is drawn, so
drawing *is* stopping. It costs one constant and no new mode, no menu, no
camera state, and it does not take the board away — let go and you roll.

A genuine first-person view would mean a second renderer. Bellhaven is oblique
top-down vector geometry with `ROOF_K` extrusion and a fixed sun; there is no
perspective projection, no wall detail, and the peel — the whole art direction —
is a 2D compositing effect. Building a perspective view is not a control fix,
it is a second game, and it would break the one thing this project has been
protecting since the first document.

---
## 4. The safety score

**Root cause.** "Community Safety Score" reads as a statistic about the
neighbourhood, not a verdict about you — which is a usability failure and,
accidentally, lets the brand off the hook. The number also had no direction cue
and was recomputed every tick, so it twitched.

**Fix.** One possessive: **"Your Community Safety Score"**. The state word
(`NOMINAL` / `ELEVATED` / `HIGH` / `CRITICAL` / `INTERVENTION`) now sits under
the meter in the band colour, so the player learns which way is bad without
being shown any arithmetic — and the duplicate `STATUS` row below it is gone.
The displayed value eases toward the real one instead of flickering.

No formula is exposed. The intended takeaway is only: *SAFEtrace is evaluating
me, and what I do changes how it evaluates me.*

---
## 5. Notifications

**Root cause.** There were two axes — `register` (brand voice) and `emphasis`
(typography) — and no axis for **attention**. A weather advert and an authorised
intervention arrived as the same card in the same stack of up to five, separated
by a 3 px border colour. If everything behaves like an emergency, nothing is one.

**Fix.** A `priority` on the message itself, defaulted so that thirty-odd call
sites did not each have to decide:

| Tier | Means | Budget | Treatment |
|---|---|---|---|
| `critical` | something is happening to you, now | 2 | 5 px risk border, prepended to the top, +1.2 s |
| `important` | look up, don't stop | 2 | 4 px warn border |
| `context` | useful, can wait | 2 | plain |
| `ambient` | the town talking to itself | 1 | narrower, dimmer, capped at 3 s |

Behaviour, not just paint: a critical message **clears ambient chatter beneath
it** and drops queued ambient; a full critical or important tier retires its
oldest rather than queueing behind it, because stale surveillance is worse than
none; and the same lines twice in a row are shown once.

Explicitly promoted: patrol dispatch and intervention → `critical`; drone
dispatch, escalation change, subject monitoring, MASK, and **`SEGMENT … DEGRADED`**
→ `important`. That last one is the moment the player learns what a segment is,
and it was previously competing with an advert.

**Nothing was deleted.** SAFEtrace says exactly as much as it did before. It is
now rankable at a glance, which is the difference between *"the system is
watching everything I do"* and *"I don't know what any of this means"*.

---
## What remains intentionally overwhelming

- SAFEtrace still talks constantly, and still talks about you.
- The score still moves while you do nothing, because the town is still looking.
- `CARE` still sells you things during an escalation. That juxtaposition is the
  joke and it stays.
- VISION still costs you the ability to act, with no warning beyond the frame.
- The delivery log at TX-2 still lists your own frames without comment.
