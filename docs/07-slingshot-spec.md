# 07 — Slingshot Specification

## 1. What it is

A folding steel-frame slingshot with surgical tubing, in a backpack, with a
pocket of 8 mm steel bearings. It is a **precision disruption instrument**. It
is not a weapon and the game never frames it as one.

## 2. Aiming

Aim is held, not toggled by default (configurable). While aiming:

- Time does **not** slow. This is important. Aiming while rolling at 9 m/s is
  the skill.
- Draw builds over 0.55 s to full. Draw sets muzzle velocity (18–34 m/s).
- The reticle shows a predicted arc, dropping in accuracy while the player's
  own speed is high — sway is proportional to speed and inversely to flow.
  Skilled, flowing players are *more* accurate at speed, which rewards the
  right thing.
- Steering authority while aiming is reduced by 35%. Committing to a shot
  commits your line.

Projectiles are simulated with position, velocity, and a `z` height, under
gravity, so elevated targets (cameras on poles at 4.2 m, drones at 12–18 m) are
genuine ballistic problems.

## 3. Targets and effects

| Target | Effect | Duration | Evidence |
|---|---|---|---|
| Camera lens | `OFFLINE` | until repaired (~6 min) | High |
| Camera housing/mount | `MISALIGNED`, rotates 40–110° | ~75 s, then re-homes | Medium |
| Camera PTZ motor | Sweep frozen at current angle | ~90 s | Medium |
| Streetlight | Local darkness, quality penalty to all sensors covering it | until repaired | Low |
| Junction box | Segment degraded | ~90 s self-heal | High |
| Trash can / sign / fence | **Noise event** — an audio anomaly at that point | instant | Very low |
| Sprinkler valve | Water plume; visual occlusion | ~40 s | Low |
| Hanging cable / banner | Physical object falls | permanent | Medium |
| Drone rotor | Destabilised: descends, reboots, or lands | 20–45 s | High |
| Car | Alarm — a large, loud, attention-pulling noise event | ~30 s | Low |
| A person | Refused. The shot simply is not taken. | — | — |

That last row is a design statement. The player character will not shoot a
person, and the input is silently declined rather than punished, because
explaining it would be preachy.

**Built in the slice:** camera lens, housing and PTZ motor; junction box; trash
can, sign, cone and hydrant as noise events; car alarm; drone rotor; and the
refusal to target a person.

**Specified but not built:** streetlight darkness, sprinkler valves and hanging
cables. The sensor lighting term they would drive exists and is live
(`Sensor.light`), but nothing writes to it yet — these belong with the night
pass rather than with the slice, and are listed in
`docs/18-phase-8-readiness.md` rather than pretended into existence here.

## 4. Noise events are the heart of it

The most powerful use of the slingshot is not breaking cameras. It is **making a
sound somewhere you are not**. A noise event creates an unattributed anomaly at
a location; drones in INVESTIGATE range route to it; ground patrols may divert.
Cheap, low-evidence, and it moves the finite asset pool.

Breaking a camera is loud in the *data*. Knocking over a bin is loud in the
*world*. The game teaches, over hours, that the second is usually smarter.

## 5. Evidence — the consequence layer

Every impact writes an `Evidence` record:

```
{ kind, position, tick, projectileVelocity, observedBy[] }
```

SAFEtrace then reasons about it, over several seconds, in view of the player:

```
CAMERA OFFLINE — NODE CM-114
PROJECTILE IMPACT DETECTED
TRAJECTORY ANALYSIS IN PROGRESS
ORIGIN ESTIMATED — 41 M SOUTHWEST — CONFIDENCE 62%
SUBJECT SEARCH INITIATED
```

Then either:

```
SUBJECT LINKED — 4417
```

or:

```
ORIGIN INDETERMINATE — INCIDENT LOGGED
```

The delay is deliberate. The player gets a window in which to *leave the
estimated origin*, which turns every shot into a small, tense route problem.

### Ways the player can beat trajectory analysis

- Shoot from a spot no sensor covers (uncertainty balloons).
- Shoot at an oblique angle so the back-projected origin lands in a large,
  populated area.
- Shoot from a crowd, so the subject search returns several candidates.
- Shoot and immediately break line-of-sight so no track links to the origin.
- Deliberately place the origin estimate somewhere that will produce a *wrong*
  link. This is available and it is not commented on.

## 6. Ammunition

Twelve bearings. They are recoverable from where they land (they are visible and
they roll), and there are resupply points at Mara's shop and the construction
site. This is a physical constraint, not an economy: no currency, no crafting,
no upgrades. Running out means going and getting some, which is a skate.

## 7. Combination with skating

The intended signature moment, which the tuning must make possible:

> Roll into the Commons at speed. Hold aim through the turn. The plaza camera
> sweeps left. Release at 22 m. The housing takes the hit and rotates. Do not
> stop. Take the seam it just opened. The notification arrives while you are
> already three streets away, and it says `ORIGIN INDETERMINATE`.

If that sequence does not feel superb, the slice has failed and nothing else
matters.
