import http from "node:http";
import { OAuth2Client } from "google-auth-library";
import { WebSocketServer } from "ws";
import { pool, saveMatch, upsertGoogleUser, waitForDb } from "./db.js";
import { getRoom } from "./game.js";

const PORT = Number(process.env.PORT ?? 8787);
const google = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || undefined);

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/health") {
      await pool.query("SELECT 1");
      json(res, { ok: true, db: "mysql" });
      return;
    }
    if (url.pathname === "/auth/google" && req.method === "POST") {
      const body = await readJson(req);
      const ticket = await google.verifyIdToken({
        idToken: body.credential,
        audience: process.env.GOOGLE_CLIENT_ID || undefined,
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
      room.join(ws, profile, msg.vehicleId || "k72-ural", team);
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
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
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

await waitForDb();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`IRONWAKE server on :${PORT}`);
});
