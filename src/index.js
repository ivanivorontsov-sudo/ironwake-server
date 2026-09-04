import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OAuth2Client } from "google-auth-library";
import { WebSocketServer } from "ws";
import { cfg, mysqlConfigured } from "./config.js";
import { pool, saveMatch, upsertGoogleUser, waitForDb, listAchievements, getUser } from "./db.js";
import { getRoom } from "./game.js";
import { listVehicles, getVehicle } from "./vehicles.js";
import { ACHIEVEMENTS } from "./achievements.js";

const PORT = cfg.port;
const google = new OAuth2Client(cfg.googleClientId || undefined);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Rooms that already flushed match rewards. */
const rewardedRooms = new Set();

async function flushRoomRewards(room) {
  if (!room.ended || rewardedRooms.has(room.id)) return;
  rewardedRooms.add(room.id);
  const reports = room.matchReports();
  for (const r of reports) {
    try {
      if (r.userId && !String(r.userId).startsWith("g")) {
        await saveMatch(r.userId, r);
      }
    } catch (err) {
      console.warn("saveMatch", r.userId, err.message);
    }
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  try {
    if ((url.pathname === "/play" || url.pathname === "/hangar.html") && req.method === "GET") {
      const htmlFile = join(root, "public", "hangar.html");
      try {
        const body = readFileSync(htmlFile, "utf8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(body);
        return;
      } catch {
        html(res, "<p>hangar missing</p>");
        return;
      }
    }
    if (url.pathname === "/" && req.method === "GET") {
      html(res, statusPage());
      return;
    }
    if (url.pathname === "/health") {
      let db = "down";
      try {
        await pool.query("SELECT 1");
        db = "mysql";
      } catch (err) {
        json(res, { ok: false, db, error: String(err.message ?? err), url: cfg.publicUrl }, 503);
        return;
      }
      json(res, {
        ok: true,
        db,
        url: cfg.publicUrl,
        ws: "blocked-on-beget",
        room: "/room/state",
        tickHz: 20,
        maxPlayers: 32,
        bots: cfg.bots.enabled,
        botsTarget: cfg.bots.target,
      });
      return;
    }
    if (url.pathname === "/catalog/vehicles" && req.method === "GET") {
      json(res, { vehicles: listVehicles() });
      return;
    }
    if (url.pathname.startsWith("/catalog/vehicles/") && req.method === "GET") {
      const id = url.pathname.split("/").pop();
      json(res, { vehicle: getVehicle(id) });
      return;
    }
    if (url.pathname === "/achievements" && req.method === "GET") {
      json(res, {
        definitions: Object.values(ACHIEVEMENTS).map(({ id, name, nameRu, desc }) => ({
          id,
          name,
          nameRu,
          desc,
        })),
      });
      return;
    }
    if (url.pathname === "/achievements/mine" && req.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) throw new Error("userId required");
      const unlocked = await listAchievements(userId);
      json(res, { unlocked });
      return;
    }
    if (url.pathname === "/room/join" && req.method === "POST") {
      const body = await readJson(req);
      const room = getRoom(String(body.room || "public").slice(0, 16), body.mode || "laststand");
      if (room.players.size >= room.maxPlayers) {
        json(res, { ok: false, error: "room full" }, 409);
        return;
      }
      const team = body.team === "red" || body.team === "blue"
        ? body.team
        : room.players.size % 2 === 0
          ? "blue"
          : "red";
      const profile = { id: body.userId || `g${Date.now()}`, callsign: body.callsign || "OPERATOR" };
      const p = room.join(null, profile, body.vehicleId || body.defId || "k72-ural", team);
      if (!p) {
        json(res, { ok: false, error: "join failed" }, 400);
        return;
      }
      json(res, { ok: true, id: p.id, team: p.team, room: room.id, vehicleId: p.vehicleId });
      return;
    }
    if (url.pathname === "/room/input" && req.method === "POST") {
      const body = await readJson(req);
      const room = getRoom(String(body.room || "public").slice(0, 16), body.mode || "laststand");
      if (body.userId) room.input(body.userId, body);
      if (room.ended) await flushRoomRewards(room);
      json(res, { ok: true });
      return;
    }
    if (url.pathname === "/room/state" && req.method === "GET") {
      const room = getRoom(String(url.searchParams.get("room") || "public").slice(0, 16), "laststand");
      if (room.ended) await flushRoomRewards(room);
      json(res, {
        type: "state",
        payload: {
          t: Date.now(),
          units: room.snapshot,
          projectiles: room.projectiles.map((p) => ({
            id: p.id,
            ownerId: p.ownerId,
            x: p.x,
            y: p.y,
            z: p.z,
          })),
          ended: room.ended,
          winner: room.winner,
        },
        events: room.events.slice(-24),
        ended: room.ended,
        winner: room.winner,
      });
      return;
    }
    if (url.pathname === "/auth/google" && req.method === "POST") {
      const body = await readJson(req);
      const ticket = await google.verifyIdToken({
        idToken: body.credential,
        audience: cfg.googleClientId || undefined,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) throw new Error("bad token");
      const user = await upsertGoogleUser(payload.sub, payload.email ?? null, payload.name ?? "OPERATOR");
      json(res, { user });
      return;
    }
    if (url.pathname === "/match" && req.method === "POST") {
      const body = await readJson(req);
      // Server recomputes rewards; client report is untrusted for currencies
      const result = await saveMatch(body.userId, body.report || body);
      json(res, { ok: true, ...result });
      return;
    }
    if (url.pathname === "/user" && req.method === "GET") {
      const userId = url.searchParams.get("userId");
      const user = await getUser(userId);
      if (!user) {
        json(res, { error: "not found" }, 404);
        return;
      }
      json(res, { user });
      return;
    }
    json(res, { error: "not found" }, 404);
  } catch (err) {
    json(res, { error: String(err.message ?? err) }, 400);
  }
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  let joined = null;
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === "join") {
      const room = getRoom(String(msg.room || "public").slice(0, 16), msg.mode || "laststand");
      if (room.players.size >= room.maxPlayers) {
        ws.send(JSON.stringify({ type: "error", payload: { error: "room full" } }));
        return;
      }
      const team =
        msg.team === "red" || msg.team === "blue"
          ? msg.team
          : room.players.size % 2 === 0
            ? "blue"
            : "red";
      const profile = { id: msg.userId || `g${Date.now()}`, callsign: msg.callsign || "OPERATOR" };
      const p = room.join(ws, profile, msg.vehicleId || msg.defId || "k72-ural", team);
      if (!p) return;
      joined = { room, id: profile.id };
      return;
    }
    if (joined && msg.type === "input") {
      joined.room.input(joined.id, msg);
      if (joined.room.ended) flushRoomRewards(joined.room);
    }
  });
  ws.on("close", () => {
    if (joined) joined.room.leave(joined.id);
  });
});

function json(res, body, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function html(res, body) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function statusPage() {
  const dbHint = mysqlConfigured()
    ? `${cfg.mysql.user}@${cfg.mysql.host}/${cfg.mysql.database}`
    : "не задан пароль — заполните config.local.json";
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>IRONWAKE server</title>
<style>body{margin:0;background:#0c0d0c;color:#e8e4d8;font-family:sans-serif}main{max-width:640px;margin:12vh auto;padding:24px}.muted{color:#9a9a8c}.ok{color:#7aa06c}.bad{color:#c07060}code{background:#1e201c;padding:2px 6px}a{color:#c4b48a}</style></head>
<body><main>
<p class="muted">GAME SERVER</p><h1>IRONWAKE</h1>
<p>API: <code>/health</code> · бой: <a href="/play">/play</a> · HTTP-room: <code>/room/state</code> · каталог: <code>/catalog/vehicles</code></p>
<p>Симуляция 20 Гц · комнаты до 32 · без респауна · модули + баллистика · боты (BOTS=0 выкл.)</p>
<p>WebSocket на Beget закрыт nginx. Клиент идёт через HTTP poll.</p>
<p>MySQL: <code>${dbHint}</code></p>
<p id="st" class="muted">проверка базы…</p>
<script>fetch("/health").then(r=>r.json()).then(j=>{const el=document.getElementById("st");el.className=j.ok?"ok":"bad";el.textContent=j.ok?"База подключена.":"База недоступна: "+(j.error||"");}).catch(()=>{});</script>
</main></body></html>`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

waitForDb().then((dbOk) => {
  console.log(`IRONWAKE db=${dbOk ? "up" : "down"}`);
});
const passenger = typeof PhusionPassenger !== "undefined" || process.env.IRONWAKE_PASSENGER === "1";
if (passenger) {
  server.listen("passenger", () => {
    console.log(`IRONWAKE server ${cfg.publicUrl} (Passenger)`);
  });
} else {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`IRONWAKE server ${cfg.publicUrl} :${PORT}`);
  });
}
