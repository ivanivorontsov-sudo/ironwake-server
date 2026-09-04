# IRONWAKE Design — realistic multiplayer vehicle combat

## Positioning

| | **Massive Warfare / Battle of Tanks** | **World of Tanks / War Thunder** | **IRONWAKE** |
|--|--------------------------------------|----------------------------------|--------------|
| Pace | Arcade, short matches | Arcade (WoT) / layered realism (WT) | Arcade-readable + hard systems |
| HP model | Soft HP bars | HP + modules (WT more harsh) | **Hard modules** drive outcomes |
| Respawn | Usually yes | WoT yes / WT depends | **No respawn** (last-stand) |
| Authority | Mixed / hosty | Server | **Fully authoritative** 20 Hz |
| Scale | Small arenas | 15v15 etc. | **16–32** per room |
| Air | Rare / separate | Full trees in WT | Tanks + APC/cars + helis + attack planes in one catalog |

IRONWAKE is a **War Thunder-lite / Massive Warfare** hybrid: approachable controls, but death is permanent in-match and module damage matters.

## Pillars

1. **No client authority over combat** — inputs only (`throttle`, `steer`, `aim*`, `fire`). HP / alive / hit damage from clients are discarded.
2. **Ballistic shells** — travel time + gravity; hits come from server projectiles, not client ray claims.
3. **Hard modules** — `hull_f/s/r`, `turret`, `gun`, `engine`, `ammo`, `tracks`, `fuel`, `optics` with gameplay effects (immobile, no fire, fire DoT, cook-off).
4. **Last-stand** — die once → spectator; match ends when one team is wiped.
5. **Economy** — steel / intel unlocks across ground + air vehicles; post-match rewards and achievements are server-computed.

## Module effects (summary)

| Module | Broken effect |
|--------|----------------|
| Engine | Severe speed cut; fire chance |
| Tracks | Immobilized (ground) |
| Gun | Cannot fire |
| Turret | Traverse lock |
| Optics | Flag for client bloom/zoom loss |
| Fuel | Leak + fire chance |
| Ammo | Cook-off chance (instant kill) |
| Hull F/S/R | HP sink by facing |

**Fire DoT** ticks on server; prolonged fire near damaged ammo can cook off. Events: `fire_start`, `fire_end`, `cookoff`.

## Armor / pen (simplified)

- Three facings from attacker approach vs hull yaw.
- Effective armor ≈ raw mm / cos(incidence) (clamped).
- Pen from shell catalog; bounce emits `hit` with `bounce: true` and no module break.

Not a full WT shell/armor angle simulator — enough for readable multiplayer skill (flank rear, shoot ammo rack).

## Room flow

```
lobby join (≤32) → live sim 20 Hz → kills / spectators → end → rewards + achievements
```

Mode default: `laststand`. HTTP poll remains first-class for Beget (WS upgrade stripped).

## Vehicle classes

- **tank** — heavy armor, slow reload, high pen
- **apc / car** — mobility, weak armor, burst cannons/MG
- **heli / plane** — altitude, high speed, burst weapons; share module + fire rules

Costs and stats live in `src/vehicles.js` (+ SQL unlock mirror in `sql/002_*.sql`).

## Anti-cheat surface

| Attack | Mitigation |
|--------|------------|
| Fake damage | Ignored; only `applyServerHit` |
| HP edit | Snapshot overwrites client |
| Teleport | Server integrates movement |
| Fire rate | Server reload + ammo |
| Reward inflate | `computeRewards` on server |

## Future (out of scope for this PR)

- Proper map collision / cover
- Spall / crew
- Separate air maps
- Assault mode objectives
