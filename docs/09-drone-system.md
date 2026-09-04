# 09 — Drone System

## 1. Position

Drones are the mobile expression of the same system as the cameras. They are not
a separate encounter type, they run on the same observation/fusion pipeline, and
their sensor is a downward cone that happens to move.

Three drones cover the slice district. **Three.** Their scarcity is the design:
moving one is meaningful, and a player who understands dispatch can empty a
neighbourhood.

## 2. States

```
DOCK        On the pad, charging. Available.
PATROL      Following a route at 14 m altitude, cone radius ~19 m.
INVESTIGATE Move to a point, descend to 11 m, orbit for 12 s, scan.
TRACK       Follow a specific track's estimate at 13 m, matching speed up to
            16 m/s, illuminating at night.
RELAY       Hold position to bridge a degraded segment (appears after uplink
            interference — the network heals itself visibly).
RETURN      Back to pad; low battery or task complete.
DESTABILISED After a rotor hit: descending, spinning, reboot 20–45 s.
```

Transitions come from `dispatch.ts`, never from the drone itself. Drones have no
opinions; they receive tasking. This keeps all escalation logic in one auditable
place.

## 3. Counterplay, taught by the world

- **Overhead cover defeats them absolutely.** Parking decks, carports, tree
  canopy, awnings, the culvert. Cover is authored geometry and it is visually
  obvious in the veneer (you can see you are in shade) and explicit in VISION.
- **Speed beats them situationally.** Their top speed is 16 m/s; a flowing
  player at 13.5 m/s cannot outrun one, but can out-*corner* one, because drones
  have a wide turn radius and prefer straight lines.
- **Noise redirects them.** A slingshot noise event pulls a nearby INVESTIGATE
  drone, and their travel time is real and visible.
- **Rotor hits stop one.** High evidence; a destabilised drone is a very loud
  data event and an engineer gets dispatched.
- **REROUTE retasks them** without any evidence at all, which is why the network
  verbs feel powerful.

## 4. Interaction with ground coverage

Drones and cameras are complementary by design:

- Cameras cover streets and plazas — the road graph, the predictable places.
- Drones cover the *gaps between* them, and are dispatched precisely to the
  low-coverage cells that a track's prediction error suggests.

So evading cameras by going off-graph is exactly what summons a drone. The two
layers form a pincer, and the player's answer is overhead cover — which exists
only in specific, memorable places. This produces route knowledge, which is the
progression system.

## 5. Presentation

In the veneer: a white quadcopter, visible from below, with a soft rotor sound
that the player will learn to fear despite it never changing. Its shadow arrives
before it does. **The shadow is the tell**, and on a sunny suburban afternoon
that is both beautiful and horrible.

In VISION: an altitude figure, a cone footprint on the ground, its route as a
dotted line, and its current tasking reason (`INVESTIGATING ANOMALY — 41 M`).
Knowing *why* it is coming is what turns fear into play.
