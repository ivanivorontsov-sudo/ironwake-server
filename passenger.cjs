/**
 * Beget Passenger entry (CommonJS) → ESM app.
 * Always mark Passenger mode: shared hosting forbids binding :8787.
 */
process.env.IRONWAKE_PASSENGER = "1";

if (typeof PhusionPassenger !== "undefined") {
  PhusionPassenger.configure({ autoInstall: false });
}

import("./src/index.js").catch((err) => {
  console.error("IRONWAKE passenger boot failed", err);
  process.exit(1);
});
