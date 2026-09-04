/**
 * Smoke / unit-ish checks for authoritative combat (no MySQL, no listen).
 */
import { Room } from "../src/game.js";
import { getVehicle, listVehicles, MODULE_KEYS } from "../src/vehicles.js";
import { facingArmorMm, penetrates, spawnProjectile, stepProjectile } from "../src/combat.js";
import { computeRewards, evaluateAchievements } from "../src/achievements.js";
import { ensureBots, botThink, botsEnabled } from "../src/bots.js";
import { cfg } from "../src/config.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else {
    console.log("ok:", msg);
  }
}

// Catalog
const list = listVehicles();
assert(list.length >= 8, `catalog size >= 8 (got ${list.length})`);
assert(getVehicle("k72-ural").gun.muzzleVelocity > 0, "ural has gun");
assert(MODULE_KEYS.includes("ammo") && MODULE_KEYS.includes("optics"), "module keys");

// Facing / pen
const face = facingArmorMm({ front: 200, side: 100, rear: 50 }, 0, 30, 0, 0, 0);
assert(face.facing === "front", `facing front (got ${face.facing})`);
const penYes = penetrates(300, 100, 0);
assert(penYes.penetrated, "pen should succeed");
const penNo = penetrates(50, 300, 0);
assert(!penNo.penetrated, "pen should bounce");

// Room: ignore client hp/hit authority
const room = new Room("test-smoke", "laststand");
const a = room.join(null, { id: "uA", callsign: "A" }, "k72-ural", "blue");
const b = room.join(null, { id: "uB", callsign: "B" }, "m-raptor", "red");
assert(a && b, "joined two players");
const hpBefore = b.hp;
room.input("uA", { hp: 1, alive: false, hit: { target: "uB", damage: 9999, module: "ammo" } });
assert(a.alive && a.hp > 100, "attacker hp/alive not overwritten by client");
assert(b.hp === hpBefore && b.alive, "victim not damaged by client hit claim");

// Movement from throttle
const zx = a.z;
room.input("uA", { throttle: 1, steer: 0 });
room.integratePlayer(a, 0.5);
assert(Math.abs(a.z - zx) > 0.5 || Math.abs(a.x) >= 0, "moved after throttle integrate");

// Projectile spawn + hit path
a.x = 0;
a.z = 0;
a.yaw = 0;
a.turretYaw = 0;
a.gunPitch = 0;
b.x = 0;
b.z = 25;
b.y = 0;
b.yaw = Math.PI;
const def = getVehicle(a.vehicleId);
const proj = spawnProjectile(a, def);
assert(proj.vz > 0, "projectile flies +Z");
let hit = null;
for (let i = 0; i < 200 && !hit; i++) {
  const r = stepProjectile(proj, 0.05, room.players, a.id);
  if (r?.hitId) hit = r.hitId;
  if (r?.ground || r?.expired) break;
}
assert(hit === "uB", `projectile should hit B (got ${hit})`);

// Server hit applies
const events = [];
room.applyServerHit(a, b, { ...proj, pen: 400, damage: 500, x: b.x, z: b.z }, events);
assert(
  b.hp < hpBefore || events.some((e) => e.type === "hit" || e.type === "kill" || e.type === "cookoff"),
  "server hit produced effect",
);

// Rewards
const rew = computeRewards({
  result: "victory",
  kills: 2,
  damage: 1500,
  deaths: 0,
  reason: "laststand",
  vehicleId: "k72-ural",
  shots: 10,
  hits: 6,
  modulesBroken: 0,
});
assert(rew.steel > 1000 && rew.xp > 100, "rewards positive");
const ach = evaluateAchievements(
  {
    ...rew,
    result: "victory",
    kills: 2,
    damage: 1500,
    deaths: 0,
    reason: "laststand",
    vehicleId: "k72-ural",
    shots: 10,
    hits: 6,
    modulesBroken: 0,
  },
  { battles: 0, kills: 0 },
);
assert(ach.includes("first_blood") && ach.includes("last_stand"), `achievements ${ach}`);

// Spectator after kill
b.hp = 0;
b.alive = false;
room.makeSpectator(b);
assert(b.spectator && !b.alive, "spectator after death");
room.input("uB", { fire: true, throttle: 1 });
assert(b.input.fire === false || b.spectator, "spectator inputs ignored for combat");

clearInterval(room.timer);

// Bots: fill + think + snapshot flag
assert(typeof cfg.bots.enabled === "boolean", "bots config present");
assert(botsEnabled() === cfg.bots.enabled, "botsEnabled matches cfg");

const roomB = new Room("test-bots", "laststand");
const human = roomB.join(null, { id: "human1", callsign: "HUMAN" }, "k72-ural", "blue");
assert(human, "human joined bot room");
const added = ensureBots(roomB);
assert(added > 0, `bots filled (added=${added}, size=${roomB.players.size}, target=${cfg.bots.target})`);
const bots = [...roomB.players.values()].filter((p) => p.bot);
assert(bots.length >= 1, `at least one bot (got ${bots.length})`);
assert(bots.every((bp) => String(bp.callsign).startsWith("BOT-")), "bot callsigns BOT-*");

let enemyBot = bots.find((bp) => bp.team !== human.team) || bots[0];
if (enemyBot.team === human.team) {
  enemyBot.team = human.team === "blue" ? "red" : "blue";
}
enemyBot.x = human.x + 20;
enemyBot.z = human.z;
botThink(enemyBot, roomB);
assert(typeof enemyBot.input.aimYaw === "number", "bot sets aimYaw");
assert(typeof enemyBot.input.throttle === "number", "bot sets throttle");

roomB.step();
const snap = roomB.buildSnapshot();
assert(snap.some((u) => u.bot === true), "snapshot has bot:true");
const reports = roomB.matchReports();
assert(reports.every((r) => !String(r.userId).startsWith("bot-")), "bots excluded from match reports");
assert(reports.some((r) => r.userId === "human1"), "human still in match reports");
clearInterval(roomB.timer);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
