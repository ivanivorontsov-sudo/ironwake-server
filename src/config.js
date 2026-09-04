import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fromFile() {
  const p = join(root, "config.local.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    console.error("config.local.json is not valid JSON");
    return {};
  }
}

const file = fromFile();

function val(key, fallback) {
  const v = process.env[key] ?? file[key];
  if (v === undefined || v === null || v === "") return fallback;
  return v;
}

function botsFlag(raw) {
  const s = String(raw).trim().toLowerCase();
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  return true;
}

export const cfg = {
  port: Number(val("PORT", 8787)),
  publicUrl: String(val("PUBLIC_URL", "http://biker9td.beget.tech")).replace(/\/$/, ""),
  mysql: {
    host: val("MYSQL_HOST", "localhost"),
    port: Number(val("MYSQL_PORT", 3306)),
    user: val("MYSQL_USER", "biker9td_ironwake"),
    password: val("MYSQL_PASSWORD", ""),
    database: val("MYSQL_DATABASE", "biker9td_ironwake"),
  },
  googleClientId: val("GOOGLE_CLIENT_ID", ""),
  bots: {
    enabled: botsFlag(val("BOTS", "1")),
    /** Fill last-stand rooms up to this many total players when a human is present. */
    target: Math.max(2, Math.min(32, Number(val("BOTS_TARGET", 6)) || 6)),
  },
};

export function mysqlConfigured() {
  return Boolean(cfg.mysql.user && cfg.mysql.database && cfg.mysql.password);
}
