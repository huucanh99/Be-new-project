// routes/alarmSettings.js
const express = require("express");
const router = express.Router();

// ✅ SỬA import này theo vị trí db.js mới của em
const { db } = require("../db/db"); // hoặc "../db/db" tuỳ project

// Map param_key -> unit (chuẩn schema mới)
// Hỗ trợ alias: steel_ball_weight -> steel_ball_kg (để khỏi vỡ FE cũ)
const unitMap = {
  steel_ball_kg: "KG",
  steel_ball_weight: "KG", // alias/backward compatible
  current_main: "A",
  voltage_ps: "V",
  power_ps: "kW",
};

/**
 * GET /api/alarm-settings?steelBallType=...
 * Returns saved alarm settings for a given steel ball type.
 */
router.get("/", (req, res) => {
  const steelBallType = String(req.query.steelBallType || "").trim();

  if (!steelBallType) {
    return res.status(400).json({ error: "steelBallType is required" });
  }

  const sql = `
    SELECT param_key, upper_limit, lower_limit, unit
    FROM alarm_settings
    WHERE steel_ball_type = ?
  `;

  db.all(sql, [steelBallType], (err, rows) => {
    if (err) {
      console.error("DB error GET /api/alarm-settings:", err);
      return res.status(500).json({ error: "DB error" });
    }

    const settings = {};
    (rows || []).forEach((r) => {
      settings[r.param_key] = {
        upper: r.upper_limit,
        lower: r.lower_limit,
        unit: r.unit,
      };
    });

    return res.json({ steelBallType, settings });
  });
});

/**
 * POST /api/alarm-settings
 * Body:
 * {
 *   "steelBallType": "S3",
 *   "settings": {
 *     "steel_ball_kg": { "upper": 1.2, "lower": 0.8 },
 *     "current_main": { "upper": 10, "lower": 2 }
 *   }
 * }
 */
router.post("/", (req, res) => {
  const steelBallType = String(req.body?.steelBallType || "").trim();
  const settings = req.body?.settings;

  if (!steelBallType || !settings || typeof settings !== "object") {
    return res
      .status(400)
      .json({ error: "steelBallType and settings are required" });
  }

  const keys = Object.keys(settings);
  if (keys.length === 0) {
    return res.status(400).json({ error: "settings is empty" });
  }

  const sqlUpsert = `
    INSERT INTO alarm_settings 
      (steel_ball_type, param_key, upper_limit, lower_limit, unit)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(steel_ball_type, param_key) DO UPDATE SET
      upper_limit = excluded.upper_limit,
      lower_limit = excluded.lower_limit,
      unit = excluded.unit
  `;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const stmt = db.prepare(sqlUpsert);

    let hadError = false;

    keys.forEach((key) => {
      const s = settings[key] || {};

      if (!unitMap[key]) {
        console.warn(`Unsupported param_key skipped: ${key}`);
        return;
      }

      const upper = Number(s.upper);
      const lower = Number(s.lower);

      if (!Number.isFinite(upper) || !Number.isFinite(lower)) {
        console.warn(`Invalid upper/lower for param_key: ${key}`, s);
        return;
      }

      const unit = unitMap[key];

      stmt.run([steelBallType, key, upper, lower, unit], (err) => {
        if (err) {
          hadError = true;
          console.error("DB error upsert alarm_setting:", err, {
            steelBallType,
            key,
            upper,
            lower,
            unit,
          });
        }
      });
    });

    stmt.finalize((err) => {
      if (err) {
        console.error("DB error finalize POST /api/alarm-settings:", err);
        db.run("ROLLBACK");
        return res.status(500).json({ error: "DB error" });
      }

      if (hadError) {
        db.run("ROLLBACK");
        return res.status(500).json({ error: "DB error" });
      }

      db.run("COMMIT", (err2) => {
        if (err2) {
          console.error("DB error COMMIT /api/alarm-settings:", err2);
          return res.status(500).json({ error: "DB error" });
        }
        return res.json({ success: true });
      });
    });
  });
});

module.exports = router;
