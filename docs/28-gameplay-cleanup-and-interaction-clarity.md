# 28 — Gameplay cleanup and interaction clarity

Eighth pass driven by human play. The complaints, in the words they arrived in:

> The cop is STILL immediately chasing the player. … Even when I successfully
> lose the cop, the cop eventually tracks me down anyway.
>
> The current slingshot interaction is too complicated.
>
> The eye button has suddenly reappeared.
>
> The CM009 screen suddenly appeared while I was simply skating down the middle
> of the street. That felt completely random and confusing.

One sentence connects all four: **the player should always understand why
something just happened.** Every change below is that sentence applied to a
specific thing that appeared, moved or chased without an explanation the player
could have read off the screen.

---

## 1. The pursuit is a state machine now

Pass 27 removed the scripted anomaly that was mobilising the police twenty
seconds into an ordinary afternoon, and probing confirmed that skating alone
issues no tasks. That fix was real and it held: a fresh session still shows
zero tasks over minutes of hard skating, with both units 85–400 m away on their
routine beats.

What it did not fix is that **there was no such thing as a pursuit**. Being
chased was an emergent property of two numbers read independently in four
places — `Track.wantedUntil` (the file is open) and `Track.confidence` (somebody
can see you) — so nothing in the codebase could answer "is anybody actually
after me right now". Two consequences:

- a pursuit could *begin* as a side effect of tasking, with nothing recording
  that it had begun or why;
- being lost only cancelled the current task. The file stayed open for the full
  two minutes whatever the player did, so the next lens to catch them restarted
  the whole thing for something they had already outrun. That is the
  "eventually tracks me down anyway".

`src/sim/surveillance/pursuit.ts` now owns it:

```
NOT_PURSUING → ALERT → PURSUING → LOST → SEARCHING → CLEAR → NOT_PURSUING
```

| State | What it means | Where units are sent |
| --- | --- | --- |
| `NOT_PURSUING` | Nobody is looking for this subject. The starting state. | nowhere |
| `ALERT` | There is a reason and a place to start from. Nothing has eyes on them. | last known location |
| `PURSUING` | Something can see them **right now**. | the forecast, live |
| `LOST` | The fix has just gone stale (6 s). | the last order, frozen |
| `SEARCHING` | Working outward from the last known location (25 s). | a deterministic ring around it |
| `CLEAR` | They got away. The reason is discarded on the way through. | nowhere |

The three rules that make it mean something:

1. **A session begins `NOT_PURSUING`,** and there is no path out of it that does
   not go through `Sim.reportOffence`. Skating is not a path. An architecture
   test asserts that `wantedUntil` has exactly two writers in the whole
   simulation: `reportOffence`, and the machine's own `CLEAR` state.

2. **Live coordinates exist in exactly one state.** A `TRACK` task is the only
   kind that carries a `trackId`, a `trackId` is the only way an asset can ask
   where the subject is *now*, and it is written only while `PURSUING` — which
   requires live contact. Every other order is an `INVESTIGATE` task pointed at
   a place, frozen at issue. A unit that cannot see you cannot follow you,
   because it was never told where you are. `Sim.liveTargetFor` is the single
   choke point and nothing else reads a track estimate for routing.

3. **`CLEAR` is real.** It wipes `wantedUntil` and the last known position, and
   the town goes back to merely watching until the player gives it a new reason.
   Verified end to end, in a browser, on a phone: shoot a camera in front of the
   camera → `PURSUING` with a live drone task → break contact → `LOST` →
   `SEARCHING` around Northgate while the player is 390 m away in the Channel →
   `CLEAR` → `NOT_PURSUING`, file shut, no tasks. Then skate back under the
   camera that started it: nothing happens.

One further leak closed: the dispatcher's lead time was computed from the
player's *true* speed. It reads the track's own estimated velocity now, so a
stale track produces a stale lead — which is what should happen to somebody
nobody can see.

Reacquisition still exists and is not magic. A drone searching the last known
location that flies over a player who never actually left will see them, and
the pursuit resumes. That is a drone looking where it was told to look.

The state is on screen in `F3`, and the transitions speak: `VISUAL CONTACT
LOST`, `UNITS SEARCHING — LAST KNOWN POSITION`, `SUBJECT NOT LOCATED — SEARCH
STOOD DOWN`. Each line corresponds to a state the dispatcher is actually in, so
the words are never a bluff.

---

## 2. The slingshot is two thumbs and nothing else

The previous scheme gave the screen a side each — left looks, right draws — and
made the left side a **rate stick**: an anchor planted where the thumb landed, a
dead zone, a squared response curve, and a radians-per-second ceiling. Four
invisible things to model before you can point at anything. The verdict was
"too complicated", and it was.

| | Left thumb | Right thumb |
| --- | --- | --- |
| Job | move the slingshot | pull back, charge, release |
| Reads | its own movement, in pixels | its own distance from where it grabbed |
| Cannot | fire | move the aim |

The left thumb is a **drag**: the sling goes exactly as far as the thumb goes,
linearly, at the same rate everywhere on the glass. There is no anchor, no dead
zone and no ceiling. Only the *change* is read, so lifting the thumb and putting
it down somewhere else costs nothing — which is the mechanical form of "no
aiming jump when changing fingers". Deltas accumulate as the pointer events
arrive, coalesced samples included, so a burst becomes one smooth sweep rather
than a jerk.

The slingshot is drawn as what the thumbs are doing: the fork is at the left
thumb, the pouch is at the right thumb, and the band stretches between the two
hands. Nothing on screen is a metaphor for the input; it is the input.

**Removed with it:**

- the corner brackets that appeared around whatever the ballistic solver had
  under the sight. Nothing was ever snapped or magnetised — the bearing has
  always been exactly where the thumb put it — but a box that appears around a
  drone reads as a lock, and a player who believes the game is locking on has
  stopped aiming. The reticle is one shape, one colour, in one place, and it
  says nothing about what is behind it;
- the dashed ring hinting where the sling could be picked up, from when the
  band lived in a particular rectangle. It is the whole right half now.

What the character still does is *range*: the reticle is cast into the world and
whatever it lands on sets the arc. That is not aiming for the player — the
bearing is theirs — it is a kid who has thrown a thousand of these knowing how
far away something is.

---

## 3. Rocks

One hard-coded seven-sided outline at one angle meant every stone in Bellhaven
was the same stone. Each rock now rolls its own shape from the simulation's
seeded generator at the moment it is thrown, and carries it: slightly different
size, slightly different proportion, its own rotation, its own dents. The bands
are narrow — 0.82–1.18 on size, 0.84–1.16 on squash — so every one of them still
plainly reads as gravel. These are rocks, not Pokémon.

The rock that lands is the rock that flew, and a replay throws the same stones.

---

## 4. The eye is gone

It was removed once and grew back, because "removed" meant a conditional that
stopped firing rather than code that stopped existing: the touch layer built its
button list conditionally, so unlocking VISION added a control on its own,
mid-session, in front of a player who was mid-push. A control materialising
during play is exactly what this pass exists to stop.

`vision` is no longer a button id, a touch role, a control-visual field or a
glyph branch anywhere in `src/core`, `src/render` or `src/ui`. There is nothing
left for a regression to switch back on, and an architecture test says so.

**The cost, stated plainly.** VISION as a held plan view is now keyboard-only
(`Q`). On a phone, unlocking it gives the other half — the network becomes
something you can reach into — and the story beat says that instead of naming a
control that is not there. Replacing the button with a hidden two-finger gesture
was considered and rejected: a control nobody can see is worse than one that is
simply absent. If touch players should keep the plan view, it needs a control
that is present from the first frame rather than one that appears when the story
says so.

---

## 5. Interaction ownership: CM-009

A node's panel opened because the player was *near* it. Maple Court has a camera
on it and the reach radius was fourteen metres, so skating down the middle of
the street silently opened a box headed `CM-009` over the road. The player had
done nothing, so there was nothing for them to connect it to.

Proximity now buys exactly one thing: a prompt. `Sim.interactCandidate` is the
node in reach; it is drawn in the world as a ring on the object itself, the
node's own id, and the word the player will press (`E`, or `TAP` on a phone),
with a short leader down to the thing so the label unambiguously belongs to it.
It is drawn only while something is actually in reach — the town does not wear
name tags.

Opening is an act: `E`, or a tap on the node. `E` again closes it, so the
control that opens the panel is the control that puts it away. `Sim.updateFocus`
no longer has a proximity branch at all, and a test stands next to a node for
thirty seconds asserting nothing opens.

---

## 6. The rest of the audit

Everything else that can take the screen, and why it is allowed to:

| Thing | Trigger | Verdict |
| --- | --- | --- |
| Accessibility prompt | boot | asked once, before anything |
| The advertisement | boot; and the reprise, at the end of the chain | the opening and the payoff; both authored, both skippable |
| Veneer crack | one authored beat | 1.8 s of scenery, no dispatch |
| Node panel | `E` / tap | **was** proximity — fixed above |
| Eye button | VISION unlock | **removed** |
| Sling zone ring | aim mode | **removed** |
| Cold-start pad ring | first touch, retires after two board lengths | the hardest moment in the game had nothing to aim at |
| Diagnostics | `F3` | keyboard only, off by default |
| Story dialogue and SAFEtrace notifications | beats and the simulation | the game's voice, not screens |

One piece of stale state was found and fixed: a drawn sling, an open node panel
or a running interference could survive into the advertisement and be waiting on
the other side — a screen the player did not open, on a frame they did not ask
for. Every mode transition goes through `Game.clearTransientState` now.

---

## Regression check

Run headlessly (269 tests) and by hand in a browser, desktop and emulated phone:

- fresh game, minutes of hard skating: `NOT_PURSUING` throughout, no tasks
  issued, patrols on their beats 85 m+ away;
- shoot a camera in front of it → `PURSUING`, live drone task;
- break contact → `LOST` → `SEARCHING` around the last known location, no task
  carrying a `trackId`, search points 390 m from the player and within 40 m of
  where they were last seen;
- keep away → `CLEAR` → `NOT_PURSUING`, `wantedUntil` cleared, last known
  position discarded;
- return to the camera that started it: nothing happens;
- left thumb drag of 120 px turns the sling 0.5333 rad, which is 120 ×
  0.0045 exactly; holding it still turns nothing over 700 ms; the right thumb
  arriving, drawing to full and firing moves the aim by 0.00000;
- release fires; seven rocks land with visibly different silhouettes;
- two buttons on the HUD, `sling` and `trick`, in every state the engine can be
  put into;
- stand next to a camera for five seconds: prompt shown, no panel. Press `E`:
  panel. Press `E` again: gone.
