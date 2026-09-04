import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "ironwake",
  password: process.env.MYSQL_PASSWORD ?? "ironwake",
  database: process.env.MYSQL_DATABASE ?? "ironwake",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

export async function waitForDb() {
  for (let i = 0; i < 30; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("MySQL not reachable");
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
  for (const v of ["k72-ural", "m-raptor"]) {
    await pool.query("INSERT IGNORE INTO owned_vehicles (user_id, vehicle_id) VALUES (:id, :v)", {
      id,
      v,
    });
  }
  const [created] = await pool.query("SELECT * FROM users WHERE id = :id", { id });
  return created[0];
}

export async function saveMatch(userId, report) {
  await pool.query(
    `INSERT INTO match_history
      (user_id, result, reason, vehicle_id, kills, damage, duration_sec, steel_earned, intel_earned, xp_earned)
     VALUES (:userId, :result, :reason, :vehicleId, :kills, :damage, :duration, :steel, :intel, :xp)`,
    { userId, ...report },
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
      steel: report.steel,
      intel: report.intel,
      xp: report.xp,
      win: report.result === "victory" ? 1 : 0,
      kills: report.kills,
      deaths: report.deaths,
    },
  );
}
