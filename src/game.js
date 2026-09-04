/**
 * Authoritative last-stand room @ ~20 Hz.
 * Clients send move/aim/fire inputs only — never hp/alive/damage.
 * No respawn; dead players become spectators.
 */
import {
  facingArmorMm,
  damageModules,
  tickFire,
  stepProjectile,
  spawnProjectile,
  normalizeAngle,
  penetrates,
  pickModule,
  moduleSnapshot,
} from "./combat.js";
import { getVehicle, freshModules } from "./vehicles.js";
import { ensureBots, botThink, botsEnabled } from "./bots.js";

const STEP_MS = 50; // 20 Hz
const DT = STEP_MS / 1000;
const MAX_PLAYERS = 32;
const MIN_PLAYERS_END = 2;

export class Room {
  constructor(id, mode = "laststand") {
    this.id = id;
    this.mode = mode;
    this.players = new Map();
    this.projectiles = [];
    this.tick = 0;
    this.ended = false;
    this.winner = null;
    this.snapshot = [];
    this.events = [];
    this.startedAt = Date.now();
    this.maxPlayers = MAX_PLAYERS;
    this.timer = setInterval(() => this.step(), STEP_MS);
  }

  join(ws, profile, vehicleId, team) {
    if (this.players.size >= this.maxPlayers) {
      return null;
    }
    const id = profile.id;
    const existing = this.players.get(id);
    if (existing) {
      existing.ws = ws || existing.ws;
      return existing;
    }

    const def = getVehicle(vehicleId);
    const spawnIndex = [...this.players.values()].filter((p) => p.team === team).length;
    const lane = (spawnIndex % 8) - 3.5;
    const p = {
      id,
      callsign: profile.callsign,
      vehicleId: def.id,
      team,
      ws: ws || null,
      spectator: false,
      x: team === "blue" ? 8 + lane * 3 : -8 - lane * 3,
      y: def.class === "heli" ? 40 : def.class === "plane" ? 120 : 0,
      z: team === "blue" ? 28 + Math.floor(spawnIndex / 8) * 6 : -28 - Math.floor(spawnIndex / 8) * 6,
      yaw: team === "blue" ? Math.PI : 0,
      turretYaw: 0,
      gunPitch: 0,
      hp: def.hp,
      maxHp: def.hp,
      alive: true,
      modules: freshModules(),
      onFire: false,
      fireT: 0,
      fuel: def.fuelCapacity,
      ammo: def.ammoCapacity,
      reloadLeft: 0,
      canFire: true,
      turretLock: false,
      immobilized: false,
      opticsBroken: false,
      fuelLeak: false,
      speedMul: 1,
      // pending inputs (authoritative)
      input: { throttle: 0, steer: 0, aimYaw: null, aimPitch: null, fire: false, brake: false },
      stats: { kills: 0, damage: 0, shots: 0, hits: 0 },
      _lastAttacker: null,
      bot: Boolean(profile.bot),
    };
    this.players.set(id, p);
    this.pushEvent("join", {
      id,
      callsign: profile.callsign,
      team,
      vehicleId: def.id,
      defId: def.id,
    });
    this.broadcast("join", {
      id,
      callsign: profile.callsign,
      team,
      vehicleId: def.id,
      defId: def.id,
    });
    return p;
  }

  /**
   * Accept ONLY control inputs. Ignores hp/alive/hit/damage from clients.
   */
  input(id, msg) {
    const p = this.players.get(id);
    if (!p) return;
    // Dead = spectator: ignore combat/move, allow nothing that affects world
    if (!p.alive || p.spectator) return;

    const inp = p.input;
    if (typeof msg.throttle === "number") inp.throttle = clamp(msg.throttle, -1, 1);
    if (typeof msg.steer === "number") inp.steer = clamp(msg.steer, -1, 1);
    if (typeof msg.brake === "boolean") inp.brake = msg.brake;
    if (typeof msg.fire === "boolean") inp.fire = msg.fire;
    // Aim: absolute preferred; legacy yaw/turret fields mapped as intent only
    if (typeof msg.aimYaw === "number") inp.aimYaw = msg.aimYaw;
    else if (typeof msg.turretYaw === "number") inp.aimYaw = msg.turretYaw;
    if (typeof msg.aimPitch === "number") inp.aimPitch = msg.aimPitch;
    else if (typeof msg.gunPitch === "number") inp.aimPitch = msg.gunPitch;
    // Optional hull yaw intent (server still integrates)
    if (typeof msg.yawIntent === "number") inp.yawIntent = msg.yawIntent;

    // Explicitly reject client authority fields (no-op if present)
    // msg.hp, msg.alive, msg.hit, msg.damage — ignored
  }

  leave(id) {
    this.players.delete(id);
    this.pushEvent("leave", { id });
    this.broadcast("leave", { id });
    if (!this.ended) this.checkEnd();
  }

  step() {
    if (this.ended) return;
    this.tick++;
    const events = [];

    if (botsEnabled()) {
      ensureBots(this);
      for (const p of this.players.values()) {
        if (p.bot) botThink(p, this);
      }
    }

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      this.integratePlayer(p, DT);
      tickFire(p, DT, events);
      if (p.reloadLeft > 0) p.reloadLeft = Math.max(0, p.reloadLeft - DT);
      if (p.fuelLeak) p.fuel = Math.max(0, p.fuel - 3 * DT);
      if (p.fuel <= 0) p.speedMul = Math.min(p.speedMul, 0.2);
    }

    // Projectiles
    const remain = [];
    for (const proj of this.projectiles) {
      const res = stepProjectile(proj, DT, this.players, proj.ownerId);
      if (!res) {
        remain.push(proj);
        continue;
      }
      if (res.hitId) {
        const attacker = this.players.get(proj.ownerId);
        const victim = this.players.get(res.hitId);
        if (attacker && victim) this.applyServerHit(attacker, victim, proj, events);
      }
      // ground / expired: discard
    }
    this.projectiles = remain;

    for (const ev of events) {
      this.pushEvent(ev.type, ev.payload);
      this.broadcast(ev.type, ev.payload);
      if (ev.type === "kill" || ev.type === "cookoff") {
        const victim = this.players.get(ev.payload.id);
        if (victim) this.makeSpectator(victim);
        const killer = this.players.get(ev.payload.by);
        if (killer && ev.payload.by !== ev.payload.id) killer.stats.kills += 1;
      }
    }

    this.checkEnd();

    // Snapshot every tick (~20 Hz); WS clients get it; HTTP poll reads this.snapshot
    this.snapshot = this.buildSnapshot();
    if (this.tick % 1 === 0) {
      this.broadcast("state", {
        t: Date.now(),
        units: this.snapshot,
        projectiles: this.projectiles.map(projPublic),
        ended: this.ended,
        winner: this.winner,
      });
    }
  }

  integratePlayer(p, dt) {
    const def = getVehicle(p.vehicleId);
    const inp = p.input;

    // Aim
    if (!p.turretLock) {
      if (typeof inp.aimYaw === "number") {
        const maxTurn = def.turretTurnRate * dt;
        const err = normalizeAngle(inp.aimYaw - p.turretYaw);
        p.turretYaw += clamp(err, -maxTurn, maxTurn);
      }
      if (typeof inp.aimPitch === "number") {
        const maxPitch = 0.9 * dt;
        const err = inp.aimPitch - p.gunPitch;
        p.gunPitch = clamp(p.gunPitch + clamp(err, -maxPitch, maxPitch), -0.35, 0.4);
      }
    }

    const flying = def.class === "heli" || def.class === "plane";
    let speed = def.speed * p.speedMul;
    if (p.immobilized && !flying) speed *= 0.05;
    if (p.modules.engine < 0.3) speed *= 0.4;
    if (p.modules.track_l < 0.2 || p.modules.track_r < 0.2) {
      if (!flying) {
        p.immobilized = true;
        speed *= 0.05;
      }
    }

    // Hull rotation
    if (!p.immobilized || flying) {
      p.yaw += inp.steer * def.turnRate * dt * (inp.throttle >= 0 ? 1 : -1);
    }

    const throttle = clamp(inp.throttle, -0.4, 1);
    const forward = throttle * speed;
    if (flying) {
      const climb = (def.flight?.climb || 10) * (inp.aimPitch || 0) * -1;
      p.y = clamp(p.y + climb * dt + (def.class === "heli" ? throttle * 2 * dt : 0), 5, def.flight?.ceiling || 5000);
      p.x += Math.sin(p.yaw) * forward * dt;
      p.z += Math.cos(p.yaw) * forward * dt;
    } else {
      p.x += Math.sin(p.yaw) * forward * dt;
      p.z += Math.cos(p.yaw) * forward * dt;
      p.y = 0;
    }

    // Fire
    if (inp.fire && p.canFire && p.reloadLeft <= 0 && p.ammo > 0 && p.alive) {
      const proj = spawnProjectile(p, def);
      this.projectiles.push(proj);
      p.ammo -= 1;
      p.reloadLeft = def.gun.reload;
      p.stats.shots += 1;
      inp.fire = false; // consume edge; client may re-assert
      this.pushEvent("shot", { id: p.id, projectileId: proj.id });
    }
  }

  applyServerHit(from, to, proj, events) {
    if (!to.alive) return;
    to._lastAttacker = from.id;
    const def = getVehicle(to.vehicleId);
    const face = facingArmorMm(def.armor, proj.x, proj.z, to.x, to.z, to.yaw);
    const dx = proj.x - to.x;
    const dz = proj.z - to.z;
    const approach = Math.atan2(dx, dz);
    const incidence = Math.abs(normalizeAngle(approach - to.yaw));
    // Use relative to face center for simplified angle
    const faceCenter =
      face.facing === "front" ? 0 : face.facing === "rear" ? Math.PI : Math.PI / 2;
    const incAbs = Math.min(Math.abs(normalizeAngle(incidence - faceCenter)), Math.PI / 2);
    const pen = penetrates(proj.pen, face.mm, incAbs);
    const module = pickModule(face.moduleHint, from.gunPitch);
    const result = damageModules(to, module, proj.damage, pen.penetrated, pen.overmatch);

    from.stats.hits += 1;
    if (result.hpDelta > 0) {
      to.hp -= result.hpDelta;
      from.stats.damage += result.hpDelta;
    }

    for (const ev of result.events) {
      if (ev.type === "cookoff") ev.payload.by = from.id;
      events.push(ev);
    }

    if (!result.cooked && !result.events.some((e) => e.type === "hit" && e.payload.bounce)) {
      events.push({
        type: "hit",
        payload: {
          id: to.id,
          by: from.id,
          module,
          hp: Math.max(0, to.hp),
          facing: face.facing,
          pen: pen.penetrated,
        },
      });
    } else if (!pen.penetrated && !result.events.some((e) => e.type === "hit")) {
      events.push({
        type: "hit",
        payload: { id: to.id, by: from.id, module, hp: to.hp, bounce: true, facing: face.facing },
      });
    }

    if (result.cooked) return;

    if (to.hp <= 0 && to.alive) {
      to.alive = false;
      to.hp = 0;
      events.push({ type: "kill", payload: { id: to.id, by: from.id, module } });
    }
  }

  makeSpectator(p) {
    p.alive = false;
    p.spectator = true;
    p.hp = 0;
    p.input = { throttle: 0, steer: 0, aimYaw: null, aimPitch: null, fire: false, brake: false };
    this.pushEvent("spectator", { id: p.id });
    this.broadcast("spectator", { id: p.id });
  }

  checkEnd() {
    if (this.ended) return;
    const live = { blue: 0, red: 0 };
    let total = 0;
    for (const p of this.players.values()) {
      total++;
      if (p.alive) live[p.team]++;
    }
    if (total < MIN_PLAYERS_END) return;
    if (live.blue === 0 || live.red === 0) {
      // Need at least one death so lobby of one team doesn't instantly end
      if (live.blue + live.red >= total) return;
      this.ended = true;
      this.winner = live.blue > 0 ? "blue" : live.red > 0 ? "red" : null;
      const payload = { winner: this.winner };
      this.pushEvent("end", payload);
      this.broadcast("end", payload);
      clearInterval(this.timer);
    }
  }

  buildSnapshot() {
    const units = [];
    for (const p of this.players.values()) {
      units.push({
        id: p.id,
        defId: p.vehicleId,
        vehicleId: p.vehicleId,
        team: p.team,
        x: round3(p.x),
        y: round3(p.y),
        z: round3(p.z),
        yaw: round3(p.yaw),
        turretYaw: round3(p.turretYaw),
        gunPitch: round3(p.gunPitch),
        hp: Math.round(p.hp),
        maxHp: p.maxHp,
        alive: p.alive,
        spectator: p.spectator,
        onFire: p.onFire,
        fuel: Math.round(p.fuel),
        ammo: p.ammo,
        modules: moduleSnapshot(p.modules),
        callsign: p.callsign,
        bot: Boolean(p.bot),
        immobilized: p.immobilized,
        canFire: p.canFire,
        opticsBroken: p.opticsBroken,
      });
    }
    return units;
  }

  /** Match report hooks for rewards. */
  matchReports() {
    const duration = Math.round((Date.now() - this.startedAt) / 1000);
    const reports = [];
    for (const p of this.players.values()) {
      if (p.bot) continue;
      const victory = this.winner && p.team === this.winner;
      reports.push({
        userId: p.id,
        result: victory ? "victory" : "defeat",
        reason: this.ended ? "laststand" : "left",
        vehicleId: p.vehicleId,
        kills: p.stats.kills,
        damage: Math.round(p.stats.damage),
        duration,
        deaths: p.alive ? 0 : 1,
        shots: p.stats.shots,
        hits: p.stats.hits,
        modulesBroken: Object.values(p.modules).filter((v) => v <= 0.05).length,
      });
    }
    return reports;
  }

  pushEvent(type, payload) {
    this.events.push({ type, payload, t: Date.now() });
    if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
  }

  broadcast(type, payload) {
    const raw = JSON.stringify({ type, payload });
    for (const p of this.players.values()) {
      if (p.ws && p.ws.readyState === 1) p.ws.send(raw);
    }
  }
}

function projPublic(proj) {
  return {
    id: proj.id,
    ownerId: proj.ownerId,
    x: round3(proj.x),
    y: round3(proj.y),
    z: round3(proj.z),
  };
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

export const rooms = new Map();

export function getRoom(id, mode) {
  if (!rooms.has(id)) rooms.set(id, new Room(id, mode));
  return rooms.get(id);
}
