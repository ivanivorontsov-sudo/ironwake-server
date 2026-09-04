# IRONWAKE Protocol

Authoritative server @ **20 Hz** (`STEP=50ms`). Clients send **inputs only**. Damage, HP, modules, projectiles, kills are server-owned.

## Transport

| Path | Notes |
|------|--------|
| `ws://host/ws` | Preferred; blocked by Beget nginx |
| `POST /room/join` | HTTP fallback join |
| `POST /room/input` | HTTP fallback input |
| `GET /room/state?room=public` | HTTP poll snapshot + recent events |

Keep HTTP poll for Beget. Same room state feeds both WS broadcast and poll.

## Join

**WS**
```json
{ "type": "join", "room": "public", "mode": "laststand", "userId": "u…", "callsign": "RAVEN", "vehicleId": "k72-ural", "team": "blue" }
```

**HTTP** `POST /room/join` — same fields in JSON body.

Response: `{ ok, id, team, room, vehicleId }`. Rooms hold **16–32** players (`maxPlayers=32`).

## Input (client → server)

**Only** control fields are applied. `hp`, `alive`, `hit`, `damage` are **ignored**.

```json
{
  "type": "input",
  "throttle": 0.0,
  "steer": 0.0,
  "brake": false,
  "fire": false,
  "aimYaw": 0.0,
  "aimPitch": 0.0,
  "turretYaw": 0.0,
  "gunPitch": 0.0
}
```

- `throttle` ∈ [-1, 1], `steer` ∈ [-1, 1]
- `aimYaw` / `turretYaw`: desired turret yaw (rad); server slews at vehicle `turretTurnRate`
- `aimPitch` / `gunPitch`: gun elevation
- `fire`: request shot; server checks reload, ammo, `canFire`, spawns projectile

Legacy position sync (`x`,`y`,`z`,`yaw` as teleport) is **not** trusted for combat authority. Movement is integrated from throttle/steer on the server.

## State (server → client)

```json
{
  "type": "state",
  "payload": {
    "t": 1710000000000,
    "units": [ /* UnitSnapshot */ ],
    "projectiles": [{ "id", "ownerId", "x", "y", "z" }],
    "ended": false,
    "winner": null
  }
}
```

### UnitSnapshot

| Field | Meaning |
|-------|---------|
| `id`, `callsign`, `team`, `vehicleId` / `defId` | Identity |
| `x,y,z,yaw,turretYaw,gunPitch` | Pose |
| `hp`, `maxHp`, `alive`, `spectator` | Vitality (no respawn; dead → spectator) |
| `modules` | `hull_f/s/r`, `turret`, `gun`, `engine`, `ammo`, `track_l/r`, `fuel`, `optics` ∈ [0,1] |
| `onFire`, `fuel`, `ammo`, `immobilized`, `canFire`, `opticsBroken` | Status |

## Events

Pushed on WS and retained in `room.events` (HTTP poll `events` array):

| type | payload |
|------|---------|
| `join` / `leave` | `{ id, … }` |
| `shot` | `{ id, projectileId }` |
| `hit` | `{ id, by, module, hp, facing, pen?, bounce? }` |
| `module_break` | `{ id, module }` |
| `fire_start` / `fire_end` | `{ id }` |
| `cookoff` | `{ id, by }` |
| `kill` | `{ id, by, module }` |
| `spectator` | `{ id }` |
| `end` | `{ winner: "blue"\|"red"\|null }` |

## Ballistics

1. On valid `fire`, server spawns shell at muzzle with `muzzleVelocity`, direction from hull+turret+pitch.
2. Each tick: integrate velocity + gravity; expire on ground / range / lifetime.
3. Sphere hit vs living enemies (`HIT_RADIUS≈2.4m`).
4. Facing armor (F/S/R) + simplified incidence → pen check.
5. Module pick + HP damage **only** from this path (`applyServerHit`).

## Catalog / meta

- `GET /catalog/vehicles` — shop list (steel/intel costs)
- `GET /achievements` — definitions
- `POST /match` — persist report; **server recomputes** steel/intel/xp + achievements

## Auth

`POST /auth/google` with `{ credential }` (Google ID token) → user row + starter vehicles.
