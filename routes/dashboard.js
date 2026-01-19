// routes/dashboard.js
const express = require("express");
const router = express.Router();

// ✅ SỬA import theo vị trí db.js mới của em
const { db } = require("../db/db"); // hoặc "../db/db" tuỳ project

/**
 * Fetches the latest batch row from batches_effective (VIEW).
 * (Effective = raw minus tombstone, plus latest override)
 */
function getLatestBatch(callback) {
  const sqlLatest = `
    SELECT *
    FROM batches_effective
    ORDER BY date DESC, time DESC, id DESC
    LIMIT 1
  `;
  db.get(sqlLatest, [], (err, row) => {
    if (err) return callback(err);
    callback(null, row);
  });
}

/**
 * Loads alarm threshold settings for a given steel ball type.
 */
function getAlarmSettings(steelBallType, callback) {
  const sql = `
    SELECT param_key, upper_limit, lower_limit
    FROM alarm_settings
    WHERE steel_ball_type = ?
  `;
  db.all(sql, [steelBallType], (err, rows) => {
    if (err) return callback(err);

    const limits = {};
    (rows || []).forEach((r) => {
      limits[r.param_key] = {
        upper: r.upper_limit,
        lower: r.lower_limit,
      };
    });

    callback(null, limits);
  });
}

// Param metadata for alarms table
const PARAM_META = {
  steel_ball_kg: { type: "Steel Ball Weight", location: "Steel Ball" },
  steel_ball_weight: { type: "Steel Ball Weight", location: "Steel Ball" }, // alias
  current_ps: { type: "Current (A)", location: "Power Supply" },
  voltage_ps: { type: "Voltage (V)", location: "Power Supply" },
  power_ps: { type: "Power (kW)", location: "Power Supply" },
};

/**
 * Creates an alarm only if there is no active alarm with the same type and location.
 */
function createAlarmIfNeeded(paramKey, value, limit) {
  const meta = PARAM_META[paramKey] || {
    type: paramKey,
    location: "Main Panel",
  };

  const num = Number(value);
  const show = Number.isFinite(num) ? num.toFixed(3) : String(value);

  const details = `Value ${show} outside [${limit.lower} - ${limit.upper}]`;

  const sqlCheck = `
    SELECT id
    FROM alarms
    WHERE type = ? AND location = ? AND end_time IS NULL
    LIMIT 1
  `;

  db.get(sqlCheck, [meta.type, meta.location], (err, row) => {
    if (err) {
      console.error("DB error checking existing alarm:", err);
      return;
    }
    if (row) return;

    const sqlInsert = `
      INSERT INTO alarms (type, location, start_time, details)
      VALUES (?, ?, datetime('now'), ?)
    `;

    db.run(sqlInsert, [meta.type, meta.location, details], (err2) => {
      if (err2) console.error("DB error inserting alarm:", err2);
    });
  });
}

/**
 * GET /api/dashboard
 * Returns a realtime snapshot of the latest batch row and checks thresholds to raise alarms.
 */
router.get("/", (req, res) => {
  getLatestBatch((err, row) => {
    if (err) {
      console.error("DB error getLatestBatch GET /api/dashboard:", err);
      return res.status(500).json({ message: "DB error" });
    }

    // No data yet
    if (!row) {
      return res.status(200).json({
        batchId: "-",
        steelBallType: "-",
        machineStatus: "offline",
        steelBallWeight: 0,
        voltage: { powerSupply: 0 },
        rpm: { impeller1: 0, impeller2: 0 },
        current: {
          powerSupply: 0,
          impeller1: 0,
          impeller2: 0,
          dustCollector: 0,
        },
        power: {
          powerSupply: 0,
          impeller1: 0,
          impeller2: 0,
          dustCollector: 0,
        },
        abnormalFields: [],
      });
    }

    const steelBallType =
      (row.steel_ball_type && String(row.steel_ball_type).trim()) || "Type A";

    getAlarmSettings(steelBallType, (err2, limits) => {
      if (err2) {
        console.error("DB error getAlarmSettings:", err2);
        return res.status(500).json({ message: "DB error" });
      }

      const abnormalFields = [];

      const checkRange = (key, value) => {
        // Support alias: if settings stored as steel_ball_weight but code checks steel_ball_kg (or vice versa)
        const limit = limits[key] || limits[key === "steel_ball_kg" ? "steel_ball_weight" : "steel_ball_kg"];
        if (!limit) return;
        if (value == null) return;

        const v = Number(value);
        if (!Number.isFinite(v)) return;

        if (v > Number(limit.upper) || v < Number(limit.lower)) {
          abnormalFields.push(key);
          createAlarmIfNeeded(key, v, limit);
        }
      };

      // ✅ Schema mới: steel_ball_kg là weight
      const steelBallRealtime = row.steel_ball_kg ?? null;

      // Threshold checks
      checkRange("steel_ball_kg", steelBallRealtime);
      checkRange("current_ps", row.current_ps);
      checkRange("voltage_ps", row.voltage_ps);
      checkRange("power_ps", row.power_ps);

      // Machine status: nếu có abnormalFields -> abnormal (tuỳ FE)
      const machineStatusBase = abnormalFields.length > 0 ? "abnormal" : "operating";

      const data = {
        batchId: row.batch_code || "-",
        steelBallType,
        machineStatus: machineStatusBase,
        abnormalFields,

        steelBallWeight: Number(steelBallRealtime) || 0,

        voltage: {
          powerSupply: Number(row.voltage_ps) || 0,
        },

        rpm: {
          impeller1: Number(row.impeller1_rpm) || 0,
          impeller2: Number(row.impeller2_rpm) || 0,
        },

        current: {
          powerSupply: Number(row.current_ps) || 0,
          impeller1: Number(row.current_impeller1) || 0,
          impeller2: Number(row.current_impeller2) || 0,
          dustCollector: Number(row.current_dust) || 0,
        },

        power: {
          powerSupply: Number(row.power_ps) || 0,
          impeller1: Number(row.power_impeller1_kw) || 0,
          impeller2: Number(row.power_impeller2_kw) || 0,
          dustCollector: Number(row.power_dust_kw) || 0,
        },
      };

      return res.json(data);
    });
  });
});

module.exports = router;
