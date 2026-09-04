import http from "node:http";
import { OAuth2Client } from "google-auth-library";
import { WebSocketServer } from "ws";
import { cfg, mysqlConfigured } from "./config.js";
import { pool, saveMatch, upsertGoogleUser, waitForDb } from "./db.js";
import { getRoom } from "./game.js";

const PORT = cfg.port;
const google = new OAuth2Client(cfg.googleClientId || undefined);

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
      json(res, { ok: true, db, url: cfg.publicUrl });
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
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>IRONWAKE server</title>
  <style>
    body{margin:0;background:#0c0d0c;color:#e8e4d8;font-family:IBM Plex Sans,Segoe UI,sans-serif}
    main{max-width:640px;margin:12vh auto;padding:24px}
    h1{font-family:Barlow Condensed,Segoe UI,sans-serif;font-size:48px;margin:0}
    .muted{color:#9a9a8c}
    .ok{color:#7aa06c}.bad{color:#c07060}
    code{background:#1e201c;padding:2px 6px;border-radius:4px}
  </style>
</head>
<body>
  <main>
    <p class="muted" style="letter-spacing:.28em;text-transform:uppercase;font-size:12px">Game server</p>
    <h1>IRONWAKE</h1>
    <p>Node.js запущен. API: <code>/health</code> · сокет: <code>/ws</code></p>
    <p>Публичный адрес: <code>${cfg.publicUrl}</code></p>
    <p>MySQL: <code>${dbHint}</code></p>
    <p id="st" class="muted">проверка базы…</p>
  </main>
  <script>
    fetch("/health").then(r=>r.json()).then(j=>{
      const el=document.getElementById("st");
      el.className=j.ok?"ok":"bad";
      el.textContent=j.ok?"База подключена.":"База недоступна: "+(j.error||"нет ответа");
    }).catch(()=>{
      const el=document.getElementById("st");
      el.className="bad";
      el.textContent="База недоступна.";
    });
  </script>
</body>
</html>`;
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

const dbOk = await waitForDb();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`IRONWAKE server ${cfg.publicUrl} :${PORT} db=${dbOk ? "up" : "down"}`);
});
