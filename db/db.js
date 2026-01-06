// db/db.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

function initDb() {
  console.log("✅ SQLite DB connected. Initializing runtime tables...");

  // Bảng alarm_settings
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

  // 🔹 Bảng component_life
  const createComponentLife = `
    CREATE TABLE IF NOT EXISTS component_life (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component_name TEXT NOT NULL UNIQUE,
      accumulated_hours REAL NOT NULL DEFAULT 0,
      warning_hours REAL NOT NULL DEFAULT 0,
      last_reset_at TEXT
    );
  `;

  // 🔹 Bảng lưu lịch sử cảnh báo
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

  // ✅ NEW: tick_state (lưu mốc tick cuối để BE tự bù giờ)
  const createTickState = `
    CREATE TABLE IF NOT EXISTS tick_state (
      key TEXT PRIMARY KEY,
      last_tick_at INTEGER NOT NULL
    );
  `;

  db.serialize(() => {
    db.run(createAlarmSettings, (err) => {
      if (err) console.error("❌ Error create alarm_settings:", err);
      else console.log("✅ Bảng alarm_settings đã sẵn sàng.");
    });

    db.run(createComponentLife, (err) => {
      if (err) console.error("❌ Error create component_life:", err);
      else console.log("✅ Bảng component_life đã sẵn sàng.");
    });

    db.run(createAlarms, (err) => {
      if (err) console.error("❌ Error create alarms:", err);
      else console.log("✅ Bảng alarms đã sẵn sàng.");
    });

    // ✅ create tick_state
    db.run(createTickState, (err) => {
      if (err) console.error("❌ Error create tick_state:", err);
      else console.log("✅ Bảng tick_state đã sẵn sàng.");
    });

    // ✅ seed tick_state (1 dòng key='component_life')
    const seedTickState = `
      INSERT OR IGNORE INTO tick_state(key, last_tick_at)
      VALUES ('component_life', strftime('%s','now') * 1000)
    `;
    db.run(seedTickState, (err) => {
      if (err) console.error("❌ Error seed tick_state:", err);
      else console.log("✅ Seed xong tick_state (component_life).");
    });

    // 🔹 Seed component_life nếu trống
    const checkSeed = `SELECT COUNT(*) AS cnt FROM component_life`;
    db.get(checkSeed, [], (err, row) => {
      if (err) {
        console.error("❌ Error check component_life:", err);
        return;
      }
      if (row.cnt === 0) {
        console.log("🌱 Seeding component_life...");
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
          if (err2) console.error("❌ Error seed component_life:", err2);
          else console.log("✅ Seed xong component_life.");
        });
      }
    });
  });
}

module.exports = {
  db,
  initDb,
};
