# IRONWAKE Server

Авторитетный сервер боя для **IRONWAKE**.

MySQL хранит аккаунты, гараж, валюты (Сталь / Разведка / Награды), достижения и журнал боёв. Комнаты WebSocket считают симуляцию: **без возрождения**, попадания по модулям.

Публичный адрес: **http://biker9td.beget.tech**

## Стек

- Node.js 22
- MySQL 8 (на Beget — MySQL панели)
- `ws` комнаты 20 Гц
- Google Sign-In (ID token)

## База на Beget — куда прописывать

База **не заливается в public_html**. Она живёт в панели Beget.

1. Панель → **MySQL** → имя `ironwake` → получится `biker9td_ironwake` (логин + `_` + имя).
2. Пароль сохраните. Хост для кода на том же аккаунте: **`localhost`**.
3. Кнопка **phpMyAdmin** → **Импорт** → файл [`sql/001_schema.sql`](sql/001_schema.sql).
4. В корне проекта (рядом с `package.json`, это и есть public_html) скопируйте:
   - `config.local.json.example` → **`config.local.json`**
5. Впишите логин/пароль/имя базы из панели:

```json
{
  "PUBLIC_URL": "http://biker9td.beget.tech",
  "MYSQL_HOST": "localhost",
  "MYSQL_PORT": 3306,
  "MYSQL_USER": "biker9td_ironwake",
  "MYSQL_PASSWORD": "пароль_из_панели",
  "MYSQL_DATABASE": "biker9td_ironwake"
}
```

`config.local.json` не коммитить и не отдавать по HTTP (закрыт в `.htaccess`).

Альтернатива — переменные `MYSQL_HOST` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE`.

## Что было не так с заливкой в public_html

Apache на Beget **не запускает** `node src/index.js`. Он просто отдаёт файлы. Поэтому:

- корень сайта — **403** (не было `index.html`);
- `package.json`, `src/db.js`, `docker-compose.yml` были скачиваемыми;
- MySQL сама не появится, пока её не создать в панели и не импортировать схему.

Нужно: схема в phpMyAdmin + `config.local.json` + запуск Node (Passenger).

## Запуск Node на Beget

[Инструкция Beget](https://beget.com/ru/kb/how-to/web-apps/node-js):

```bash
ssh biker9td@biker9td.beget.tech
ssh localhost -p 222
# поставить Node в ~/.local по статье Beget
cd ~/biker9td.beget.tech   # или путь сайта из панели
npm install
```

В `.htaccess` раскомментируйте блок Passenger:

```
PassengerEnabled On
PassengerAppType node
PassengerStartupFile src/index.js
```

Перезапуск: `mkdir -p tmp && touch tmp/restart.txt`

Проверка: http://biker9td.beget.tech/health — должно быть `{"ok":true,"db":"mysql"}`.

WebSocket боя: `ws://biker9td.beget.tech/ws`

## Docker (не Beget)

```bash
cp .env.example .env
docker compose up --build
```

API: `http://localhost:8787/health`  
WebSocket: `ws://localhost:8787/ws`


## Боевая симуляция (feat/realistic-combat)

- Тик **20 Гц**, авторитетная комната до **32** игроков, режим **last-stand** без респауна (после смерти — spectator).
- Клиент шлёт только ввод (`throttle` / `steer` / `aim*` / `fire`); HP, alive и урон с клиента игнорируются.
- Баллистика снарядов + гравитация; попадания только от серверных projectiles.
- Модули: корпус F/S/R, башня, орудие, двигатель, БК, гусеницы, топливо, оптика; пожар DoT и cook-off.
- Каталог: `GET /catalog/vehicles` · протокол: [PROTOCOL.md](PROTOCOL.md) · дизайн: [DESIGN.md](DESIGN.md).
- Миграция: [`sql/002_combat_rewards.sql`](sql/002_combat_rewards.sql) (после `001_schema.sql`).

Проверка без MySQL:

```bash
node scripts/combat-smoke.mjs
```

## Боты и веб-ангар (feat/bots-and-hangar)

- AI-боты (`BOT-*`, флаг `bot:true` в snapshot) дополняют last-stand комнаты до `BOTS_TARGET` (по умолчанию 6), если есть хотя бы один человек.
- Отключить: `BOTS=0` в env или `config.local.json`. Подробнее: [BOTS.md](BOTS.md).
- Веб-клиент: [`/play`](http://biker9td.beget.tech/play) / [`hangar.html`](http://biker9td.beget.tech/hangar.html) — каталог, `POST /room/join`, poll `/room/state`, ввод `throttle/steer/fire/aim*` (canvas top-down).

```bash
node scripts/combat-smoke.mjs
```


## Beget Passenger (важно)

В `.htaccess` должны быть пути этого аккаунта:

- `PassengerNodejs /home/b/biker9td/biker9td.beget.tech/nodejs/bin/node`
- `PassengerAppRoot /home/b/biker9td/biker9td.beget.tech/public_html`
- `PassengerStartupFile passenger.cjs`

Без `PassengerNodejs` приложение может падать с 500. После деплоя: `touch tmp/restart.txt`, проверка `/health`.
