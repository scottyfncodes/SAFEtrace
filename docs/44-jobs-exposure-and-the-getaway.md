# 44 — Jobs, exposure and the getaway

The reshape's loop:

```
GET A JOB → FIND A ROUTE → SKATE IT → MANAGE SURVEILLANCE → IMPROVISE → COMPLETE/ESCAPE → SCORE → TRY A BETTER ROUTE
```

## Two ways in

The title screen offers **Jobs** first (Enter) and **the afternoon** (the story)
second. Jobs are the same town with the story left out: no advertisement, no
conversations, the plan shows every camera (finding a route is the job), and
the job board comes up before anything else. The afternoon is untouched.

## The board

Nine jobs covering all eight kinds the runner knows: COURIER, TAG, SABOTAGE,
GHOST, SPEEDRUN, PHOTOGRAPH, EXTRACTION, GETAWAY, plus a final courier to the
gym roof. Three are open at the start, and each one finished opens the next.
A brief is one sentence plus four facts: start, destination, threat, time.

Jobs are data (`content/jobs.ts`). A job is a start and a list of stages. A
stage is a verb and some points, where reaching any one or all of them finishes
it. A point can demand height (a roof: a sling-line job), name a camera (a
stone in it, or riding past its pole cuts its line), or the stage can require
the signal to be lost. One runner (`sim/jobs/run.ts`) plays all of them. A test
checks every point against the town as built: street points are on the street,
and roof points are on flat roofs that have a mast.

## Exposure, not health

`sim/jobs/exposure.ts`: one 0–100 reading of how hard the town is looking.

| | |
|---|---|
| **UNSEEN** | Nothing has you. The HUD is three quiet lines. |
| **SPOTTED** | Something had a look. Out of its picture, it fades. |
| **TRACKED** (40) | The nearest drone is sent to your last sighting. |
| **UNDERWATCH** (80) | A second drone; everything that can follow you does, live. |

Being seen raises the reading: faster for a better picture, faster again once
tracked. Out of sight, TRACKED and above **hold** for 3 s (4.5 s at UNDERWATCH),
because the town is still looking where it lost you. Then the signal drops all
at once: **SIGNAL LOST**. The drones search the last fix for six seconds and go
back to their rounds.

**Nothing about being seen ends a job.** It starts a chase. Breaking line of
sight is a movement problem: around a corner, under a canopy or a deck (drones
cannot see through cover), up onto a roof (cameras cannot see above their own
mounts), or out-cornering a drone that turns wide. A stone still knocks a drone
out of the sky.

## Score

Four numbers, each a different way to be good (`sim/jobs/score.ts`):

- **STYLE**: tricks, grabs, launches (more for charge), roof landings and air
  time. Every move within three seconds of the last raises the multiplier (up
  to ×8). The chain banks once things go quiet on the ground. A bail loses
  whatever was not banked.
- **TIME** against the job's target.
- **EXPOSURE**: the share of the run something had you in its picture.
- **FLOW**: the share of the run spent moving.

These combine into one total and a grade (S/A/B/C). A loud, fast, stylish run
and a slow, unseen one can both grade well. GHOST jobs weight exposure. Bests
are kept per job and per axis (`core/save.ts`), so the result card can say
**BEST** next to the thing you did cleaner.
