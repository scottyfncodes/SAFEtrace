# 21 — Relay 12: P0 human playtest protocol

**Status:** instrument only. **No session has been run.**
**Built on:** `67a2abe`
**Blocker it exists to close:** P0 — HUMAN PLAYTEST REQUIRED

This document is the sheet an observer runs the session from. It is not
evidence, and nothing in it may be reported as a result.

---
## 0. What is being measured

Whether a real first-time player independently gets from

> `04:41:07` → `CM-207` → `JX-207` → `TX-2`

to

> segment topology → junction consequence → a different decision

without coaching. Their reasoning counts; their vocabulary does not.

---
## 1. Build under test

| | |
|---|---|
| Branch | `claude/safetrace-game-foundation-0aksik` |
| Commit | `67a2abe` |
| Hosted | GitHub Pages, deployed from that branch by `.github/workflows/pages.yml` |
| Local | `npm ci && npm run dev` → `http://localhost:5173` |

**Before the player sits down:** confirm the debug overlay is off. It is off by
default (`showDebug: false`) but it is a `localStorage` setting and `F3` toggles
it, so it can persist from a developer session. If a previous session left it
on, clear site data. **A player must not see the debug overlay.**

Do not open dev tools. Do not have the repository visible on screen.

---
## 2. Subject screening

Reject anyone who has: seen the source, read `docs/`, been told what Relay 12
is, been told to remember `CM-207`, been told about segments, or watched
someone else play. Reject anyone who has been in the room for a previous
session of this protocol.

Prior action-game experience is fine and does not need controlling for at n=1.

---
## 3. Session shape and the one real logistics problem

Realistic total: **35–60 minutes.** The critical path is player-paced.

| Phase | What gates it | Rough time |
|---|---|---|
| Opening ad, Maple Court, the Channel | player movement + `tick > 25 s` at the Channel entry | 5–15 min |
| The match, Devon stopped, VISION unlocked | +9 s, then +19 s, scripted | ~1 min |
| `INCIDENT INC-4100 / SOURCE NODE: CM-207` | +5 s after Devon is stopped | immediate |
| Travel to Northgate, read the six records | player-paced; the closing beat requires all six | 10–25 min |
| **Relay 12** | **nothing points there** | ??? |

**The problem, stated honestly:** Relay 12 has no draw. By design there is no
marker, no objective and no dialogue pointing east — that was the point of the
Northgate integration gate and the comprehension gate both. So a session can end
with the player never going east, and that produces **zero** data on the thing
this playtest exists to measure.

That is a session-design problem, not a comprehension failure, and it must not
be scored as one.

**Permitted fallback, in this exact wording, only after the Northgate chain is
complete and the player has stopped making progress for ~5 minutes:**

> "Keep playing as long as you like. There's more town than you've seen."

That is the entire permitted intervention. It names no direction, no district
and no object. If the player still does not go east, **stop the session and
record it as `NO RELAY 12 CONTACT`** — a valid and important outcome.

---
## 4. Observer rules

Say nothing except:
- the fallback line in §3, once, under its stated conditions;
- "I can't answer that during the session — keep going." (to any question);
- "Whatever you like." (to "what should I do now?").

Never: point at the screen, name a UI element, explain a term, confirm or deny a
guess, say "remember", "timestamp", "segment", "junction", "Northgate", or react
to a correct inference. **Do not react to a wrong one either** — a visible
flinch is coaching.

Ask for think-aloud once, at the start: *"Say whatever you're thinking, even if
it's nothing interesting. I won't answer."* Do not re-prompt more than twice,
and never at a decision point.

---
## 5. Capture

Screen + audio if possible. If not, the observer writes timestamps by hand.

Log, with clock times: every VISION activation and its duration; every node
inspected and every verb used; every pause over 5 seconds; every time the player
re-reads a panel; every movement toward or past TX-2; every junction shot,
including misses and wrong targets; every spontaneous utterance naming an
identifier.

**Verbatim quotes matter more than tallies.** Write down what they actually
said, not your summary of it.

---
## 6. Checkpoint sheet

Mark only **spontaneous** behaviour. Anything that follows a question to the
observer is void.

| # | Checkpoint | Y / N | Clock | Verbatim |
|---|---|---|---|---|
| 1a | Refers to `CM-207` unprompted | | | |
| 1b | Refers to `04:41:07` or "the time" unprompted | | | |
| 1c | Refers to `JX-207` unprompted | | | |
| 1d | Refers to `TX-2` unprompted | | | |
| 1e | Refers to Devon in connection with the machine | | | |
| 2 | On reaching TX-2 or its records, recognises something from Northgate ("wait, I've seen this") | | | |
| 3 | Behaves as though Northgate evidence and the Relay 12 network are one system | | | |
| 4a | Notices multiple cameras share a segment id | | | |
| 4b | Treats the segment as operationally meaningful, not decoration | | | |
| 5 | **Predicts the outcome before firing at a junction** | | | |
| 6 | Chooses `JX-R12` deliberately and can say why in their own words | | | |

Checkpoint 5 is the load-bearing one. `"That should take out those four"` is a
pass. `"Let's see what this does"` is not.

---
## 7. Scoring

| Layer | Passes when |
|---|---|
| **1 — Recognition** | Checkpoint 2 is Y |
| **2 — Understanding** | Checkpoint 5 is Y (prediction is the only proof of understanding that cannot be faked by luck) |
| **3 — Behaviour** | Checkpoint 6 is Y **and** the stated reason references what they read, not what they tried |

**PASS requires all three.** Any other combination is a FAIL with the layer
named.

`NO RELAY 12 CONTACT` (§3) is neither — it is an inconclusive session and needs
a re-run with a different subject.

---
## 8. Pre-registered predictions

Written before any session so the results can falsify them rather than confirm
them. **Do not show this section to the observer if the observer is not the
author.**

1. Recognition (Layer 1) arrives via **`04:41:07`, not `CM-207`** — the
   timestamp is welded to Devon and the ID is not.
2. The strongest single trigger is the **VISION edge fan** in the Relay 12 yard
   (seven lines into one box, one leaving), not any record text.
3. Segment comprehension arrives **after** a first junction shot, not before —
   i.e. Checkpoint 4b passes but Checkpoint 5 fails on the *first* junction and
   passes on a *second*. This would be a partial pass and should be recorded as
   such, not rounded up.
4. **`CM-207` / `CM-R07` is misread at least once.** Expect it at the moment the
   player compares the office camera against the delivery log.
5. A player who never fires the slingshot in Northgate finds an empty delivery
   log and gets a weaker version of Layer 1.

If a session contradicts these, the session is right.

---
## 9. Post-session debrief

Only after the checkpoint sheet is closed. Fixed order, do not improvise:

1. "Talk me through what you think that shed was."
2. "Was there anything you'd seen before?" *(if yes)* "What made you notice?"
3. "You shot [X]. What did you expect to happen?"
4. "Were there any two things you mixed up?"
5. "Anything you looked for and couldn't find?"

Then, and only then, explain what the session was measuring.

---
## 10. Classifying what comes out

Sort every finding into exactly one bucket before proposing anything:

1. **Comprehension failure** — the player could not get there from what the game
   shows. Actionable.
2. **Usability friction** — they got there, but the path was needlessly hard.
   Actionable only if it recurs.
3. **Visual clarity** — two things looked alike. Actionable if it changed a
   decision.
4. **Player preference** — they wanted something different. **Not actionable at
   n=1.**
5. **Observer interpretation** — you inferred it; they never said it. **Not
   evidence.**

One player's preference is not a design change. One player's *comprehension
failure* is worth taking seriously, because the design predicted it would not
happen.
