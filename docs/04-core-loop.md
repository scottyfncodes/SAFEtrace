# 04 — Core Gameplay Loop

## 1. The loop

```
EXPLORE -> OBSERVE -> DISCOVER -> MANIPULATE -> EVADE -> INVESTIGATE -> UNDERSTAND -> PUSH BACK
              ^                                                                  |
              +------------------------------------------------------------------+
```

That chain is only meaningful if each arrow is a *mechanical* consequence rather
than a narrative one. They are:

| Verb | Mechanic | What it produces |
|---|---|---|
| EXPLORE | Skating | Route knowledge, physical access |
| OBSERVE | Looking, then SAFEtrace VISION | Coverage knowledge |
| DISCOVER | Proximity + QUERY on nodes | Network topology, records |
| MANIPULATE | Slingshot + hacks | Local, temporary change to the network |
| EVADE | Skating against prediction | Track decay, dispatch failure |
| INVESTIGATE | QUERY on incidents, subjects, decisions | Story, and system literacy |
| UNDERSTAND | Player-side, not a system | Better play |
| PUSH BACK | Combining all of the above on an objective | Progress |

**UNDERSTAND is deliberately not a mechanic.** It happens in the player's head.
The game's job is to make the system legible enough that it can.

## 2. The moment-to-moment loop (seconds)

Skate a line. A camera sweeps toward you. You either take the seam, ollie the
gap into the alley, or put a ball bearing into the housing and keep rolling.
Your phone buzzes with something calm. You keep moving.

Design requirement: **the fastest route and the safest route must rarely be the
same route.** This single constraint generates all of the minute-to-minute
decision-making in the game.

## 3. The medium loop (minutes)

1. Get an objective: reach a place, read a record, follow a track.
2. Read the coverage between here and there (VISION, or memory).
3. Pick a line. Commit.
4. The system reacts: risk rises, assets are tasked toward your *predicted*
   position.
5. Break the prediction, or pay for not breaking it.
6. Arrive, do the thing, learn something about how the machine decided.
7. Cool down: risk decays if you behave, which means the reward for a clean
   escape is a quiet next few minutes.

## 4. The long loop (hours)

Comprehension is the progression system. There is no XP and no skill tree. What
the player accumulates is:

- **Literacy** — knowing that a `TX-` prefixed node is an uplink, that a swept
  camera has a 4-second seam, that INVESTIGATE-state drones orbit for 12 s.
- **Access** — a small number of unlocked network verbs, gated by story.
- **Route vocabulary** — the actual thing that makes an expert player fast.

The game gets easier because the player gets better, not because numbers grew.

## 5. Tension curve

Risk score is the tension dial and it is visible. It rises fast under
observation and evidence, and decays slowly under normality. This produces a
natural rhythm of pressure and release without a scripted alert meter, and it
means the player can *choose* to spend risk: a loud, high-evidence route
followed by a long quiet cool-down is a legitimate strategy.

## 6. Anti-goals

- No collectibles that are not records (every pickup is information).
- No crafting.
- No currencies. Ammunition is a small physical count, not an economy.
- No combat. The slingshot cannot meaningfully hurt a person and the game never
  asks it to.
- No minigames that pause the world. Every interaction happens in-world, in
  real time, while a drone is possibly on its way.
