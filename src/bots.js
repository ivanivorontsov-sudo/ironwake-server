/**
 * Simple AI opponents for last-stand rooms.
 * Server-side inputs only — same vehicle / modules / no-respawn as humans.
 * Disable with BOTS=0 (env or config.local.json).
 */
import { normalizeAngle } from "./combat.js";
import { getVehicle, STARTER_VEHICLES } from "./vehicles.js";
import { cfg } from "./config.js";

const BOT_VEHICLES = STARTER_VEHICLES.length
  ? STARTER_VEHICLES
  : ["k72-ural", "m-raptor"];

let botSeq = 0;

export function botsEnabled() {
  return cfg.bots.enabled;
}

export function botsTargetFill() {
  return cfg.bots.target;
}

/**
 * Ensure room has enough bots when humans are present but total is low.
 * Returns number of bots added this call.
 */
export function ensureBots(room) {
  if (!botsEnabled() || room.ended || room.mode !== "laststand") return 0;
  const players = [...room.players.values()];
  const humans = players.filter((p) => !p.bot);
  if (humans.length === 0) return 0; // idle lobby — wait for a human

  const target = Math.min(botsTargetFill(), room.maxPlayers);
  let added = 0;
  while (room.players.size < target && room.players.size < room.maxPlayers) {
    const teams = countTeams(room);
    const team = teams.blue <= teams.red ? "blue" : "red";
    const vehicleId = BOT_VEHICLES[botSeq % BOT_VEHICLES.length];
    botSeq += 1;
    const n = botSeq;
    const id = `bot-${n}-${Date.now().toString(36).slice(-4)}`;
    const callsign = `BOT-${String(n).padStart(2, "0")}`;
    const p = room.join(null, { id, callsign }, vehicleId, team);
    if (!p) break;
    p.bot = true;
    added += 1;
  }
  return added;
}

function countTeams(room) {
  const t = { blue: 0, red: 0 };
  for (const p of room.players.values()) {
    if (p.alive) t[p.team] = (t[p.team] || 0) + 1;
  }
  return t;
}

/**
 * Compute throttle/steer/aim/fire for one bot this tick.
 */
export function botThink(bot, room) {
  if (!bot.alive || bot.spectator) {
    bot.input = { throttle: 0, steer: 0, aimYaw: null, aimPitch: null, fire: false, brake: false };
    return;
  }

  const enemy = nearestEnemy(bot, room);
  if (!enemy) {
    bot.input.throttle = 0.15;
    bot.input.steer = 0.2 * Math.sin(room.tick * 0.02 + bot.id.length);
    bot.input.fire = false;
    return;
  }

  const dx = enemy.x - bot.x;
  const dz = enemy.z - bot.z;
  const dist = Math.hypot(dx, dz) || 1;
  const desiredYaw = Math.atan2(dx, dz);

  // Hull: steer toward enemy; reverse if too close and facing wrong way
  const yawErr = normalizeAngle(desiredYaw - bot.yaw);
  let steer = clamp(yawErr * 1.8, -1, 1);
  let throttle = 0.85;
  if (dist < 18) throttle = 0.25;
  if (dist < 10) throttle = Math.abs(yawErr) > 0.8 ? -0.25 : 0.1;
  if (dist > 55) throttle = 1;
  if (bot.immobilized) {
    throttle = 0;
    steer = 0;
  }

  // Aim turret at enemy (world yaw relative to hull — integratePlayer uses absolute aimYaw as turret world? )
  // In game.js: err = aimYaw - p.turretYaw — so aimYaw is relative turret angle, NOT world.
  // Wait: client PROTOCOL says "desired turret yaw (rad)". Looking at integrate:
  //   const err = normalizeAngle(inp.aimYaw - p.turretYaw);
  // And spawnProjectile: yaw = from.yaw + from.turretYaw
  // So aimYaw is the turret-relative angle (same space as turretYaw), not world yaw.
  // Desired world gun direction = desiredYaw; turretYaw should be desiredYaw - hull.yaw
  const aimRel = normalizeAngle(desiredYaw - bot.yaw);
  const dy = (enemy.y + 1.2) - (bot.y + 1.6);
  const aimPitch = clamp(Math.atan2(dy, dist), -0.3, 0.35);

  const aimErr = Math.abs(normalizeAngle(aimRel - bot.turretYaw));
  const gunWorld = bot.yaw + bot.turretYaw;
  const worldAimErr = Math.abs(normalizeAngle(desiredYaw - gunWorld));

  // Lead slightly for slow shells (very rough)
  const def = getVehicle(bot.vehicleId);
  const tFlight = dist / Math.max(200, def.gun.muzzleVelocity * 0.85);
  const leadX = enemy.x; // bots don't estimate enemy velocity yet
  const leadZ = enemy.z;
  void leadX;
  void leadZ;
  void tFlight;

  const inRange = dist < (def.gun.maxRange || 4000) * 0.45 && dist > 6;
  const aimed = worldAimErr < 0.12 && aimErr < 0.18;

  bot.input.throttle = clamp(throttle, -1, 1);
  bot.input.steer = clamp(steer, -1, 1);
  bot.input.aimYaw = aimRel;
  bot.input.aimPitch = aimPitch;
  bot.input.fire = Boolean(inRange && aimed && bot.canFire && bot.reloadLeft <= 0 && bot.ammo > 0);
  bot.input.brake = false;
}

function nearestEnemy(bot, room) {
  let best = null;
  let bestD = Infinity;
  for (const p of room.players.values()) {
    if (!p.alive || p.spectator || p.team === bot.team || p.id === bot.id) continue;
    const d = (p.x - bot.x) ** 2 + (p.z - bot.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
