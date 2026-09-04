/**
 * Beget Passenger entry (CommonJS) that boots the ESM app.
 * Prefer listen('passenger') when PhusionPassenger is present.
 */
if (typeof PhusionPassenger !== "undefined") {
  PhusionPassenger.configure({ autoInstall: false });
  process.env.IRONWAKE_PASSENGER = "1";
}

import("./src/index.js").catch((err) => {
  console.error("IRONWAKE passenger boot failed", err);
  process.exit(1);
});
