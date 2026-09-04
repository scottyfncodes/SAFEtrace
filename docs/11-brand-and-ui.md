# 11 — SAFEtrace™ Brand & UI System

## 1. The brand must feel real

If SAFEtrace looks like a video game evil corporation, the game does not work.
It must look like a company whose stock you might own.

**Wordmark**: `SAFEtrace™` — `SAFE` in medium weight, `trace` in light, no
space, teal. Lowercase second half signals approachability, which is the entire
brand strategy: *we are not the government, we are a nice product*.

**Mark**: a rounded-corner square containing three concentric arcs — a
stylised field of view that also reads as a wifi symbol and a shield.

**Voice**: calm, plain, second-person, present tense, never exclamatory.
SAFEtrace never says "ALERT". It says "We noticed something."

## 2. Product line

```
SAFEtrace™ HOME     Protect your family.
SAFEtrace™ SCHOOL   Safer classrooms. Smarter communities.
SAFEtrace™ CITY     Predict. Prevent. Protect.
SAFEtrace™ VISION   Advanced identity recognition.
SAFEtrace™ PREDICT  Don't wait for danger.
SAFEtrace™ CARE     Someone is always looking out.
```

These appear on signage, bus shelters, school announcement boards, the phone,
and in the opening advertisement. **Their words never change across the game.**
Only the player does. `SAFEtrace™ CARE — Someone is always looking out.` is
warm in minute one and unbearable in hour four, and it is the same eleven
characters.

## 3. Typography

Geometric humanist sans throughout (system stack: Inter / Söhne / Helvetica
Neue). Two weights, generous letter-spacing on small caps, tabular figures for
every number the system reports. Numbers are the brand's real typeface: `98.7%`,
`PREDICTIVE RISK: 62%`, `NODE CM-114`.

## 4. Diegetic UI rule

**Almost every interface element is a thing in the fiction.**

- Notifications are phone notifications, and they animate in as a phone would.
- The risk score is the SAFEtrace app's own "Community Safety Score" widget,
  which every resident has, showing *your* number. It was always in the app. In
  Act I it is a friendly green 4%.
- Ammunition is not an ammo counter; it is bearings visible in a pocket flap.
- Health does not exist.

The only non-diegetic elements are input prompts and the aim reticle. Both fade
out permanently once the player has demonstrated the verb three times.

## 5. Message grammar

SAFEtrace speaks in a strict register. All caps for system states, sentence case
for consumer-facing care language.

```
IDENTITY CONFIRMED
UNUSUAL ROUTE DETECTED
BEHAVIORAL ANOMALY DETECTED
SUBJECT MONITORING INITIATED
PREDICTIVE RISK: 62%
INTERVENTION AUTHORIZED
TRAJECTORY ANALYSIS IN PROGRESS
ORIGIN INDETERMINATE
REQUEST DECLINED — RECORD IMMUTABLE
```

against

```
You're almost home. We'll keep an eye out.
Devon is at Ridgeline Secondary. Everything looks normal.
Your neighbourhood is 12% safer this month. Thank you for participating.
```

The two registers belong to the same company and the game never comments on it.

## 6. Motion

Everything eases with a soft, confident curve (`cubic-bezier(.16,1,.3,1)`),
200–320 ms. Nothing in SAFEtrace's UI is ever urgent, jittery, or red-flashing —
not even INTERVENTION, which slides in as gently as a weather update. The
calmness of the animation while a patrol converges on you is the design's
sharpest tool.

## 7. Machine-mode UI

In VISION the interface stops being a phone and becomes the world's own
annotation layer: labels attach to objects in world space, at world scale, with
leader lines. Text is drawn *into* the town, not on top of the screen. This is
the difference between a HUD and a revelation.
