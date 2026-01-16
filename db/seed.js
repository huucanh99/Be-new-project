// seed-batches.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcrypt");

const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

/**
 * Determines shift number based on hour of day.
 */
function getShift(hour) {
  if (hour >= 22 || hour < 6) return 1;
  if (hour >= 6 && hour < 14) return 2;
  return 3;
}

/**
 * Formats hour and minute into HH:mm string.
 */
function formatTime(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Generates a random floating-point number between min and max.
 */
function random(min, max) {
  return Math.random() * (max - min) + min;
}

const createBatchesTableQuery = `
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  shift INTEGER NOT NULL,
  steel_ball_type TEXT,
  power_kw REAL,
  steel_ball_kg REAL,
  voltage_ps REAL,
  impeller1_rpm REAL,
  impeller2_rpm REAL,
  current_ps REAL,
  current_impeller1 REAL,
  current_impeller2 REAL,
  current_dust REAL,
  current_main REAL,
  power_ps REAL,
  power_impeller1_kw REAL,
  power_impeller2_kw REAL,
  power_dust_kw REAL
);
`;

const createSteelTypeSettingsTableQuery = `
CREATE TABLE IF NOT EXISTS steel_type_settings (
  steel_ball_type TEXT PRIMARY KEY,
  carbon_coefficient REAL NOT NULL,
  carbon_unit TEXT DEFAULT 'kgCO2/kWh',
  updated_at TEXT DEFAULT (datetime('now'))
);
`;

const createUsersTableQuery = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin','customer')) NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

db.serialize(() => {
  db.run(createBatchesTableQuery, (err) => {
    if (err) console.error("Failed to create batches table:", err);
  });

  db.run(createSteelTypeSettingsTableQuery, (err) => {
    if (err) console.error("Failed to create steel_type_settings table:", err);
  });

  db.run(createUsersTableQuery, (err) => {
    if (err) console.error("Failed to create users table:", err);
  });

  db.run(`ALTER TABLE batches ADD COLUMN steel_ball_type TEXT`, (err) => {
    if (err && !String(err.message || "").includes("duplicate column")) {
      console.error("Failed to alter batches table:", err.message);
    }
  });

  console.log("Clearing existing seed data...");
  db.run("DELETE FROM batches");
  db.run("DELETE FROM steel_type_settings");

  const typeSettings = [
    { type: "Type A", coeff: 0.52, unit: "kgCO2/kWh" },
    { type: "Type B", coeff: 0.60, unit: "kgCO2/kWh" },
    { type: "Type C", coeff: 0.48, unit: "kgCO2/kWh" },
  ];

  const GLOBAL_STEEL_BALL_TYPE = "Type A";

  const insertTypeSetting = db.prepare(`
    INSERT INTO steel_type_settings (steel_ball_type, carbon_coefficient, carbon_unit)
    VALUES (?, ?, ?)
  `);

  typeSettings.forEach((x) => {
    insertTypeSetting.run(x.type, x.coeff, x.unit);
  });

  insertTypeSetting.finalize();

  (async () => {
    try {
      const adminHash = await bcrypt.hash("admin123", 10);
      const customerHash = await bcrypt.hash("123456", 10);

      db.run(
        `INSERT OR IGNORE INTO users(username, password_hash, role) VALUES (?,?,?)`,
        ["admin", adminHash, "admin"],
        (err) => err && console.error("Seed admin error:", err.message)
      );

      db.run(
        `INSERT OR IGNORE INTO users(username, password_hash, role) VALUES (?,?,?)`,
        ["customer", customerHash, "customer"],
        (err) => err && console.error("Seed customer error:", err.message)
      );

      console.log("Users seeded.");
    } catch (e) {
      console.error("User seeding failed:", e.message);
    }
  })();

  const insertQuery = `
    INSERT INTO batches (
      batch_code, date, time, shift,
      steel_ball_type,
      power_kw, steel_ball_kg,
      voltage_ps,
      impeller1_rpm, impeller2_rpm,
      current_ps, current_impeller1, current_impeller2, current_dust,
      current_main,
      power_ps,
      power_impeller1_kw, power_impeller2_kw, power_dust_kw
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const dates = ["2025-12-01", "2025-12-02"];

  const BATCH_DURATION_MIN = 120;
  const STEP_MIN = 2;
  const STEPS_PER_BATCH = BATCH_DURATION_MIN / STEP_MIN;

  dates.forEach((date) => {
    for (let batchIndex = 0; batchIndex < 12; batchIndex++) {
      const batchStartMinutes = batchIndex * BATCH_DURATION_MIN;
      const dateCompact = date.replace(/-/g, "").slice(2);
      const batchCode = `B${dateCompact}_${String(batchIndex).padStart(4, "0")}`;
      const steelBallType = GLOBAL_STEEL_BALL_TYPE;

      for (let s = 0; s < STEPS_PER_BATCH; s++) {
        const totalMinutes = batchStartMinutes + s * STEP_MIN;
        const hour = Math.floor(totalMinutes / 60);
        const minute = totalMinutes % 60;

        const time = formatTime(hour, minute);
        const shift = getShift(hour);

        const power_kw = random(0.3, 0.6);
        const steel_ball_kg = random(0.2, 0.5);

        const wave = Math.sin((s / STEPS_PER_BATCH) * Math.PI * 2) * 0.12;
        const noise = random(-0.01, 0.01);
        let current_main = 1.15 + wave + noise;

        if (current_main < 1.0) current_main = 1.0;
        if (current_main > 1.3) current_main = 1.3;
        current_main = Number(current_main.toFixed(3));

        const power_ps = power_kw;

        db.run(
          insertQuery,
          [
            batchCode,
            date,
            time,
            shift,
            steelBallType,
            power_kw,
            Number(steel_ball_kg.toFixed(3)),
            random(110, 125),
            random(110, 150),
            random(110, 150),
            random(100, 140),
            random(100, 150),
            random(100, 150),
            random(90, 130),
            current_main,
            power_ps,
            random(15, 30),
            random(15, 30),
            random(10, 25),
          ],
          (err) => {
            if (err) console.error("Insert error:", err);
          }
        );
      }
    }
  });

  console.log("Batch seeding completed.");

  setTimeout(() => {
    db.close();
  }, 300);
});
