// seed-batches.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

// ===================== SHIFT FUNCTION =====================
function getShift(hour) {
  if (hour >= 22 || hour < 6) return 1; // Night
  if (hour >= 6 && hour < 14) return 2; // Day
  return 3;                             // Afternoon
}

// ================== CREATE TABLE ==========================
const createTableQuery = `
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  shift INTEGER NOT NULL,

  power_kw REAL,
  steel_ball_kg REAL,

  voltage_ps REAL,
  impeller1_rpm REAL,
  impeller2_rpm REAL,

  current_ps REAL,
  current_impeller1 REAL,
  current_impeller2 REAL,
  current_dust REAL,

  power_impeller1_kw REAL,
  power_impeller2_kw REAL,
  power_dust_kw REAL
);
`;

db.run(createTableQuery, (err) => {
  if (err) console.error("Lỗi tạo bảng:", err);
});

function formatTime(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

// ======================= SEED START ==========================
db.serialize(() => {
  console.log("🧹 Xóa dữ liệu cũ...");
  db.run("DELETE FROM batches");

  const insertQuery = `
    INSERT INTO batches (
      batch_code, date, time, shift,
      power_kw, steel_ball_kg,
      voltage_ps,
      impeller1_rpm, impeller2_rpm,
      current_ps, current_impeller1, current_impeller2, current_dust,
      power_impeller1_kw, power_impeller2_kw, power_dust_kw
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // 2 ngày để test
  const dates = ["2025-12-01", "2025-12-02"];

  const BATCH_DURATION_MIN = 120; // 2 tiếng
  const STEP_MIN = 2;             // 2 phút 1 record
  const STEPS_PER_BATCH = BATCH_DURATION_MIN / STEP_MIN; // 60

  dates.forEach((date) => {
    console.log("📅 SEED NGÀY:", date);

    // MỖI NGÀY RESET LẠI, KHÔNG CHUNG GIỜ VỚI NGÀY KHÁC
    for (let batchIndex = 0; batchIndex < 12; batchIndex++) {
      const batchStartMinutes = batchIndex * BATCH_DURATION_MIN; // 0,120,240,...,1320

      const dateCompact = date.replace(/-/g, "").slice(2);
      const batchCode = `B${dateCompact}_${String(batchIndex).padStart(4, "0")}`;

      console.log(
        `  ▶ Batch ${batchCode} | start=${batchStartMinutes} phút | steps=${STEPS_PER_BATCH}`
      );

      for (let s = 0; s < STEPS_PER_BATCH; s++) {
        const totalMinutes = batchStartMinutes + s * STEP_MIN; // luôn < 1440 vì 12×120 = 1440

        const hour = Math.floor(totalMinutes / 60);
        const minute = totalMinutes % 60;

        const time = formatTime(hour, minute);
        const shift = getShift(hour);

        // Power nhỏ → tổng batch ~ 20–35, hợp trục chart 0–35
        const power_kw = random(0.3, 0.6);
        const steel_ball_kg = random(0.2, 0.5);

        db.run(
          insertQuery,
          [
            batchCode,
            date,
            time,
            shift,
            power_kw,
            steel_ball_kg,
            random(110, 125),
            random(110, 150),
            random(110, 150),
            random(100, 140),
            random(100, 150),
            random(100, 150),
            random(90, 130),
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

  console.log("🎉 SEED HOÀN TẤT: 2 ngày × 12 batch/ngày × 60 record/batch");
  db.close();
});
