// db/db.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcryptjs");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

// ===== helper common =====
function makeDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

// ===== seed admin user nếu chưa có =====
function seedAdminUser() {
  db.get(
    "SELECT id FROM users WHERE username = ?",
    ["admin"],
    (err, row) => {
      if (err) {
        console.error("Error checking admin user:", err);
        return;
      }
      if (!row) {
        const hashed = bcrypt.hashSync("123456", 10);
        db.run(
          "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
          ["admin", hashed, "admin"],
          (err2) => {
            if (err2) console.error("Error creating default admin:", err2);
            else
              console.log(
                "Created default admin user: admin / 123456"
              );
          }
        );
      }
    }
  );
}

// ===== seed fake daily report data nếu bảng trống =====
function seedDailyDataIfEmpty() {
  db.get("SELECT COUNT(*) AS count FROM daily_data", (err, row) => {
    if (err) {
      console.error("Error counting daily_data:", err);
      return;
    }
    if (row.count > 0) {
      // đã có data rồi thì thôi
      return;
    }

    console.log("Seeding fake daily report data...");

    const today = new Date();
    const endDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const startDate = new Date(endDate);
    // từ ngày (hôm nay - 10) đến hôm nay
    startDate.setDate(endDate.getDate() - 10);

    db.serialize(() => {
      const stmtDaily = db.prepare(
        `INSERT INTO daily_data
          (date, hour, timeLabel, power, steel, steelUsed, batchId)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      const stmtAlarm = db.prepare(
        `INSERT INTO alarms
          (date, hour, type, location, start, end, details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      let dayIndex = 0;
      for (
        let d = new Date(startDate);
        d.getTime() <= endDate.getTime();
        d.setDate(d.getDate() + 1), dayIndex++
      ) {
        const dateStr = makeDateStr(d);

        const yy = String(d.getFullYear()).slice(2);
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const batchPrefix = `${yy}${mm}${dd}`; // ví dụ 251127

        for (let hour = 0; hour < 24; hour++) {
          const timeLabel = `${String(hour).padStart(2, "0")}:00`;

          const rawPower =
            22 +
            dayIndex * 0.6 +
            8 * Math.sin((hour / 24) * 2 * Math.PI);
          const power = Math.round(clamp(rawPower, 5, 35));

          const rawSteel =
            24 +
            dayIndex * 0.4 +
            6 * Math.cos((hour / 24) * 2 * Math.PI);
          const steel = Math.round(clamp(rawSteel, 5, 35));

          const steelUsed = Math.round(clamp(steel - 5, 5, 35));

          const batchId = `${batchPrefix}_${String(hour).padStart(
            2,
            "0"
          )}00`;

          stmtDaily.run(
            dateStr,
            hour,
            timeLabel,
            power,
            steel,
            steelUsed,
            batchId
          );

          // tạo alarm demo ở 8h & 15h
          if (hour === 8 || hour === 15) {
            const type =
              hour === 8
                ? "Lifetime Warning"
                : "Current Abnormality";
            const location = hour === 8 ? "Impeller 1" : "Impeller 2";
            const start = `${yy}/${mm}/${dd} ${String(
              hour
            ).padStart(2, "0")}:30:00`;
            const end =
              hour === 8
                ? `${yy}/${mm}/${dd} ${String(hour + 1).padStart(
                    2,
                    "0"
                  )}:00:00`
                : `${yy}/${mm}/${dd} ${String(hour).padStart(
                    2,
                    "0"
                  )}:45:00`;
            const details = hour === 8 ? "Overtime" : "";

            stmtAlarm.run(
              dateStr,
              hour,
              type,
              location,
              start,
              end,
              details
            );
          }
        }
      }

      stmtDaily.finalize();
      stmtAlarm.finalize();

      console.log("Seeding fake daily report data completed.");
    });
  });
}

function initDb() {
  db.serialize(() => {
    // bảng users
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL
      )`
    );

    // bảng daily_data
    db.run(
      `CREATE TABLE IF NOT EXISTS daily_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        hour INTEGER NOT NULL,
        timeLabel TEXT NOT NULL,
        power REAL NOT NULL,
        steel REAL NOT NULL,
        steelUsed REAL NOT NULL,
        batchId TEXT NOT NULL
      )`
    );

    // bảng alarms
    db.run(
      `CREATE TABLE IF NOT EXISTS alarms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        hour INTEGER NOT NULL,
        type TEXT NOT NULL,
        location TEXT,
        start TEXT,
        end TEXT,
        details TEXT
      )`
    );
      db.run(`
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_code TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      power_kw REAL,
      steel_ball_kg REAL
    )
  `);

    // seed
    seedAdminUser();
    seedDailyDataIfEmpty();
  });
}

module.exports = {
  db,
  initDb,
};
