import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OAuth2Client } from "google-auth-library";
import { WebSocketServer } from "ws";
import { cfg, mysqlConfigured } from "./config.js";
import { pool, saveMatch, upsertGoogleUser, waitForDb } from "./db.js";
import { getRoom } from "./game.js";

const PORT = cfg.port;
const google = new OAuth2Client(cfg.googleClientId || undefined);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
      json(res, { ok: true, db, url: cfg.publicUrl, ws: "blocked-on-beget", room: "/room/state" });
      return;
    }
    if (url.pathname === "/room/join" && req.method === "POST") {
      const body = await readJson(req);
      const room = getRoom(String(body.room || "public").slice(0, 16), body.mode || "laststand");
      const team = room.players.size % 2 === 0 ? "blue" : "red";
      const profile = { id: body.userId || `g${Date.now()}`, callsign: body.callsign || "OPERATOR" };
      const p = room.join(null, profile, body.vehicleId || body.defId || "k72-ural", team);
      json(res, { ok: true, id: p.id, team: p.team, room: room.id });
      return;
    }
    if (url.pathname === "/room/input" && req.method === "POST") {
      const body = await readJson(req);
      const room = getRoom(String(body.room || "public").slice(0, 16), body.mode || "laststand");
      if (body.userId) room.input(body.userId, body);
      json(res, { ok: true });
      return;
    }
    if (url.pathname === "/room/state" && req.method === "GET") {
      const room = getRoom(String(url.searchParams.get("room") || "public").slice(0, 16), "laststand");
      json(res, {
        type: "state",
        payload: { t: Date.now(), units: room.snapshot },
        events: room.events.slice(-12),
        ended: room.ended,
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
      await saveMatch(body.userId, body.report);
      json(res, { ok: true });
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
      const team = room.players.size % 2 === 0 ? "blue" : "red";
      const profile = { id: msg.userId || `g${Date.now()}`, callsign: msg.callsign || "OPERATOR" };
      room.join(ws, profile, msg.vehicleId || msg.defId || "k72-ural", team);
      joined = { room, id: profile.id };
      return;
    }
    if (joined && msg.type === "input") joined.room.input(joined.id, msg);
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
<p>API: <code>/health</code> · бой: <a href="/play">/play</a> · HTTP-room: <code>/room/state</code></p>
<p>WebSocket на Beget закрыт nginx. Клиент идёт через HTTP.</p>
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
server.listen(PORT, "0.0.0.0", () => {
  console.log(`IRONWAKE server ${cfg.publicUrl} :${PORT}`);
});
