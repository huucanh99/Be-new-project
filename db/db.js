// db.js
// Runtime DB initializer: creates tables/views/triggers/indexes when BE starts.
// - Import this file in your server entry and call initDb() once.
// - Keep this file schema-only (no dev reset). Seed data should be done by seed.js.

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

function initDb() {
  console.log("✅ SQLite DB connected. Initializing schema...");

  // ===================== TABLES =====================

  // Alarm threshold settings
  const createAlarmSettings = `
    CREATE TABLE IF NOT EXISTS alarm_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steel_ball_type TEXT NOT NULL,
      param_key TEXT NOT NULL,
      upper_limit REAL NOT NULL,
      lower_limit REAL NOT NULL,
      unit TEXT NOT NULL,
      UNIQUE(steel_ball_type, param_key)
    );
  `;

  // Component life tracking
  const createComponentLife = `
    CREATE TABLE IF NOT EXISTS component_life (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component_name TEXT NOT NULL UNIQUE,
      accumulated_hours REAL NOT NULL DEFAULT 0,
      warning_hours REAL NOT NULL DEFAULT 0,
      last_reset_at TEXT
    );
  `;

  // Alarm history
  const createAlarms = `
    CREATE TABLE IF NOT EXISTS alarms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      location TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      details TEXT
    );
  `;

  // Tick state (for time compensation)
  const createTickState = `
    CREATE TABLE IF NOT EXISTS tick_state (
      key TEXT PRIMARY KEY,
      last_tick_at INTEGER NOT NULL
    );
  `;

  // Raw time-series table (append-only)
  const createBatchesRaw = `
    CREATE TABLE IF NOT EXISTS batches_raw (
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

  // Steel type settings
  const createSteelTypeSettings = `
    CREATE TABLE IF NOT EXISTS steel_type_settings (
      steel_ball_type TEXT PRIMARY KEY,
      carbon_coefficient REAL NOT NULL,
      carbon_unit TEXT DEFAULT 'kgCO2/kWh',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `;

  // Users (login + role)
  const createUsers = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','customer')) NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `;

  // ===================== OPTION B (AUDIT SAFE) =====================

  // Logical delete (tombstone) for batches_raw
  const createBatchesTombstone = `
    CREATE TABLE IF NOT EXISTS batches_tombstone (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_id INTEGER NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_by INTEGER,
      reason TEXT,
      UNIQUE(raw_id)
    );
  `;

  // Override log (nullable columns; last record wins)
  const createBatchesOverride = `
    CREATE TABLE IF NOT EXISTS batches_override (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_id INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER,
      reason TEXT,

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

  // Effective view (raw minus tombstone, plus latest override)
  const createBatchesEffectiveView = `
    CREATE VIEW IF NOT EXISTS batches_effective AS
    WITH last_override AS (
      SELECT raw_id, MAX(id) AS max_id
      FROM batches_override
      GROUP BY raw_id
    )
    SELECT
      r.id,
      r.batch_code,
      r.date,
      r.time,
      r.shift,

      COALESCE(o.steel_ball_type, r.steel_ball_type) AS steel_ball_type,

      COALESCE(o.power_kw, r.power_kw) AS power_kw,
      COALESCE(o.steel_ball_kg, r.steel_ball_kg) AS steel_ball_kg,

      COALESCE(o.voltage_ps, r.voltage_ps) AS voltage_ps,
      COALESCE(o.impeller1_rpm, r.impeller1_rpm) AS impeller1_rpm,
      COALESCE(o.impeller2_rpm, r.impeller2_rpm) AS impeller2_rpm,

      COALESCE(o.current_ps, r.current_ps) AS current_ps,
      COALESCE(o.current_impeller1, r.current_impeller1) AS current_impeller1,
      COALESCE(o.current_impeller2, r.current_impeller2) AS current_impeller2,
      COALESCE(o.current_dust, r.current_dust) AS current_dust,

      COALESCE(o.current_main, r.current_main) AS current_main,

      COALESCE(o.power_ps, r.power_ps) AS power_ps,
      COALESCE(o.power_impeller1_kw, r.power_impeller1_kw) AS power_impeller1_kw,
      COALESCE(o.power_impeller2_kw, r.power_impeller2_kw) AS power_impeller2_kw,
      COALESCE(o.power_dust_kw, r.power_dust_kw) AS power_dust_kw
    FROM batches_raw r
    LEFT JOIN batches_tombstone t
      ON t.raw_id = r.id
    LEFT JOIN last_override lo
      ON lo.raw_id = r.id
    LEFT JOIN batches_override o
      ON o.raw_id = r.id AND o.id = lo.max_id
    WHERE t.raw_id IS NULL;
  `;

  // Guard rails: prevent UPDATE/DELETE on raw
  const createNoDeleteTrigger = `
    CREATE TRIGGER IF NOT EXISTS trg_batches_raw_no_delete
    BEFORE DELETE ON batches_raw
    BEGIN
      SELECT RAISE(ABORT, 'DELETE is not allowed on batches_raw');
    END;
  `;

  const createNoUpdateTrigger = `
    CREATE TRIGGER IF NOT EXISTS trg_batches_raw_no_update
    BEFORE UPDATE ON batches_raw
    BEGIN
      SELECT RAISE(ABORT, 'UPDATE is not allowed on batches_raw');
    END;
  `;

  // ===================== INDEXES =====================
  const createIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_batches_raw_date_time ON batches_raw(date, time);`,
    `CREATE INDEX IF NOT EXISTS idx_batches_raw_batch_code ON batches_raw(batch_code);`,
    `CREATE INDEX IF NOT EXISTS idx_batches_tombstone_raw_id ON batches_tombstone(raw_id);`,
    `CREATE INDEX IF NOT EXISTS idx_batches_override_raw_id ON batches_override(raw_id);`,
    `CREATE INDEX IF NOT EXISTS idx_alarms_start_time ON alarms(start_time);`,
  ];

  db.serialize(() => {
    // Create tables
    db.run(createAlarmSettings);
    db.run(createComponentLife);
    db.run(createAlarms);
    db.run(createTickState);

    db.run(createBatchesRaw);
    db.run(createSteelTypeSettings);
    db.run(createUsers);

    // Option B tables
    db.run(createBatchesTombstone);
    db.run(createBatchesOverride);

    // View + triggers (after tables exist)
    db.run(createBatchesEffectiveView);
    db.run(createNoDeleteTrigger);
    db.run(createNoUpdateTrigger);

    // Indexes
    createIndexes.forEach((q) => db.run(q));

    // Minimal operational seed: tick_state baseline
    const seedTickState = `
      INSERT OR IGNORE INTO tick_state(key, last_tick_at)
      VALUES ('component_life', strftime('%s','now') * 1000)
    `;
    db.run(seedTickState);

    console.log("✅ DB schema ready.");
  });
}

module.exports = {
  db,
  initDb,
  dbPath,
};
