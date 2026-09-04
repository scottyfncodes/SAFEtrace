# 01 — Game Design Document

## 1. Premise

Bellhaven is a comfortable American suburb. It is also, from the first frame,
completely instrumented. Cameras on porches, plate readers at intersections,
drones on scheduled patrol, behavioural analysis running continuously on every
resident. Nobody is hiding this. It is advertised. It is a *feature*.

The player is a sixteen-year-old skater. They are not a hacker, not a soldier,
not a chosen one. They are a kid who is very good at moving through a town.

## 2. The progression that actually matters

The game does **not** escalate by adding surveillance. The surveillance is
maximal at minute zero. What escalates is *comprehension*:

| Stage | Player state | What changed |
|---|---|---|
| 0 | "This town is nice." | Nothing. The world is presented as advertised. |
| 1 | "There are a lot of cameras here." | The player starts noticing hardware they already walked past. |
| 2 | "It is watching everything." | The player learns coverage, sweep, and blind spots. |
| 3 | "It thinks it knows people." | The false-positive beat. Confidence is not correctness. |
| 4 | "It thinks it knows *me*." | The player sees their own predicted path drawn ahead of them. |
| 5 | "The town has been a machine the whole time." | Machine vision resolves fully. Nothing was added. It was always there. |

This is the entire game. Systems exist to serve this table.

## 3. The thesis moment (Act I hook)

The player is on the far south side of Bellhaven, in the drainage channel, with
their best friend **Devon Araya**. A burglary is reported in Northgate, four
kilometres north.

Ninety seconds later, both phones buzz:

```
FACIAL MATCH CONFIRMED
98.7% CONFIDENCE
SUBJECT: ARAYA, DEVON M.
```

Devon is standing right there. The match is impossible. The system is not
lying, is not corrupt, and has no villainous motive. It is simply *confident and
wrong*, and confidence is what the town has agreed to act on.

A drone arrives before Devon can finish reading the notification.

## 4. The antagonist is not a person

SAFEtrace has no CEO the player fights. Its most disturbing property is that
almost everything it does is defensible in isolation:

- It observes. That is what the residents asked for.
- It correlates. That is what makes it useful.
- It predicts. That is what makes it *popular*.
- It scores. That is how it allocates finite attention.
- It intervenes. That is the product's entire promise.

The horror is structural, not moral. There is a human face in the story — a
regional operations lead named **Priya Venn**, who is decent, overworked, and
genuinely believes she is reducing harm — but she is a symptom, not a boss.

## 5. Central contradiction

> SAFEtrace: "Nothing should go unseen."
>
> The player: "Then I'll be something you can't predict."

The player is never trying to destroy the network. It is too large, too
municipal, too *loved*. The player is trying to remain **unclassifiable**. Every
system in the game measures, rewards, or punishes classification.

## 6. Cast

- **The player** — unnamed by choice; the system calls them `SUBJECT 4417`.
- **Devon Araya** — best friend, funnier and more trusting than the player. The
  false positive happens to *them*, which is why it lands.
- **Mara Okonjo** — runs the bike-and-board shop in Bellhaven Commons. Knows
  where the wiring goes because she watched it get installed.
- **Priya Venn** — SAFEtrace regional operations. Not a villain. The most
  frightening character in the game because she is reasonable.
- **SAFEtrace** — always calm, always helpful, never angry.

## 7. Structure

**Act I — Infrastructure.** Bellhaven is lovely. Skate it. Learn the town by
line and by shortcut. Surveillance is background texture. Ends with the false
positive.

**Act II — Comprehension.** SAFEtrace VISION unlocks. Cameras acquire cones,
houses acquire node IDs, people acquire brackets. The player investigates the
match: which camera, which feed, which decision. They learn the pipeline by
using it. Ends with the player understanding that Devon's score never went back
down.

**Act III — Prediction.** The player is now scored. Their route is forecast
ahead of them, drawn on the road, and patrols are dispatched to where they *will
be*. Play becomes an argument with a model. Ends with the advertisement replayed
frame-for-frame, unchanged, and now unbearable.

## 8. Player fantasy

Drawing a line through a town that is trying to draw one through you.

## 9. Failure

There are no deaths. Failure is **INTERVENTION**: a stop, an ID check, a
contact record appended to your file, your risk floor raised. It costs you
future freedom, not a life. Getting caught makes the next hour harder, which is
exactly the right punishment for this game.

## 10. What this game is not

- Not stealth-with-cones-as-fail-states. Being seen is normal; being *scored* is
  the problem.
- Not a combat game. There is no combat.
- Not a hacking puzzle game. The network is a place, not a minigame.
- Not open-world sprawl. Bellhaven is dense and hand-made.
