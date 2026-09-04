-- IRONWAKE 002: combat / rewards extensions
-- Import in phpMyAdmin after 001_schema.sql.
-- If a column already exists, skip that ALTER (error is harmless to ignore).

-- Match telemetry for achievements / analytics
ALTER TABLE match_history ADD COLUMN shots INT NOT NULL DEFAULT 0;
ALTER TABLE match_history ADD COLUMN hits INT NOT NULL DEFAULT 0;
ALTER TABLE match_history ADD COLUMN modules_broken INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS achievement_defs (
  id VARCHAR(40) PRIMARY KEY,
  name_en VARCHAR(80) NOT NULL,
  name_ru VARCHAR(80) NOT NULL,
  description VARCHAR(200) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO achievement_defs (id, name_en, name_ru, description) VALUES
  ('first_blood', 'First Blood', 'Первая кровь', 'Get your first kill'),
  ('hat_trick', 'Hat Trick', 'Хет-трик', '3+ kills in one battle'),
  ('iron_wall', 'Iron Wall', 'Железная стена', 'Win without dying'),
  ('module_hunter', 'Module Hunter', 'Охотник за модулями', 'Deal 2000+ damage in one fight'),
  ('last_stand', 'Last Stand', 'Последний рубеж', 'Win a last-stand match'),
  ('sharpshooter', 'Sharpshooter', 'Снайпер', 'Hit ratio >= 50% with 6+ shots'),
  ('scrap_merchant', 'Scrap Merchant', 'Торговец металлоломом', 'Survive with 3+ broken modules'),
  ('veteran_10', 'Veteran', 'Ветеран', 'Play 10 battles'),
  ('sky_reaper', 'Sky Reaper', 'Жнец неба', 'Win in a heli or plane'),
  ('steel_rain', 'Steel Rain', 'Стальной дождь', 'Fire 40+ shells in one match');

CREATE TABLE IF NOT EXISTS vehicle_unlocks (
  vehicle_id VARCHAR(40) PRIMARY KEY,
  steel_cost INT NOT NULL DEFAULT 0,
  intel_cost INT NOT NULL DEFAULT 0,
  class VARCHAR(16) NOT NULL DEFAULT 'tank'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO vehicle_unlocks (vehicle_id, steel_cost, intel_cost, class) VALUES
  ('k72-ural', 0, 0, 'tank'),
  ('m-raptor', 0, 0, 'tank'),
  ('t-84m-vanguard', 45000, 220, 'tank'),
  ('leopard-x', 52000, 260, 'tank'),
  ('btr-iron', 18000, 80, 'apc'),
  ('wolf-jeep', 8000, 30, 'car'),
  ('ka-scythe', 62000, 340, 'heli'),
  ('ah-spectre', 68000, 380, 'heli'),
  ('su-talon', 90000, 520, 'plane'),
  ('a10-hammer', 85000, 480, 'plane');

-- Optional mode expand (ignore if enum already updated)
-- ALTER TABLE rooms MODIFY COLUMN mode ENUM('laststand','assault','skirmish') NOT NULL DEFAULT 'laststand';
