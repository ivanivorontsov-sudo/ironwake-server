# IRONWAKE Server

Authoritative combined-arms combat server for **IRONWAKE**.

MySQL stores accounts, garage, currencies (Steel / Intel / Commendations), achievements and match history. WebSocket rooms run the simulation: **no respawn**, module hits (tracks, engine, ammo cook-off, crew), tanks / IFVs / helicopters / jets.

## Stack

- Node.js 22
- MySQL 8
- `ws` game rooms at 20 Hz
- Google Sign-In (ID token) for accounts

## Run

```bash
cp .env.example .env
docker compose up --build
```

API: `http://localhost:8787/health`  
WebSocket: `ws://localhost:8787/ws`

## Env

| Variable | Purpose |
|---|---|
| `MYSQL_HOST` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | Database |
| `GOOGLE_CLIENT_ID` | Google Sign-In audience |
| `PORT` | HTTP + WS port (default 8787) |

Schema: [`sql/001_schema.sql`](sql/001_schema.sql)

The browser client in the IRONWAKE web hangar talks to this process for ranked rooms. Casual P2P in the web preview is **not** cheat-safe — this server is.
