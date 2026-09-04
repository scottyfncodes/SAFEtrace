# 20 — Phase 8, Slice 02: Relay 12

**Built on:** `42cee4c`
**Decision carried in:** RELAY 12 — DESIGN GATE, *GO WITH NOTES*, **Model C: TX-2 as the shared file**
**Purpose:** give the uplink a consequence that is comprehension rather than capability.

---
## The question this district answers

Northgate proved content scales. Relay 12 had to answer something harder: the
player has spent the whole morning learning that they are watched, and `TX-2`
has been drawn on the machine layer since the first VISION hold — a bright box
off the east edge of the screen with a dashed line running to it from every
camera in Northgate. The hook shipped before the district did, and it pointed
at nothing.

Three consequence models were considered. Two were rejected:

- **Model A — TX-2 as a target.** Break it, and coverage drops. Rejected: it
  makes the whole game a resource the player can spend, converts the thesis
  ("the town is already watched, and it does not need more") into a tower to
  topple, and rewards the one verb the game has spent nine documents arguing
  against.
- **Model B — TX-2 as a capacity system.** Load it, and quality degrades.
  Rejected: it needs an uplink load subsystem, which is a new surveillance
  category, and it makes `uplinkId` a runtime input — collapsing the five
  failure modes the model keeps deliberately distinct.
- **Model C — TX-2 as the shared file. Adopted.** TX-2 is permanently
  non-degradable infrastructure. Its consequence is that it can be *read*, and
  what it says is: everything the player has done this morning went through
  here, in the same list, in the same shape, as the frame that got Devon
  stopped. The progression is that the player now knows what a district uplink
  is, and that knowing it changes nothing about what they can do to it.

## Scope, as delivered

| Target | Cap | Delivered |
|---|---|---|
| Buildings in Relay 12 | 22–26 | **24** (was 1) |
| New sensors | 6–8 | **8** (district total 8; the 2 stub cameras were re-authored) |
| Investigation chains | 1 | **1** — six records |
| Authored evasion routes | 1 | **1** |
| TX-2 relationships | 1 | **1** — membership, read-only |
| Dynamic-record generalizations | 1 | **1** |
| New mechanics | 0 | **0** |
| New abilities | 0 | **0** |
| New sensor kinds | 0 | **0** |
| New surveillance categories | 0 | **0** |

## The yard

A haulage compound, 74 × 132 m, fenced, with a windowless utility hall in the
middle of it. Nothing about the site announces what it is: the sign on the north
gate says **BELLHAVEN COUNCIL — HIGHWAYS DEPOT 12**, which is what it was built
as and, on paper, still is.

Gatehouse, compound office, canteen, six portacabins, transformer housing,
generator house, the hall, a cable drum store, the Venn Haulage depot, two
containers, a four-unit lock-up row, grit store, weighbridge hut and the pump
house that went in last, on the outfall. Plus the loading apron, the weighbridge
deck, a loading ledge and the apron kerb — the only smooth concrete on site, and
therefore the only two places worth skating.

That last point is not decoration. **The two surfaces worth skating are the two
surfaces a camera was specified for**, because they are the two surfaces where
money changes hands. That relationship holds everywhere in Bellhaven and it is
the reason the Channel is free.

## Sensor topology, and the control case

| Segment | Uplink | Nodes |
|---|---|---|
| `S-X1` — Relay 12 perimeter | **TX-2** | `CM-R01` west gate, `CM-R02` north gate, `CM-R08` east yard, `MT-R12` |
| `S-X3` — yard & haulage | **TX-2** | `CM-R03` hall door, `CM-R04` loading apron, `CM-R05` weighbridge, `CM-R06` lock-up row, `JX-R12` |
| `S-X2` — office / admin | **TX-1** | `CM-R07` compound office |

Seven cameras on TX-2. The eighth hangs on the same fence, twenty metres from
the hall, and goes to Bellhaven Central instead — because staff monitoring is a
separate purpose under Policy 6.1, with notification, an objection procedure and
thirty days of retention. The street cameras get ninety days, no notification,
and no procedure at all.

Nothing says this. The player finds it two ways, both of them structural:

1. **In VISION.** Seven dashed edges converge on the bright box at TX-2. One
   runs the other way, off the west edge of the screen.
2. **In the log.** `CM-R07` never appears in TX-2's delivery log — not even when
   it is the only camera that witnessed something. That absence is tested
   (`leaves the office camera out of the log even when it is the only witness`)
   and it is what makes the log credible rather than decorative.

The people who work at Relay 12 got the protections the street did not. That is
the district's argument, and it is made entirely out of topology.

## The chain

`JX-CH` → `TX-2` → `MT-R12` → `JX-R12` → `CM-R07` → `SVC-VISION`, and from there
into Northgate's existing chain as far as `SVC-RECORD`.

- **`JX-CH`** — the drainage relay in the Channel, which the player passes
  anyway. Flood telemetry, 2027, no cameras at install, one now. `PARENT
  UPLINK: TX-2`. This is the only pointer east and it is a field on a relay
  record, not a hint.
- **`TX-2`** — the delivery log. Derived; see below.
- **`MT-R12`** — the site maintenance terminal. Commissioned 2029 out of a
  carriageway resurfacing budget, for winter gritting telemetry, with one
  segment. `SEGMENTS PROVISIONED TODAY` is read out of the live network.
  Provisioning does not require council approval and no capacity review is
  scheduled, because none is required.
- **`JX-R12`** — the haulage segment relay. The depot's private CCTV, adopted in
  2031 under the partner scheme, at nil cost to the operator, on condition the
  feeds reach `SVC-VISION`. The operator retains nothing.
- **`CM-R07`** — the control case.
- **`SVC-VISION`** — the gallery, the threshold, and 98.7%.

Nobody in that chain decided to build a surveillance network. A highways budget
paid for a gritting relay; a haulier gave away its cameras for free parking; a
parents' council lowered a threshold to prevent two real harms. The district
holds the same argument Northgate holds, one layer further down.

## TX-2's records are derived, not written

The one generalization this slice needed. `NetworkNodeData.records` may now be
either `string[]` or `(ctx: RecordContext) => string[]`, where `RecordContext`
is four fields — tick, evidence, network, attributed identity — and no more.
`resolveRecords()` is the single read path; the HUD is its only consumer.

`uplinkRecords()` in `src/content/builder.ts` walks the same structure the town
is authored with: evidence → observing sensor → segment → uplink. A camera on
another uplink's segment cannot appear in the log even if it is bolted to the
same fence.

This is why it is derived rather than written. An authored list would be a
claim, and the player would be right not to believe it. A derived list is the
same fact the simulation is already using to decide who gets seen.

The archived line and the player's own frames go into one sorted list under one
heading, because that is what being in the file means:

```
--- FRAME DELIVERY, THIS SHIFT ---
04:38:01  CM-207  DELIVERED  ALIGNMENT FAULT — CM-207
04:38:02  CM-207  DELIVERED  JUNCTION JX-207 FAULT
04:41:07  CM-207  DELIVERED  FRAME SET 0441-07, REFERRED SVC-VISION
NO FRAMES HELD. NO FRAMES DROPPED. NO FRAMES READ HERE.
```

## TX-2 is not a switch, at the rule level

`verbsFor(kind)` in `src/sim/surveillance/network.ts` is now the single source
of truth for what a node kind accepts. An `UPLINK` accepts `QUERY` and `TRACE`
and nothing else, and the simulation enforces it in `canHack`, `startHack` *and*
`applyHack` — so reaching around the interface changes nothing. The HUD's
`availableVerbs` delegates to it rather than restating it.

`MASK` moved from uplinks to junctions in the same change. It was previously
reachable only on an uplink, so restricting uplinks would have deleted a
documented verb; splicing an identity belongs at a splice point anyway.

`uplinkId` remains structural data with zero runtime reads. There is no
uplink→segment propagation, no load model, no capacity subsystem, and the five
failure modes are untouched.

## The two ways in

**Watched:** East Avenue South to the west gate. `CM-R01` covers both the gate
and the approach to it, which is what a gate camera is for.

**Not watched:** the Channel's east apron at (470, 452), then the maintenance
track north along the buried outfall, through the six-metre fence gap at the
south-east corner, and up the east lane behind the depot. The track is paved and
obvious on the ground and is deliberately **not** on the road graph, so PREDICT
has nothing to forecast along it. Nothing inside the compound is on the road
graph at all.

The gap exists because the pump house and the fence were sited by two people in
two different years and neither of them was siting a gate. `CM-R05` looks north
up the weighbridge deck, which is what Trading Standards specified in 2028.
`CM-R08` looks west at the container stack, which is where the value is — so the
route passes within a metre of a live camera that is facing the other way.

Cameras do not cover that route. **Drones do.** Drone route 3 now runs the
eastern corridor from the Channel up to the Relay 12 approach, which is what
makes the anomaly mechanic bite: knock something over in the Channel and the
nearest drone commits to it, so the approach is answered by a farther one. This
is the existing finite-asset-pool behaviour with somewhere new to matter; no
dispatch code changed.

## The segment record, corrected

`JX-207`'s first record is the only line in the game that says what a segment
is, and it is a required read. It said `SEGMENT S-N2 — 14 NODES` while `S-N2`
held **18** — Northgate grew after the record was written. In a game whose
argument is that SAFEtrace's own paperwork is accurate, that is the one place a
wrong number cannot sit.

It is now derived from the live network, the way `MT-R12` and `TX-2` already
were, and it carries the rule the player needs before they can aim at a segment
rather than at a camera:

```
SEGMENT S-N2 — 18 NODES, ALL CARRIED BY THIS RELAY
NO RETRANSMISSION, NO LOSS, NO DEGRADATION
SELF-HEAL: 90S
```

Three lines, no target named, and the 90 s matches the real degrade window
exactly. What the player does with it is theirs.

## Guardrail earned this slice

`validateWorld` now errors on a non-sensor network node authored more than 0.9 m
inside a building. **TX-2 shipped exactly that way**: authored at (514, 206), in
the middle of the relay hut, where it drew correctly, validated clean, and was
selectable from a single point on the hut's boundary. Dead content that passes
every check is the worst kind. Cameras are exempt because a camera is supposed
to be on a facade, and the existing inset check already covers those.

`tests/guardrails.test.ts` breaks the shipped town in that exact way and asserts
the validator catches it, and asserts it does *not* fire on `MT-R12`, which
legitimately hangs on the hall's east wall.

## Human-style audit: infrastructure, or a quest?

The question the brief asked to be answered honestly.

**Infrastructure, on the evidence:**

- No beat, message, marker, arrow or line of dialogue mentions Relay 12 or TX-2.
  `grep` across `story.ts`, `copy.ts`, `src/ui` and `src/render` returns nothing.
- Reading TX-2 unlocks nothing, opens nothing and rewards nothing. The player
  leaves with the same abilities they arrived with. What changes is what they
  know.
- The district has no completion state and no acknowledgement of one.
- The only pointer east is a `PARENT UPLINK` field on a drainage relay the
  player walks past anyway, plus seven dashed lines that were already on screen
  before this district existed.
- Nothing in the yard is staged for the player. The buildings are what a haulage
  compound has; the cameras are aimed at what a haulage compound cares about.

**Where it is closest to feeling like a quest:** the six records form a tidy
chain with an edge from each step to the next, which is the same shape Northgate
used. It reads as a chain because it *is* one — each node genuinely knows about
the next (a site register knows its segment relay; a relay knows what was
adopted onto it) — but a player who has done Northgate will recognise the shape
and may read it as a checklist rather than as a building.

No revision was made for this. The alternative is to scatter the records so the
player cannot follow them, which would be worse content in service of a better
adjective.

**The real risk, and it is a playtest question, not a design one:** the control
case only lands if the player thinks to compare `CM-R07` against the others.
Nothing forces the comparison and nothing should. Some players will walk out of
Relay 12 having read six records and understood five of them.

## Gate results

| | |
|---|---|
| Tests | **183** passing, 10 files (was 146) |
| New tests | 37 — 34 in `tests/relay12.test.ts`, 2 guardrail, 1 delivery-log ordering |
| Typecheck | clean |
| Production build | clean, 167 kB JS (56 kB gzipped) |
| `validateWorld` | zero errors, zero warnings on the shipped town |
| Determinism | unchanged; seeded replay still hashes identically |
| Architecture | `src/sim` still free of DOM, presentation imports, `Math.random` and `Date.now` |
| District totals | northgate 26, commons 14, maple 26, ridgeline 6, channel 58, **relay 24** |
| Other districts | unchanged from the Northgate gate |

**P0 — HUMAN PLAYTEST REQUIRED. Still unresolved.** Nothing in this slice bears
on it, and the audit above adds a second question for the same session: whether
a player who reaches Relay 12 without being told to go there understands what
they are looking at.

## Known limitations

- `CM-207` and `CM-R07` differ by one character in one position, and `CM-R07` is
  the control case the player must tell apart from the TX-2 set. Flagged by the
  comprehension gate; not corrected in this slice.
- TX-2's cabinet has no geometry in the veneer. It exists in VISION and in the
  inspect panel within 14 m, and the authored evasion route passes 37 m away —
  `MT-R12`'s edges line is the bridge back to it.
- The delivery log's live entries come from evidence, so a player who never
  fires the slingshot sees only the archived line. Recognition does not depend
  on live entries; the personal register does. Left as a playtest question.
- No interiors. The hall cannot be entered, which is correct — there is nothing
  in it — but the depot and the office cannot either.
- The compound has no NPC schedule beyond a single shift-crew route across the
  apron.
- `MT-R12` is unwatched where it hangs, on the yard's east side. That is the
  same design as the evasion route rather than an oversight, but it means the
  maintenance terminal is the cheapest record in the chain to read.
