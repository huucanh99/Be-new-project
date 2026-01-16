// routes/steelTypeSettings.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

const DEFAULT_UNIT = "kgCO2/kWh";

/**
 * GET /api/steel-type-settings
 * Returns carbon coefficient/unit settings for a given steel ball type.
 */
router.get("/", (req, res) => {
  const { steelBallType } = req.query;

  if (!steelBallType) {
    return res.status(400).json({ error: "steelBallType is required" });
  }

  const sql = `
    SELECT carbon_coefficient, carbon_unit
    FROM steel_type_settings
    WHERE steel_ball_type = ?
    LIMIT 1
  `;

  db.get(sql, [steelBallType], (err, row) => {
    if (err) {
      console.error("DB error GET /api/steel-type-settings:", err);
      return res.status(500).json({ error: "DB error" });
    }

    if (!row) {
      return res
        .status(404)
        .json({ message: "No settings for this steelBallType" });
    }

    res.json({
      steelBallType,
      carbonCoefficient: row.carbon_coefficient,
      carbonUnit: row.carbon_unit || DEFAULT_UNIT,
    });
  });
});

/**
 * POST /api/steel-type-settings
 * Creates or updates carbon coefficient/unit settings for a given steel ball type.
 */
router.post("/", (req, res) => {
  const { steelBallType, carbonCoefficient, carbonUnit } = req.body;

  if (!steelBallType) {
    return res.status(400).json({ error: "steelBallType is required" });
  }

  const coeff = Number(carbonCoefficient);
  if (Number.isNaN(coeff)) {
    return res
      .status(400)
      .json({ error: "carbonCoefficient must be a number" });
  }

  const unit = (carbonUnit || DEFAULT_UNIT).trim();

  const sql = `
    INSERT INTO steel_type_settings (steel_ball_type, carbon_coefficient, carbon_unit, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(steel_ball_type) DO UPDATE SET
      carbon_coefficient = excluded.carbon_coefficient,
      carbon_unit = excluded.carbon_unit,
      updated_at = excluded.updated_at
  `;

  db.run(sql, [steelBallType.trim(), coeff, unit], (err) => {
    if (err) {
      console.error("DB error POST /api/steel-type-settings:", err);
      return res.status(500).json({ error: "DB error" });
    }
    res.json({ success: true });
  });
});

module.exports = router;
