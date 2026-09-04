# IRONWAKE Bots

Server-side AI opponents for **last-stand** rooms so solo / small-party testing works without other humans.

## Behavior

- When at least one **human** is in a last-stand room and total players are below the fill target, the server joins bots until the target is reached (capped by `maxPlayers`).
- Bots use the same vehicle defs, modules, ballistics, and **no-respawn** rules as humans.
- Each tick the server writes bot `input` (throttle / steer / aim / fire): drive toward nearest enemy, slew turret, fire when roughly aimed and in range.
- Snapshots mark bots with `bot: true` and callsigns `BOT-01`, `BOT-02`, …
- Bots are skipped in match reward reports (no MySQL currency grants).

## Config

| Key | Default | Meaning |
|-----|---------|---------|
| `BOTS` | `1` | Set to `0` / `false` / `off` / `no` to **disable** bots |
| `BOTS_TARGET` | `6` | Fill room up to this many total players (clamped 2–32) |

Set via environment or `config.local.json` (same pattern as MySQL):

```json
{
  "BOTS": "0",
  "BOTS_TARGET": 8
}
```

```bash
BOTS=0 node src/index.js
```

## Notes

- Empty rooms stay empty until a human joins (bots do not idle-fill alone).
- Teams are balanced when spawning bots.
- Starter vehicles only (`STARTER_VEHICLES`).
