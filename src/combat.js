/**
 * Ballistics, facing armor, module hits, fire DoT, cook-off.
 * Only server projectiles call applyProjectileHit.
 */

import { MODULE_KEYS } from "./vehicles.js";

const HIT_RADIUS = 2.4; // meters — soft collision sphere around unit

export function facingArmorMm(armor, fromX, fromZ, toX, toZ, toYaw) {
  const dx = fromX - toX;
  const dz = fromZ - toZ;
  const approach = Math.atan2(dx, dz);
  let rel = normalizeAngle(approach - toYaw);
  const a = Math.abs(rel);
  if (a < Math.PI / 4) return { mm: armor.front, facing: "front", moduleHint: "hull_f" };
  if (a > (3 * Math.PI) / 4) return { mm: armor.rear, facing: "rear", moduleHint: "hull_r" };
  return { mm: armor.side, facing: "side", moduleHint: "hull_s" };
}

export function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Simplified LoS pen: pen vs effective armor (angle factor). */
export function penetrates(pen, armorMm, incidenceAbs) {
  const angleFactor = Math.max(0.35, Math.cos(Math.min(incidenceAbs, Math.PI / 2.2)));
  const effective = armorMm / angleFactor;
  const overmatch = pen - effective;
  return { penetrated: overmatch > 0, overmatch, effective };
}

export function pickModule(facingHint, gunPitch, random = Math.random) {
  const r = random();
  if (gunPitch < -0.25 && r < 0.25) return "track_l";
  if (gunPitch < -0.25 && r < 0.45) return "track_r";
  if (r < 0.12) return "ammo";
  if (r < 0.22) return "engine";
  if (r < 0.32) return "fuel";
  if (r < 0.42) return "gun";
  if (r < 0.55) return "turret";
  if (r < 0.65) return "optics";
  return facingHint;
}

/**
 * Apply module damage + secondary effects.
 * Returns { hpDelta, events[], killed, cooked }
 */
export function damageModules(target, module, baseDamage, penetrated, overmatch) {
  const events = [];
  if (!penetrated) {
    events.push({ type: "hit", payload: { id: target.id, module, hp: target.hp, bounce: true } });
    return { hpDelta: 0, events, killed: false, cooked: false };
  }

  const severity = Math.min(1, 0.25 + Math.abs(overmatch) / 200);
  const before = target.modules[module] ?? 1;
  const after = Math.max(0, before - severity * (0.35 + Math.random() * 0.4));
  target.modules[module] = after;

  if (before > 0.05 && after <= 0.05) {
    events.push({ type: "module_break", payload: { id: target.id, module } });
    applyModuleBreak(target, module, events);
  }

  let hpDelta = baseDamage * (0.55 + severity * 0.45);
  // Ammo / fuel criticals amplify
  if (module === "ammo") hpDelta *= 1.35;
  if (module === "fuel") hpDelta *= 1.15;

  let cooked = false;
  if (module === "ammo" && after <= 0.2 && Math.random() < 0.4 + (1 - after) * 0.4) {
    cooked = true;
    target.alive = false;
    target.hp = 0;
    target.onFire = false;
    events.push({ type: "cookoff", payload: { id: target.id, by: target._lastAttacker } });
  }

  if (module === "fuel" && after < 0.5 && !target.onFire && Math.random() < 0.55) {
    target.onFire = true;
    target.fireT = 0;
    events.push({ type: "fire_start", payload: { id: target.id } });
  }

  if (module === "engine" && after < 0.35 && !target.onFire && Math.random() < 0.3) {
    target.onFire = true;
    target.fireT = 0;
    events.push({ type: "fire_start", payload: { id: target.id } });
  }

  return { hpDelta, events, killed: false, cooked };
}

function applyModuleBreak(target, module, events) {
  switch (module) {
    case "engine":
      target.speedMul = Math.min(target.speedMul, 0.15);
      break;
    case "track_l":
    case "track_r":
      target.immobilized = true;
      target.speedMul = Math.min(target.speedMul, 0.05);
      break;
    case "gun":
      target.canFire = false;
      break;
    case "turret":
      target.turretLock = true;
      break;
    case "optics":
      target.opticsBroken = true;
      break;
    case "fuel":
      target.fuelLeak = true;
      break;
    case "ammo":
      // handled via cook-off chance
      break;
    default:
      break;
  }
}

/** Fire DoT tick — dt in seconds. */
export function tickFire(target, dt, events) {
  if (!target.onFire || !target.alive) return;
  target.fireT = (target.fireT || 0) + dt;
  const dps = 35 + (target.modules.fuel < 0.3 ? 25 : 0);
  target.hp -= dps * dt;
  if (target.fuelLeak) target.fuel = Math.max(0, target.fuel - 8 * dt);

  // Chance to extinguish after long burn without fuel
  if (target.modules.fuel <= 0 && target.fireT > 12 && Math.random() < 0.02) {
    target.onFire = false;
    events.push({ type: "fire_end", payload: { id: target.id } });
  }

  // Cook-off from prolonged fire near ammo
  if (target.modules.ammo < 0.6 && target.fireT > 4 && Math.random() < 0.015 * dt * 20) {
    target.alive = false;
    target.hp = 0;
    target.onFire = false;
    events.push({ type: "cookoff", payload: { id: target.id, by: target._lastAttacker || null } });
  }

  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    target.hp = 0;
    events.push({
      type: "kill",
      payload: { id: target.id, by: target._lastAttacker || null, module: "fire" },
    });
  }
}

/**
 * Step projectile; returns hit target id or null. Mutates proj.
 */
export function stepProjectile(proj, dt, players, selfId) {
  // Substep so high muzzle velocity does not tunnel through HIT_RADIUS at 20 Hz
  const speed = Math.hypot(proj.vx, proj.vy, proj.vz) || 1;
  const maxStep = Math.max(0.4, HIT_RADIUS * 0.75);
  const n = Math.max(1, Math.ceil((speed * dt) / maxStep));
  const h = dt / n;

  for (let i = 0; i < n; i++) {
    proj.vy -= proj.gravity * h;
    proj.x += proj.vx * h;
    proj.y += proj.vy * h;
    proj.z += proj.vz * h;
    proj.dist += Math.hypot(proj.vx, proj.vy, proj.vz) * h;
    proj.life -= h;

    if (proj.y < 0) return { ground: true };
    if (proj.life <= 0 || proj.dist > proj.maxRange) return { expired: true };

    for (const p of players.values()) {
      if (!p.alive || p.id === selfId) continue;
      const dy = proj.y - (p.y + 1.2);
      const dx = proj.x - p.x;
      const dz = proj.z - p.z;
      if (dx * dx + dy * dy + dz * dz <= HIT_RADIUS * HIT_RADIUS) {
        return { hitId: p.id };
      }
    }
  }
  return null;
}

export function spawnProjectile(from, def, muzzleBoost = 1) {
  const g = def.gun;
  const yaw = from.yaw + from.turretYaw;
  const pitch = from.gunPitch;
  const cosP = Math.cos(pitch);
  const speed = g.muzzleVelocity * muzzleBoost;
  const ox = from.x + Math.sin(yaw) * 3.2;
  const oy = from.y + 1.6 + Math.sin(pitch) * 0.5;
  const oz = from.z + Math.cos(yaw) * 3.2;
  return {
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ownerId: from.id,
    x: ox,
    y: oy,
    z: oz,
    vx: Math.sin(yaw) * cosP * speed,
    vy: Math.sin(pitch) * speed,
    vz: Math.cos(yaw) * cosP * speed,
    gravity: g.gravity ?? 9.81,
    pen: g.pen,
    damage: g.damage,
    maxRange: g.maxRange ?? 4000,
    dist: 0,
    life: 8,
    caliber: g.caliber,
  };
}

export function moduleSnapshot(modules) {
  const out = {};
  for (const k of MODULE_KEYS) out[k] = Math.round((modules[k] ?? 1) * 100) / 100;
  return out;
}
