# 49 — Recon, and the Plan

The plan view looked like a decision and behaved like a close button. PLAN
now means *I have worked this out, and this is how I'm doing it*.

```
BARRIER → RECON → INTEL → PLAN → EXECUTE
```

Nothing about the view's look changed. It is still the same top-down plan,
the same amber sketch of the cameras before VISION and the same cyan
machine layer after it, and you still open it with `Q` or the `PLAN` button.
What changed is what it is for.

## What PLAN used to do

`Q` / `PLAN` toggled `Intent.planView`. Inside it you could drag, zoom,
drop a pin and read what a stone at the pin would turn (`readPlan`,
`Sim.earshot`). Closing it did nothing: the pin was a waypoint, and the
earshot reading was forgotten the moment you looked away.

## Barrier

With somewhere to go (the pin in free skate, the job's next point in a
job), the strip under the run names the first camera that watches the way
once you are within 35 m of it: `CM-207 COVERS YOUR WAY · Q TO RECON`
(`PLAN TO RECON` on a phone). This is the only nudge; nothing opens on its
own.

## Recon: gathering intel (`src/sim/recon.ts`)

The town keeps running while the plan is open; it was already true that
you cannot move in it. Now the middle of the map, inside a pair of amber
brackets, is where reading happens. The host tells the sim where the map is
looking (`Sim.reconFocus`), and every camera held there is learned:

- after 0.5 s it is **spotted**: it goes on your map (`knownSensors`) even if
  you had never been near it;
- after 1.6 s its **timing** is known: how far it swings and how often
  (`CM-207 · SWINGS 44° EVERY 13s`, or `FIXED`). A ring fills round the
  mount while it is being read.

Tapping or clicking the map **reads a spot**: what a stone dropped there
would turn is written down and kept (`Sim.probe`, `Recon.noise`). The first
mark is your pin; once your own pin is down, marks anywhere else are only
readings, so working out where a stone goes never moves where you are
going. In a job the pin is the job's, so every mark is a reading.

Intel lasts until the run is reset (`resetForRun`).

## Plan: committing

While the plan is open, the approach the intel supports is drawn and
written: `PLAN: STONE → CM-207 TURNS → THERE`. It is worked out the same
way it will be judged:

1. **The way.** Straight to the target if nothing solid is in between,
   otherwise along the road graph (`planRoute`).
2. **The barrier.** Every live camera that could ever see some of it: in
   range, a clear line, inside the arc it swings through (`barriers`).
3. **One step per camera**, in the order you meet them, from the best intel
   you have:
   - `STONE → CM-207 TURNS` — a spot you read turns this camera *and*, once
     it is facing the stone, it sees none of the way (`turnClears`). A
     stone that would only turn it to look down the way does not count;
   - `CM-018 GAP 2.4s` — it sweeps, and of each sweep there are this many
     seconds in which a rider at cruising speed (8 m/s) slips past every
     stretch it covers (`gapSeconds`). Most cameras never look away from
     their own middle, so gaps live at the edges of a sweep;
   - `CM-207 NEVER LOOKS AWAY` — timed, and no gap and no stone. The plan
     says so in orange;
   - `CM-039 ?` — on the way, never read. A hole in the plan, counted on
     the screen before you commit (`2 CAMERAS ON THIS WAY NOT READ YET`).

Closing the plan with `Q` / `PLAN` **commits** (`Sim.commitPlan`), with a
`PLAN SET` stamp. Closing it any other way (`Esc`, a menu, the notes) only
puts it away. With nothing watching the way there is nothing to commit to.
Reopening recon puts the plan in hand down: you are re-planning.

## Execute

The committed chain sits on one strip under the run, the step you are on
lit, and one live line for it:

- `STONE 40 m ↗ → CM-207` — where the stone goes, relative to the camera
  behind you;
- `CM-207 TURNED · GO · 3.5s` — what the stone bought, counting down;
- `CM-018 AWAY · GO · 2.1s` / `CM-018 · WAIT 3.4s` — the gap, from where
  you are now.

The stone is a real stone: the slingshot, thrown at the place you read.
Nothing about execution is scripted. The town decides.

- **PLAN HELD** — you reached the target and nothing got a picture of you.
  In a job it is a scoring move (`STYLE.plan`, 600, in the chain like any
  other).
- **PLAN BLOWN** — something saw you first. The stamp says so; the strip
  says why, and the why is always something recon could have told you:

| Reason | When |
| --- | --- |
| `CM-040 — NOT IN YOUR RECON` | a camera (or a drone) you never read |
| `CM-018 SWUNG BACK — MISTIMED` | a camera with a gap, met outside it |
| `CM-207 WAS NEVER TURNED` | the plan was a stone, and none came |
| `CM-207 HADN'T TURNED YET` | you went the moment it landed, while it was swinging |
| `CM-207 TURNED BACK — TOO SLOW` | the stone turned it and it came back round before you were past |
| `CM-207 LOOKED BACK UP THE THROW` | the place had heard too many stones (PATTERN) and looked at the thrower |
| `CM-207 NEVER LOOKS AWAY` | recon told you so, and you went anyway |
| `CM-031 — OFF YOUR WAY` | a camera nowhere near the way you planned |

Being seen still ends nothing else: exposure, the chase and the score carry
on as before. The plan is just over, and the next one starts in recon.

## What is not here

The brief named three ways in — a cyberdeck, a VR headset, a drone. None of
them exists in the game yet; the plan view is the one recon screen, reached
the way it always was. Each of them would be a different reach for the same
reticle (the drone a moving centre, the deck the network's cameras at any
range), and `Sim.reconFocus` is the seam they would plug into.

`tests/recon.test.ts` pins the loop: what recon learns and when, how intel
becomes steps, that every reason above happens for the reason it says, and
that a held plan pays in a job.
