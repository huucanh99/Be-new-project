// db/db.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

/**
 * Initializes database schema and seeds required runtime tables.
 */
function initDb() {
  console.log("SQLite DB connected. Initializing tables...");

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

  const createComponentLife = `
    CREATE TABLE IF NOT EXISTS component_life (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component_name TEXT NOT NULL UNIQUE,
      accumulated_hours REAL NOT NULL DEFAULT 0,
      warning_hours REAL NOT NULL DEFAULT 0,
      last_reset_at TEXT
    );
  `;

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

  const createTickState = `
    CREATE TABLE IF NOT EXISTS tick_state (
      key TEXT PRIMARY KEY,
      last_tick_at INTEGER NOT NULL
    );
  `;

  db.serialize(() => {
    db.run(createAlarmSettings, (err) => {
      if (err) console.error("Failed to create alarm_settings:", err);
      else console.log("alarm_settings table ready.");
    });

    db.run(createComponentLife, (err) => {
      if (err) console.error("Failed to create component_life:", err);
      else console.log("component_life table ready.");
    });

    db.run(createAlarms, (err) => {
      if (err) console.error("Failed to create alarms:", err);
      else console.log("alarms table ready.");
    });

    db.run(createTickState, (err) => {
      if (err) console.error("Failed to create tick_state:", err);
      else console.log("tick_state table ready.");
    });

    const seedTickState = `
      INSERT OR IGNORE INTO tick_state(key, last_tick_at)
      VALUES ('component_life', strftime('%s','now') * 1000)
    `;

    db.run(seedTickState, (err) => {
      if (err) console.error("Failed to seed tick_state:", err);
      else console.log("tick_state seeded (component_life).");
    });

    const checkSeed = `SELECT COUNT(*) AS cnt FROM component_life`;
    db.get(checkSeed, [], (err, row) => {
      if (err) {
        console.error("Failed to check component_life:", err);
        return;
      }

      if (row.cnt === 0) {
        console.log("Seeding component_life table...");

        const insertSql = `
          INSERT INTO component_life (component_name, accumulated_hours, warning_hours)
          VALUES 
            ('impeller1',  0, 1),
            ('impeller2',  0, 100),
            ('blade1',     0, 80),
            ('blade2',     0, 80),
            ('claw1',      0, 60),
            ('claw2',      0, 60),
            ('clawTube1',  0, 60),
            ('clawTube2',  0, 60),
            ('filter',     0, 50)
        `;

        db.run(insertSql, (err2) => {
          if (err2) console.error("Failed to seed component_life:", err2);
          else console.log("component_life seeded.");
        });
      }
    });
  });
}

module.exports = {
  db,
  initDb,
};
