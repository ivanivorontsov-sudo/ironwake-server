/**
 * Achievement definitions + unlock evaluation from match reports.
 */

export const ACHIEVEMENTS = {
  first_blood: {
    id: "first_blood",
    name: "First Blood",
    nameRu: "Первая кровь",
    desc: "Get your first kill",
    check: (r, u) => r.kills >= 1 || (u?.kills ?? 0) + r.kills >= 1,
  },
  hat_trick: {
    id: "hat_trick",
    name: "Hat Trick",
    nameRu: "Хет-трик",
    desc: "3+ kills in one battle",
    check: (r) => r.kills >= 3,
  },
  iron_wall: {
    id: "iron_wall",
    name: "Iron Wall",
    nameRu: "Железная стена",
    desc: "Win without dying",
    check: (r) => r.result === "victory" && r.deaths === 0,
  },
  module_hunter: {
    id: "module_hunter",
    name: "Module Hunter",
    nameRu: "Охотник за модулями",
    desc: "Deal 2000+ damage in one fight",
    check: (r) => r.damage >= 2000,
  },
  last_stand: {
    id: "last_stand",
    name: "Last Stand",
    nameRu: "Последний рубеж",
    desc: "Win a last-stand match",
    check: (r) => r.result === "victory" && r.reason === "laststand",
  },
  sharpshooter: {
    id: "sharpshooter",
    name: "Sharpshooter",
    nameRu: "Снайпер",
    desc: "Hit ratio >= 50% with 6+ shots",
    check: (r) => r.shots >= 6 && r.hits / r.shots >= 0.5,
  },
  scrap_merchant: {
    id: "scrap_merchant",
    name: "Scrap Merchant",
    nameRu: "Торговец металлоломом",
    desc: "Survive with 3+ broken modules",
    check: (r) => r.deaths === 0 && (r.modulesBroken || 0) >= 3,
  },
  veteran_10: {
    id: "veteran_10",
    name: "Veteran",
    nameRu: "Ветеран",
    desc: "Play 10 battles",
    check: (_r, u) => (u?.battles ?? 0) >= 9, // after this match → 10
  },
  sky_reaper: {
    id: "sky_reaper",
    name: "Sky Reaper",
    nameRu: "Жнец неба",
    desc: "Win in a heli or plane",
    check: (r) =>
      r.result === "victory" &&
      (String(r.vehicleId).includes("ka-") ||
        String(r.vehicleId).includes("ah-") ||
        String(r.vehicleId).includes("su-") ||
        String(r.vehicleId).includes("a10")),
  },
  steel_rain: {
    id: "steel_rain",
    name: "Steel Rain",
    nameRu: "Стальной дождь",
    desc: "Fire 40+ shells in one match",
    check: (r) => r.shots >= 40,
  },
};

/** Compute post-match rewards (steel / intel / xp). */
export function computeRewards(report) {
  const win = report.result === "victory";
  let steel = win ? 1200 : 450;
  let intel = win ? 18 : 6;
  let xp = win ? 220 : 90;
  steel += report.kills * 350;
  intel += report.kills * 4;
  xp += report.kills * 60;
  steel += Math.min(2000, Math.floor(report.damage / 10));
  xp += Math.min(400, Math.floor(report.damage / 20));
  if (report.deaths === 0 && win) {
    steel += 500;
    intel += 10;
    xp += 100;
  }
  return {
    steel_earned: steel,
    intel_earned: intel,
    xp_earned: xp,
    steel,
    intel,
    xp,
  };
}

export function evaluateAchievements(report, userRow) {
  const unlocked = [];
  for (const a of Object.values(ACHIEVEMENTS)) {
    try {
      if (a.check(report, userRow)) unlocked.push(a.id);
    } catch {
      /* ignore */
    }
  }
  return unlocked;
}
