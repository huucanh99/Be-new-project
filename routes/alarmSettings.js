// routes/alarmSettings.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

const unitMap = {
  steel_ball_weight: "KG",
  current_main: "A",
  voltage_ps: "V",
  power_ps: "kW",
};

/**
 * GET /api/alarm-settings
 * Returns saved alarm settings for a given steel ball type.
 */
router.get("/", (req, res) => {
  const { steelBallType } = req.query;

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
    rows.forEach((r) => {
      settings[r.param_key] = {
        upper: r.upper_limit,
        lower: r.lower_limit,
        unit: r.unit,
      };
    });

    res.json({ steelBallType, settings });
  });
});

/**
 * POST /api/alarm-settings
 * Creates or updates alarm settings for a given steel ball type.
 */
router.post("/", (req, res) => {
  const { steelBallType, settings } = req.body;

  if (!steelBallType || !settings) {
    return res
      .status(400)
      .json({ error: "steelBallType and settings are required" });
  }

  const keys = Object.keys(settings);
  if (keys.length === 0) {
    return res.status(400).json({ error: "settings is empty" });
  }

  const stmt = db.prepare(`
    INSERT INTO alarm_settings 
      (steel_ball_type, param_key, upper_limit, lower_limit, unit)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(steel_ball_type, param_key) DO UPDATE SET
      upper_limit = excluded.upper_limit,
      lower_limit = excluded.lower_limit,
      unit = excluded.unit
  `);

  keys.forEach((key) => {
    const s = settings[key];

    if (!unitMap[key]) {
      console.warn(`Unsupported param_key skipped: ${key}`);
      return;
    }

    const upper = Number(s.upper);
    const lower = Number(s.lower);

    if (Number.isNaN(upper) || Number.isNaN(lower)) {
      console.warn(`Invalid upper/lower values for param_key: ${key}`);
      return;
    }

    const unit = unitMap[key];
    stmt.run(steelBallType, key, upper, lower, unit);
  });

  stmt.finalize((err) => {
    if (err) {
      console.error("DB error POST /api/alarm-settings:", err);
      return res.status(500).json({ error: "DB error" });
    }
    res.json({ success: true });
  });
});

module.exports = router;
