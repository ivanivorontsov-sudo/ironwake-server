/**
 * Beget Passenger entry (CommonJS) → ESM app.
 * Always mark Passenger mode: shared hosting forbids binding :8787.
 */
process.env.IRONWAKE_PASSENGER = "1";

const fs = require("fs");
const path = require("path");
const logFile = path.join(__dirname, "tmp", "boot.log");

function log(msg, err) {
  try {
    fs.mkdirSync(path.join(__dirname, "tmp"), { recursive: true });
    fs.appendFileSync(
      logFile,
      new Date().toISOString() + " " + msg + (err ? " " + String(err.stack || err) : "") + "\n"
    );
  } catch (_) {}
  if (err) console.error(msg, err);
}

log("boot start passenger=" + typeof PhusionPassenger + " node=" + process.version);

if (typeof PhusionPassenger !== "undefined") {
  try {
    PhusionPassenger.configure({ autoInstall: false });
    log("configure ok");
  } catch (e) {
    log("configure fail", e);
  }
}

import("./src/index.js")
  .then(() => log("import ok"))
  .catch((err) => {
    log("import fail", err);
    process.exit(1);
  });
