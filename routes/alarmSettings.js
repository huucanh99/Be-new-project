// routes/alarmSettings.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

// Map cố định param_key -> đơn vị hiển thị
const unitMap = {
  steel_ball_weight: "KG",
  current_main: "A",
  voltage_ps: "V",
  power_ps: "kW",
};

// ✅ GET /api/alarm-settings?steelBallType=Type%20A
// Dùng cho tab Alarm Settings để load lại giá trị đã lưu
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
      console.error("DB error (GET /api/alarm-settings):", err);
      return res.status(500).json({ error: "DB error", detail: err.message });
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

// ✅ POST /api/alarm-settings
// body FE gởi:
// {
//   "steelBallType": "Type A",
//   "settings": {
//     "steel_ball_weight": { "upper": 0.5, "lower": 0.2 },
//     "current_main":      { "upper": 1.3, "lower": 1.0 },
//     "voltage_ps":        { "upper": 125, "lower": 110 },
//     "power_kw":          { "upper": 0.6, "lower": 0.3 }
//   }
// }
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

  const stmt = db.prepare(
    `
    INSERT INTO alarm_settings 
      (steel_ball_type, param_key, upper_limit, lower_limit, unit)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(steel_ball_type, param_key) DO UPDATE SET
      upper_limit = excluded.upper_limit,
      lower_limit = excluded.lower_limit,
      unit = excluded.unit
  `
  );

  keys.forEach((key) => {
    const s = settings[key];

    // Nếu param không support trong unitMap → bỏ qua
    if (!unitMap[key]) {
      console.warn(`⚠️ Bỏ qua param_key không hỗ trợ: ${key}`);
      return;
    }

    const upper = Number(s.upper);
    const lower = Number(s.lower);

    if (Number.isNaN(upper) || Number.isNaN(lower)) {
      console.warn(`⚠️ upper/lower không hợp lệ cho param_key: ${key}`);
      return;
    }

    const unit = unitMap[key];

    stmt.run(steelBallType, key, upper, lower, unit);
  });

  stmt.finalize((err) => {
    if (err) {
      console.error("DB error (POST /api/alarm-settings):", err);
      return res.status(500).json({ error: "DB error", detail: err.message });
    }
    res.json({ success: true });
  });
});

module.exports = router;
