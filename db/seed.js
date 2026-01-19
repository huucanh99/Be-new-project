// seed.js
// Dev-only seeding script.
// Usage:
//   node seed.js                  # append seed data (safe)
//   SEED_RESET=1 node seed.js      # reset + seed (dev only)
// Notes:
// - This file should NOT create/alter tables. Tables are created by initDb() in db.js.

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcrypt");

const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

// ===================== SHIFT FUNCTION =====================
function getShift(hour) {
  if (hour >= 22 || hour < 6) return 1; // Night
  if (hour >= 6 && hour < 14) return 2; // Day
  return 3; // Afternoon
}

function formatTime(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function isResetEnabled() {
  const wantReset = String(process.env.SEED_RESET || "") === "1";
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

  if (wantReset && isProd) {
    console.error(
      "❌ Refusing to reset seed data in production (NODE_ENV=production).\n" +
        "   Remove SEED_RESET=1 or run in a non-production environment."
    );
    process.exit(1);
  }

  return wantReset;
}

// ===================== SEED DATA =====================
const typeSettings = [
  { type: "Type A", coeff: 0.52, unit: "kgCO2/kWh" },
  { type: "Type B", coeff: 0.6, unit: "kgCO2/kWh" },
  { type: "Type C", coeff: 0.48, unit: "kgCO2/kWh" },
];

// 1 type chạy xuyên suốt dataset (đỡ rối Daily Report)
const GLOBAL_STEEL_BALL_TYPE = "Type A";

const defaultComponents = [
  { name: "impeller1", warning: 1 },
  { name: "impeller2", warning: 100 },
  { name: "blade1", warning: 80 },
  { name: "blade2", warning: 80 },
  { name: "claw1", warning: 60 },
  { name: "claw2", warning: 60 },
  { name: "clawTube1", warning: 60 },
  { name: "clawTube2", warning: 60 },
  { name: "filter", warning: 50 },
];

// 2 ngày để test
const dates = ["2025-12-01", "2025-12-02"];
const BATCH_DURATION_MIN = 120; // 2 tiếng
const STEP_MIN = 2; // 2 phút 1 record
const STEPS_PER_BATCH = BATCH_DURATION_MIN / STEP_MIN; // 60
const BATCHES_PER_DAY = 12;

async function seedUsers() {
  const adminHash = await bcrypt.hash("admin123", 10);
  const customerHash = await bcrypt.hash("123456", 10);

  return new Promise((resolve) => {
    db.serialize(() => {
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

      resolve();
    });
  });
}

function seedSteelTypeSettings() {
  const insertTypeSetting = db.prepare(`
    INSERT OR REPLACE INTO steel_type_settings (steel_ball_type, carbon_coefficient, carbon_unit)
    VALUES (?, ?, ?)
  `);

  typeSettings.forEach((x) => {
    insertTypeSetting.run(x.type, x.coeff, x.unit);
  });

  insertTypeSetting.finalize();
}

function seedComponentLife() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO component_life (component_name, accumulated_hours, warning_hours)
    VALUES (?, 0, ?)
  `);

  defaultComponents.forEach((c) => insert.run(c.name, c.warning));
  insert.finalize();
}

function seedBatchesRaw() {
  const insertQuery = `
    INSERT INTO batches_raw (
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

  dates.forEach((date) => {
    console.log("📅 SEED NGÀY:", date);

    for (let batchIndex = 0; batchIndex < BATCHES_PER_DAY; batchIndex++) {
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

        // current_main 1.0 – 1.3
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
          (err) => err && console.error("Insert error:", err.message)
        );
      }
    }
  });

  console.log(
    `🎉 SEED DONE: ${dates.length} ngày × ${BATCHES_PER_DAY} batch/ngày × ${STEPS_PER_BATCH} record/batch`
  );
}

function resetDataIfNeeded() {
  if (!isResetEnabled()) return;

  console.log("🧹 Reset seed data (SEED_RESET=1)...");

  // IMPORTANT:
  // - Never touch batches_raw structure here.
  // - We only delete data content (dev-only).
  db.serialize(() => {
    db.run("DELETE FROM batches_tombstone");
    db.run("DELETE FROM batches_override");
    db.run("DELETE FROM batches_raw");

    db.run("DELETE FROM steel_type_settings");

    // If you want to reset users each time, uncomment:
    // db.run("DELETE FROM users");

    db.run("DELETE FROM component_life");

    // alarm_settings / alarms are runtime-ish; keep or reset depending on your dev needs:
    db.run("DELETE FROM alarms");
    db.run("DELETE FROM alarm_settings");
  });
}

async function main() {
  console.log("✅ Connected:", dbPath);

  resetDataIfNeeded();

  // Seed settings + reference data
  seedSteelTypeSettings();
  seedComponentLife();

  // Seed users
  await seedUsers();
  console.log("👤 Seed users done: admin/admin123 & customer/123456");

  // Seed batches
  seedBatchesRaw();

  // Close after a short delay to let sqlite finish queued writes
  setTimeout(() => {
    db.close();
  }, 400);
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  db.close();
  process.exit(1);
});
