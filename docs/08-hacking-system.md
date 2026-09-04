# 08 — Hacking System

## 1. Position

Hacking is **not** a set of minigames. There is no pipe puzzle, no cascading
tile grid, no rhythm bar. The network is a *place* that overlaps the town, and
hacking is navigating it.

The phone is not a hacking device. It is a phone. Every resident of Bellhaven
has the SAFEtrace app; it shows your own safety score, your family's location,
and neighbourhood alerts. The player's version has been modified by Mara to
show a little more than it should. That framing keeps the protagonist a kid with
a phone rather than a cyberpunk operator.

## 2. The graph

```
NetworkNode { id, kind, position, segmentId, state, integrity, edges[] }
kinds: CAMERA | JUNCTION | UPLINK | PLATE_READER | SIGN | SPEAKER | DOOR | SERVICE
Segment    { id, uplinkId, nodes[], health }
```

Node IDs are consistent and readable: `CM-` camera, `JX-` junction, `TX-`
uplink, `PR-` plate reader. Learning the prefixes is real literacy that pays off.

Edges are meaningful: a camera's edges go to its junction, its segment's uplink,
and to the *services* it feeds (`SVC-VISION`, `SVC-PREDICT`). Following those
edges is how the player learns that the porch camera on Maple Court and the
school gate camera are the same system.

## 3. Verbs

Available on a node when the player is within range and holding still enough.
Each takes real time, during which the player is stationary and exposed.

| Verb | Effect | Time | Detection |
|---|---|---|---|
| `QUERY` | Reveal a node's properties, edges, recent records | 0.8 s | none |
| `LOOP` | Node reports its last normal state; player is invisible to it | 2.4 s | integrity check after 45–90 s, retroactive evidence |
| `SUPPRESS` | Reduce a track's confidence by 40% | 3.0 s | evidence if observed |
| `REROUTE` | Flag a chosen location as anomalous; assets investigate | 2.0 s | none if the flag is plausible; high if absurd |
| `MASK` | Drop your own identity attribution to `UNKNOWN` for 30 s | 4.0 s | high |
| `TRACE` | Follow an edge to reveal the node at the other end | 1.2 s | none |

`QUERY` and `TRACE` are free and always available. **The investigative verbs are
the cheap ones.** That is the correct incentive structure for this game: looking
costs nothing, interfering costs something.

## 4. Access, not currency

There is no hacking resource bar. The costs are:

- **Time standing still**, in a town full of cameras.
- **Proximity**, which requires actually getting there.
- **Evidence**, which is durable.

That is sufficient tension and it requires no invented economy.

## 5. Story delivered through QUERY

The false-positive investigation is played entirely through the graph:

1. `QUERY` the incident record → source node `CM-207`, Northgate.
2. `TRACE` from the incident to `CM-207` → it is on segment `S-N2`, uplink `TX-2`.
3. `QUERY CM-207` → its feed is fine. Nothing is broken. That is the horror.
4. `TRACE` to `SVC-VISION` → the match ran against a gallery that includes every
   student at Ridgeline, because SAFEtrace SCHOOL enrolled them.
5. `QUERY SVC-PREDICT` on Devon → prior association: Devon's cousin lives in
   Northgate. Devon has been there many times. The prior was reasonable. The
   prior was decisive.
6. `QUERY` Devon's subject record → the 98.7% is still there. Nothing removed
   it. There is no button that removes it.

No villain explains anything. The player reads six database records and
assembles the argument themselves. This is the tone the whole game wants.

## 6. What hacking cannot do

It cannot delete records, cannot destroy the network, cannot "shut it all down".
The player never gets a switch. Attempts to overreach fail informatively:

```
REQUEST DECLINED — RECORD IMMUTABLE
RETENTION POLICY: INDEFINITE
```

The system's refusal is polite, and that is the most frightening line in the
game.
