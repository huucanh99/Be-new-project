// db/db.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Đường dẫn tới file SQLite
const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

/**
 * initDb:
 * - KHÔNG tạo bảng batches (vì seed-batches.js lo phần đó)
 * - Chỉ tạo bảng alarm_settings (dùng cho Alarm Settings & Dashboard)
 */
function initDb() {
  console.log("✅ SQLite DB connected. Initializing runtime tables...");

  db.serialize(() => {
    // Bảng lưu ngưỡng Upper-Lower cho từng loại bi + từng parameter
    db.run(
      `
      CREATE TABLE IF NOT EXISTS alarm_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steel_ball_type TEXT NOT NULL,   -- Type A / Type B...
        param_key TEXT NOT NULL,         -- steel_ball_weight | current_main | voltage_ps | power_kw
        upper_limit REAL NOT NULL,
        lower_limit REAL NOT NULL,
        unit TEXT NOT NULL,              -- KG | A | V | kW
        UNIQUE (steel_ball_type, param_key)
      )
      `,
      (err) => {
        if (err) {
          console.error("❌ Lỗi tạo bảng alarm_settings:", err.message);
        } else {
          console.log("✅ Bảng alarm_settings đã sẵn sàng.");
        }
      }
    );
  });
}

module.exports = {
  db,
  initDb,
};
