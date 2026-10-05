# 47 — The First Minute

A pass on what a new player meets, and on making the systems underneath say
more on their own. Nothing in the simulation's rules changed; one job moved,
the board was reordered, and each day now has its own conditions.

## The board opens on the best thing in town

The board opens three jobs at a time. Those three are now the three things
the game does:

1. **SHOOT: THE LOT FROM THE AIR.** It starts on the Lot's east path, out of
   every lens, with the east kicker fifty-odd metres dead ahead. Holding push
   wins it, unseen (`tests/improvements.test.ts` holds that true).
2. **GET TO: OKONJO CYCLE & BOARD.** A ride across town.
3. **HIT: THREE PLAZA CAMERAS.** A stone through a camera: the sling.

Job ids are unchanged, so saved bests follow their job whatever its number.

On an upright phone the chase camera now sits closer while rolling slowly
(29 m rather than 36) and opens back out to the full miniature at speed. At
rest the rider was a few dozen pixels tall; slow is when a player is looking
at the board, fast is when they need the road.

## The sling teaches itself

Until this browser has thrown a stone, SLING breathes the way the cold-start
ring does, and once raised, a ring fills round THROW over the time a full
draw takes, labelled HOLD and then LET GO. The first throw retires it for
good (`underwatch.slingTaught.v1`).

## The match lands where it happens

When the false positive fires, four acid-green corners close on Devon in a
third of a second, and the system's two lines type out beside him: the
subject and the confidence, from the same copy the notification uses. The
observation frame holds `MATCH 98.7%` in the colour of certainty for eight
seconds, then hands back. Nothing about it is dramatic; the system is
simply sure.

## Today's conditions (`src/sim/jobs/conditions.ts`)

Each day in the player's calendar has one of three conditions, in a three-day
cycle, shown on the board, in the brief and on the run's top line:

| Condition | What it does |
|---|---|
| CLEAR | An ordinary afternoon. |
| DUSK | Daylight 0.5: every camera's picture is worse, and the town is darker. |
| MAINTENANCE | About one camera in four is down for the day, never one a job is about. |

Nothing new is built for this: the sensors already scale every picture by
daylight, and a camera can already be out of action. The simulation never
reads a clock; the host passes in the day.

## The top of a phone, and the keyboard

- In a job on a phone, the control hint steps aside while something has the
  rider, and retires for good once a job has been finished.
- On a keyboard, holding **H** shows every control over the street without
  stopping anything. The hint strip offers it once.

## The sound of being watched

Risk still triggers no stinger. The world bed thins as the system's
attention rises, and the machine's own hum, in key with the motif, comes up
underneath it. Unseen, it is silent.

## Not done here

- **A playtest.** Still the most useful next thing; it needs people.
- **Records as evidence**, and **a second district.** Both are real content
  and systems work, and each deserves its own pass.
