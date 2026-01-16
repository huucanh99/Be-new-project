// routes/dashboard.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

/**
 * Fetches the latest batch row from the batches table.
 */
function getLatestBatch(callback) {
  const sqlLatest = `
    SELECT *
    FROM batches
    ORDER BY date DESC, time DESC
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
    rows.forEach((r) => {
      limits[r.param_key] = {
        upper: r.upper_limit,
        lower: r.lower_limit,
      };
    });

    callback(null, limits);
  });
}

const PARAM_META = {
  steel_ball_weight: {
    type: "Steel Ball Weight",
    location: "Steel Ball",
  },
  current_ps: {
    type: "Current (A)",
    location: "Power Supply",
  },
  voltage_ps: {
    type: "Voltage (V)",
    location: "Power Supply",
  },
  power_ps: {
    type: "Power (kW)",
    location: "Power Supply",
  },
};

/**
 * Creates an alarm only if there is no active alarm with the same type and location.
 */
function createAlarmIfNeeded(paramKey, value, limit) {
  const meta = PARAM_META[paramKey] || {
    type: paramKey,
    location: "Main Panel",
  };

  const details = `Value ${Number(value).toFixed(3)} outside [${limit.lower} - ${limit.upper}]`;

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
      if (err2) {
        console.error("DB error inserting alarm:", err2);
      }
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
        const limit = limits[key];
        if (!limit) return;
        if (value == null) return;

        if (value > limit.upper || value < limit.lower) {
          abnormalFields.push(key);
          createAlarmIfNeeded(key, value, limit);
        }
      };

      const steelBallRealtime =
        row.steel_ball_level_kg ?? row.steel_ball_kg ?? null;

      checkRange("steel_ball_weight", steelBallRealtime);
      checkRange("current_ps", row.current_ps);
      checkRange("voltage_ps", row.voltage_ps);
      checkRange("power_ps", row.power_ps);

      const machineStatusBase = "operating";

      const data = {
        batchId: row.batch_code,
        steelBallType,
        machineStatus: machineStatusBase,
        abnormalFields,

        steelBallWeight: steelBallRealtime,

        voltage: {
          powerSupply: row.voltage_ps,
        },

        rpm: {
          impeller1: row.impeller1_rpm,
          impeller2: row.impeller2_rpm,
        },

        current: {
          powerSupply: row.current_ps,
          impeller1: row.current_impeller1,
          impeller2: row.current_impeller2,
          dustCollector: row.current_dust,
        },

        power: {
          powerSupply: row.power_ps,
          impeller1: row.power_impeller1_kw,
          impeller2: row.power_impeller2_kw,
          dustCollector: row.power_dust_kw,
        },
      };

      res.json(data);
    });
  });
});

module.exports = router;
