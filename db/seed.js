// seed-batches.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

// ===================== SHIFT FUNCTION =====================
function getShift(hour) {
  // Shift 1: 22 → 23 + 0 → 5
  if (hour >= 22 || hour < 6) return 1;

  // Shift 2: 6 → 13
  if (hour >= 6 && hour < 14) return 2;

  // Shift 3: 14 → 21
  return 3;
}

// ============ CREATE TABLE (full schema with shift) =================
const createTableQuery = `
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  shift INTEGER NOT NULL,

  -- Base
  power_kw REAL,
  steel_ball_kg REAL,

  -- Voltage
  voltage_ps REAL,

  -- Rotation Speed
  impeller1_rpm REAL,
  impeller2_rpm REAL,

  -- Current
  current_ps REAL,
  current_impeller1 REAL,
  current_impeller2 REAL,
  current_dust REAL,

  -- Power (kW)
  power_impeller1_kw REAL,
  power_impeller2_kw REAL,
  power_dust_kw REAL
)
`;

db.run(createTableQuery, (err) => {
  if (err) return console.error("Lỗi tạo bảng:", err);
});

function formatTime(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// random float
function random(min, max) {
  return Math.random() * (max - min) + min;
}

// random integer EVEN (số chẵn)
function randomEven(min, max) {
  const r = Math.floor(Math.random() * (max - min + 1)) + min; // int
  return r % 2 === 0 ? r : r + 1 > max ? r - 1 : r + 1; // ép thành số chẵn trong khoảng
}

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

  const date = "2025-12-01";
  const dateCompact = date.replace(/-/g, "").slice(2);

  const totalBatches = 15 + Math.floor(Math.random() * 6);

  let currentHour = 0;
  let currentMinute = 0;
  let batchIndex = 0;

  console.log(`🚀 Seed ${totalBatches} batch`);

  while (currentHour < 24 && batchIndex < totalBatches) {
    const batchCode = `B${dateCompact}_${String(batchIndex).padStart(4, "0")}`;

    const durationMinutes = (4 + Math.floor(Math.random() * 8)) * 10; // 40–120 minutes
    const steps = durationMinutes / 10;

    console.log(`▶ Batch ${batchCode} | steps=${steps}`);

    for (let s = 0; s < steps; s++) {
      if (currentHour >= 24) break;

      const time = formatTime(currentHour, currentMinute);
      const shift = getShift(currentHour);

      // ====== CHỈNH Ở ĐÂY: power & steel = số chẵn ======
      const power_kw = randomEven(20, 34);        // 20,22,...,34
      const steel_ball_kg = randomEven(16, 30);   // 16,18,...,30 (cho đẹp chart phải)

      // cái này float thoải mái
      const voltage_ps = random(110, 125);
      const imp1_rpm = random(110, 150);
      const imp2_rpm = random(110, 150);

      const cur_ps = random(100, 140);
      const cur_i1 = random(100, 150);
      const cur_i2 = random(100, 150);
      const cur_dust = random(90, 130);

      const pw_i1 = random(15, 30);
      const pw_i2 = random(15, 30);
      const pw_dust = random(10, 25);

      db.run(
        insertQuery,
        [
          batchCode,
          date,
          time,
          shift,
          power_kw,
          steel_ball_kg,
          voltage_ps,
          imp1_rpm,
          imp2_rpm,
          cur_ps,
          cur_i1,
          cur_i2,
          cur_dust,
          pw_i1,
          pw_i2,
          pw_dust
        ],
        (err) => {
          if (err) console.error("Insert error:", err);
        }
      );

      currentMinute += 10;
      if (currentMinute >= 60) {
        currentMinute = 0;
        currentHour += 1;
      }
    }

    batchIndex++;
  }

  console.log("✅ Seed hoàn tất! Power & Steel là số chẵn đẹp trai.");
  db.close();
});
