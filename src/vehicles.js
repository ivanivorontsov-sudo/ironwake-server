/**
 * IRONWAKE vehicle catalog — tanks, APC/cars, helis, attack planes.
 * Costs in steel / intel. Stats feed authoritative combat sim.
 */

/** @typedef {{ front: number, side: number, rear: number }} Armor */

/**
 * @typedef {object} VehicleDef
 * @property {string} id
 * @property {string} name
 * @property {'tank'|'apc'|'car'|'heli'|'plane'} class
 * @property {{ steel: number, intel: number }} cost
 * @property {number} hp
 * @property {number} mass
 * @property {number} speed max m/s ground / cruise
 * @property {number} turnRate rad/s hull
 * @property {number} turretTurnRate rad/s
 * @property {Armor} armor mm RHA-ish
 * @property {object} gun
 * @property {number} fuelCapacity
 * @property {number} ammoCapacity
 * @property {string[]} starter starter unlocks if true in owned
 * @property {boolean} [starter]
 */

/** @type {Record<string, VehicleDef>} */
export const VEHICLES = {
  "k72-ural": {
    id: "k72-ural",
    name: "K-72 Ural",
    class: "tank",
    cost: { steel: 0, intel: 0 },
    starter: true,
    hp: 1800,
    mass: 42000,
    speed: 14,
    turnRate: 0.75,
    turretTurnRate: 0.9,
    armor: { front: 220, side: 110, rear: 55 },
    gun: {
      caliber: 125,
      muzzleVelocity: 820,
      reload: 7.5,
      pen: 290,
      damage: 420,
      gravity: 9.81,
      shellMass: 23,
      maxRange: 4200,
    },
    fuelCapacity: 100,
    ammoCapacity: 28,
  },
  "m-raptor": {
    id: "m-raptor",
    name: "M-Raptor",
    class: "tank",
    cost: { steel: 0, intel: 0 },
    starter: true,
    hp: 1650,
    mass: 38000,
    speed: 16,
    turnRate: 0.85,
    turretTurnRate: 1.05,
    armor: { front: 200, side: 100, rear: 50 },
    gun: {
      caliber: 120,
      muzzleVelocity: 860,
      reload: 6.8,
      pen: 275,
      damage: 390,
      gravity: 9.81,
      shellMass: 19,
      maxRange: 4000,
    },
    fuelCapacity: 95,
    ammoCapacity: 32,
  },
  "t-84m-vanguard": {
    id: "t-84m-vanguard",
    name: "T-84M Vanguard",
    class: "tank",
    cost: { steel: 45000, intel: 220 },
    hp: 2100,
    mass: 48000,
    speed: 13,
    turnRate: 0.7,
    turretTurnRate: 0.85,
    armor: { front: 280, side: 140, rear: 65 },
    gun: {
      caliber: 125,
      muzzleVelocity: 900,
      reload: 7.2,
      pen: 340,
      damage: 480,
      gravity: 9.81,
      shellMass: 24,
      maxRange: 4500,
    },
    fuelCapacity: 110,
    ammoCapacity: 36,
  },
  "leopard-x": {
    id: "leopard-x",
    name: "Leopard-X",
    class: "tank",
    cost: { steel: 52000, intel: 260 },
    hp: 1950,
    mass: 45000,
    speed: 17,
    turnRate: 0.8,
    turretTurnRate: 1.1,
    armor: { front: 260, side: 120, rear: 60 },
    gun: {
      caliber: 120,
      muzzleVelocity: 940,
      reload: 6.2,
      pen: 355,
      damage: 460,
      gravity: 9.81,
      shellMass: 18,
      maxRange: 4600,
    },
    fuelCapacity: 100,
    ammoCapacity: 40,
  },
  "btr-iron": {
    id: "btr-iron",
    name: "BTR-Iron",
    class: "apc",
    cost: { steel: 18000, intel: 80 },
    hp: 950,
    mass: 14000,
    speed: 22,
    turnRate: 1.2,
    turretTurnRate: 1.4,
    armor: { front: 80, side: 45, rear: 30 },
    gun: {
      caliber: 30,
      muzzleVelocity: 980,
      reload: 0.35,
      pen: 95,
      damage: 85,
      gravity: 9.81,
      shellMass: 0.4,
      maxRange: 2200,
      burst: true,
    },
    fuelCapacity: 80,
    ammoCapacity: 180,
  },
  "wolf-jeep": {
    id: "wolf-jeep",
    name: "Wolf Jeep",
    class: "car",
    cost: { steel: 8000, intel: 30 },
    hp: 420,
    mass: 3200,
    speed: 28,
    turnRate: 1.8,
    turretTurnRate: 2.0,
    armor: { front: 25, side: 15, rear: 10 },
    gun: {
      caliber: 12.7,
      muzzleVelocity: 850,
      reload: 0.12,
      pen: 35,
      damage: 40,
      gravity: 9.81,
      shellMass: 0.05,
      maxRange: 1400,
      burst: true,
    },
    fuelCapacity: 60,
    ammoCapacity: 400,
  },
  "ka-scythe": {
    id: "ka-scythe",
    name: "Ka-Scythe",
    class: "heli",
    cost: { steel: 62000, intel: 340 },
    hp: 1100,
    mass: 9800,
    speed: 55,
    turnRate: 1.4,
    turretTurnRate: 1.6,
    armor: { front: 40, side: 30, rear: 25 },
    gun: {
      caliber: 30,
      muzzleVelocity: 900,
      reload: 0.2,
      pen: 110,
      damage: 120,
      gravity: 9.81,
      shellMass: 0.4,
      maxRange: 2500,
      burst: true,
    },
    fuelCapacity: 120,
    ammoCapacity: 250,
    flight: { climb: 12, ceiling: 2800 },
  },
  "ah-spectre": {
    id: "ah-spectre",
    name: "AH-Spectre",
    class: "heli",
    cost: { steel: 68000, intel: 380 },
    hp: 1050,
    mass: 9200,
    speed: 58,
    turnRate: 1.5,
    turretTurnRate: 1.8,
    armor: { front: 35, side: 28, rear: 22 },
    gun: {
      caliber: 20,
      muzzleVelocity: 1000,
      reload: 0.08,
      pen: 70,
      damage: 55,
      gravity: 9.81,
      shellMass: 0.1,
      maxRange: 2000,
      burst: true,
    },
    fuelCapacity: 115,
    ammoCapacity: 500,
    flight: { climb: 14, ceiling: 3000 },
  },
  "su-talon": {
    id: "su-talon",
    name: "Su-Talon",
    class: "plane",
    cost: { steel: 90000, intel: 520 },
    hp: 880,
    mass: 16000,
    speed: 140,
    turnRate: 1.1,
    turretTurnRate: 0,
    armor: { front: 20, side: 15, rear: 12 },
    gun: {
      caliber: 30,
      muzzleVelocity: 1100,
      reload: 0.1,
      pen: 130,
      damage: 140,
      gravity: 9.81,
      shellMass: 0.4,
      maxRange: 3200,
      burst: true,
    },
    fuelCapacity: 140,
    ammoCapacity: 300,
    flight: { climb: 35, ceiling: 9000 },
  },
  "a10-hammer": {
    id: "a10-hammer",
    name: "A-10 Hammer",
    class: "plane",
    cost: { steel: 85000, intel: 480 },
    hp: 1200,
    mass: 18000,
    speed: 110,
    turnRate: 0.9,
    turretTurnRate: 0,
    armor: { front: 45, side: 35, rear: 30 },
    gun: {
      caliber: 30,
      muzzleVelocity: 990,
      reload: 0.05,
      pen: 150,
      damage: 95,
      gravity: 9.81,
      shellMass: 0.4,
      maxRange: 2800,
      burst: true,
    },
    fuelCapacity: 150,
    ammoCapacity: 600,
    flight: { climb: 22, ceiling: 7500 },
  },
};

export const STARTER_VEHICLES = Object.values(VEHICLES)
  .filter((v) => v.starter)
  .map((v) => v.id);

export function getVehicle(id) {
  return VEHICLES[id] || VEHICLES["k72-ural"];
}

export function listVehicles() {
  return Object.values(VEHICLES).map((v) => ({
    id: v.id,
    name: v.name,
    class: v.class,
    cost: v.cost,
    starter: Boolean(v.starter),
    hp: v.hp,
    speed: v.speed,
    armor: v.armor,
    gun: {
      caliber: v.gun.caliber,
      reload: v.gun.reload,
      pen: v.gun.pen,
      damage: v.gun.damage,
    },
  }));
}

/** Default module HP fractions (1 = intact). */
export const MODULE_KEYS = [
  "hull_f",
  "hull_s",
  "hull_r",
  "turret",
  "gun",
  "engine",
  "ammo",
  "track_l",
  "track_r",
  "fuel",
  "optics",
];

export function freshModules() {
  const m = {};
  for (const k of MODULE_KEYS) m[k] = 1;
  return m;
}
