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
};

export function mysqlConfigured() {
  return Boolean(cfg.mysql.user && cfg.mysql.database && cfg.mysql.password);
}
