// seed-batches.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

// Tạo bảng nếu chưa có
const createTableQuery = `
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  power_kw REAL,
  steel_ball_kg REAL
)
`;

db.run(createTableQuery, (err) => {
  if (err) return console.error("Lỗi tạo bảng:", err);
});

// Hàm tạo giờ dạng HH:MM
function formatTime(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// random int [min, max]
function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

db.serialize(() => {
  console.log("🧹 Xóa dữ liệu cũ...");
  db.run("DELETE FROM batches");

  const insertQuery = `
    INSERT INTO batches (batch_code, date, time, power_kw, steel_ball_kg)
    VALUES (?, ?, ?, ?, ?)
  `;

  const date = "2025-11-27";
  const dateCompact = date.replace(/-/g, "").slice(2); // 251127

  // Số batch trong ngày: 15–20
  const totalBatches = random(15, 20);

  let currentHour = 0;
  let currentMinute = 0;
  let batchIndex = 0;

  console.log(`🚀 Seed cho ngày ${date} với khoảng ${totalBatches} batch`);

  while (currentHour < 24 && batchIndex < totalBatches) {
    const batchCode = `B${dateCompact}_${String(batchIndex).padStart(4, "0")}`;

    // Thời lượng 1 batch: 40–120 phút, bội số của 10
    const durationMinutes = random(4, 12) * 10; // 4*10=40 → 12*10=120
    const steps = durationMinutes / 10;

    console.log(
      `  ▶ Batch ${batchCode} | start ${formatTime(
        currentHour,
        currentMinute
      )} | steps=${steps}`
    );

    for (let s = 0; s < steps; s++) {
      if (currentHour >= 24) break;

      const time = formatTime(currentHour, currentMinute);
      const power = random(20, 35);
      const steel = random(20, 35); // hoặc power * 0.8 nếu muốn mềm hơn

      db.run(insertQuery, [batchCode, date, time, power, steel], (err) => {
        if (err) console.error("Insert error:", err);
      });

      // Tăng 10 phút
      currentMinute += 10;
      if (currentMinute >= 60) {
        currentMinute = 0;
        currentHour += 1;
      }
    }

    batchIndex++;
  }

  console.log("✅ DONE! Đã tạo dữ liệu theo dạng:");
  console.log("- 1 ngày ~ 15–20 batch");
  console.log("- Mỗi batch có nhiều time 10 phút với cùng batch_code");

  db.close();
});
