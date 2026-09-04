import mysql from "mysql2/promise";
import { cfg, mysqlConfigured } from "./config.js";
import { STARTER_VEHICLES } from "./vehicles.js";
import { computeRewards, evaluateAchievements } from "./achievements.js";

export const pool = mysql.createPool({
  host: cfg.mysql.host,
  port: cfg.mysql.port,
  user: cfg.mysql.user,
  password: cfg.mysql.password,
  database: cfg.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

export async function waitForDb() {
  if (!mysqlConfigured()) {
    console.warn("MySQL password empty — fill config.local.json (see config.local.json.example)");
    return false;
  }
  for (let i = 0; i < 15; i++) {
    try {
      await pool.query("SELECT 1");
      return true;
    } catch (err) {
      console.warn(`MySQL retry ${i + 1}/15: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

function nid() {
  return "u" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-8);
}

export async function upsertGoogleUser(sub, email, name) {
  const [rows] = await pool.query("SELECT * FROM users WHERE google_sub = :sub", { sub });
  if (rows[0]) return rows[0];
  const id = nid();
  const callsign =
    String(name || "OPERATOR")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 18)
      .toUpperCase() || "OPERATOR";
  await pool.query(
    "INSERT INTO users (id, google_sub, email, callsign) VALUES (:id, :sub, :email, :callsign)",
    { id, sub, email, callsign },
  );
  for (const v of STARTER_VEHICLES) {
    await pool.query("INSERT IGNORE INTO owned_vehicles (user_id, vehicle_id) VALUES (:id, :v)", {
      id,
      v,
    });
  }
  const [created] = await pool.query("SELECT * FROM users WHERE id = :id", { id });
  return created[0];
}

export async function getUser(userId) {
  const [rows] = await pool.query("SELECT * FROM users WHERE id = :userId", { userId });
  return rows[0] || null;
}

/**
 * Persist match + currencies + achievements.
 * report may omit steel/intel/xp — computed server-side.
 */
export async function saveMatch(userId, report) {
  const user = await getUser(userId);
  const rewards = computeRewards({
    result: report.result,
    kills: Number(report.kills) || 0,
    damage: Number(report.damage) || 0,
    deaths: Number(report.deaths) || 0,
    reason: report.reason || "",
    vehicleId: report.vehicleId || "k72-ural",
    shots: Number(report.shots) || 0,
    hits: Number(report.hits) || 0,
    modulesBroken: Number(report.modulesBroken) || 0,
  });

  const full = {
    result: report.result === "victory" ? "victory" : "defeat",
    reason: String(report.reason || "").slice(0, 80),
    vehicleId: String(report.vehicleId || "k72-ural").slice(0, 40),
    kills: Number(report.kills) || 0,
    damage: Number(report.damage) || 0,
    duration: Number(report.duration ?? report.duration_sec) || 0,
    steel: rewards.steel,
    intel: rewards.intel,
    xp: rewards.xp,
    deaths: Number(report.deaths) || 0,
    shots: Number(report.shots) || 0,
    hits: Number(report.hits) || 0,
    modulesBroken: Number(report.modulesBroken) || 0,
  };

  await pool.query(
    `INSERT INTO match_history
      (user_id, result, reason, vehicle_id, kills, damage, duration_sec, steel_earned, intel_earned, xp_earned)
     VALUES (:userId, :result, :reason, :vehicleId, :kills, :damage, :duration, :steel, :intel, :xp)`,
    { userId, ...full },
  );

  await pool.query(
    `UPDATE users SET
       steel = steel + :steel,
       intel = intel + :intel,
       xp = xp + :xp,
       battles = battles + 1,
       victories = victories + :win,
       kills = kills + :kills,
       deaths = deaths + :deaths
     WHERE id = :userId`,
    {
      userId,
      steel: full.steel,
      intel: full.intel,
      xp: full.xp,
      win: full.result === "victory" ? 1 : 0,
      kills: full.kills,
      deaths: full.deaths,
    },
  );

  const unlocked = evaluateAchievements(full, user);
  const newly = [];
  for (const aid of unlocked) {
    try {
      const [r] = await pool.query(
        "INSERT IGNORE INTO player_achievements (user_id, achievement_id) VALUES (:userId, :aid)",
        { userId, aid },
      );
      if (r.affectedRows > 0) newly.push(aid);
    } catch {
      /* table may miss migration — ignore */
    }
  }

  return { rewards: full, achievements: newly };
}

export async function listAchievements(userId) {
  const [rows] = await pool.query(
    "SELECT achievement_id, unlocked_at FROM player_achievements WHERE user_id = :userId",
    { userId },
  );
  return rows;
}
