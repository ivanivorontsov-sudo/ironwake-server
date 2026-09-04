/**
 * Authoritative last-stand room. No respawn.
 * Works over WebSocket and HTTP polling (Beget nginx strips WS upgrade).
 */
const STEP = 50;

export class Room {
  constructor(id, mode = "laststand") {
    this.id = id;
    this.mode = mode;
    this.players = new Map();
    this.tick = 0;
    this.ended = false;
    this.snapshot = [];
    this.events = [];
    this.timer = setInterval(() => this.step(), STEP);
  }

  join(ws, profile, vehicleId, team) {
    const id = profile.id;
    this.players.set(id, {
      id,
      callsign: profile.callsign,
      vehicleId,
      team,
      ws: ws || null,
      x: team === "blue" ? 8 : -8,
      y: 0,
      z: team === "blue" ? 22 : -22,
      yaw: team === "blue" ? Math.PI : 0,
      turretYaw: 0,
      gunPitch: 0,
      hp: 1800,
      alive: true,
      modules: { hull_front: 1, engine: 1, ammo: 1, track_l: 1, track_r: 1 },
    });
    this.pushEvent("join", { id, callsign: profile.callsign, team, vehicleId, defId: vehicleId });
    this.broadcast("join", { id, callsign: profile.callsign, team, vehicleId, defId: vehicleId });
    return this.players.get(id);
  }

  input(id, msg) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (typeof msg.yaw === "number") p.yaw = msg.yaw;
    if (typeof msg.x === "number") p.x = msg.x;
    if (typeof msg.y === "number") p.y = msg.y;
    if (typeof msg.z === "number") p.z = msg.z;
    if (typeof msg.turretYaw === "number") p.turretYaw = msg.turretYaw;
    if (typeof msg.gunPitch === "number") p.gunPitch = msg.gunPitch;
    if (typeof msg.hp === "number") p.hp = msg.hp;
    if (typeof msg.alive === "boolean") p.alive = msg.alive;
    if (msg.hit && this.players.has(msg.hit.target)) {
      this.applyHit(p, this.players.get(msg.hit.target), msg.hit);
    }
  }

  applyHit(from, to, hit) {
    if (!to.alive) return;
    const mod = hit.module || "hull_front";
    const dmg = Math.min(400, Number(hit.damage) || 80);
    to.hp -= dmg * 0.35;
    if (mod === "ammo" && Math.random() < 0.35) {
      to.alive = false;
      to.hp = 0;
      this.pushEvent("cookoff", { id: to.id, by: from.id });
      this.broadcast("cookoff", { id: to.id, by: from.id });
    } else if (to.hp <= 0) {
      to.alive = false;
      this.pushEvent("kill", { id: to.id, by: from.id, module: mod });
      this.broadcast("kill", { id: to.id, by: from.id, module: mod });
    } else {
      this.pushEvent("hit", { id: to.id, module: mod, hp: to.hp });
      this.broadcast("hit", { id: to.id, module: mod, hp: to.hp });
    }
    this.checkEnd();
  }

  checkEnd() {
    const live = { blue: 0, red: 0 };
    for (const p of this.players.values()) if (p.alive) live[p.team]++;
    if (this.players.size >= 1 && (live.blue === 0 || live.red === 0) && (live.blue + live.red) < this.players.size) {
      this.ended = true;
      this.pushEvent("end", { winner: live.blue ? "blue" : "red" });
      this.broadcast("end", { winner: live.blue ? "blue" : "red" });
      clearInterval(this.timer);
    }
  }

  leave(id) {
    this.players.delete(id);
    this.pushEvent("leave", { id });
    this.broadcast("leave", { id });
  }

  step() {
    this.tick++;
    if (this.tick % 2 !== 0) return;
    const snapshot = [];
    for (const p of this.players.values()) {
      snapshot.push({
        id: p.id,
        defId: p.vehicleId,
        vehicleId: p.vehicleId,
        team: p.team,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        turretYaw: p.turretYaw,
        gunPitch: p.gunPitch,
        hp: p.hp,
        alive: p.alive,
        callsign: p.callsign,
      });
    }
    this.snapshot = snapshot;
    this.broadcast("state", { t: Date.now(), units: snapshot });
  }

  pushEvent(type, payload) {
    this.events.push({ type, payload, t: Date.now() });
    if (this.events.length > 30) this.events.splice(0, this.events.length - 30);
  }

  broadcast(type, payload) {
    const raw = JSON.stringify({ type, payload });
    for (const p of this.players.values()) {
      if (p.ws && p.ws.readyState === 1) p.ws.send(raw);
    }
  }
}

export const rooms = new Map();

export function getRoom(id, mode) {
  if (!rooms.has(id)) rooms.set(id, new Room(id, mode));
  return rooms.get(id);
}
