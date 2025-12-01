// routes/dashboard.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

// GET /api/dashboard
router.get("/", (req, res) => {
  // Lấy bản ghi mới nhất
  const sqlLatest = `
    SELECT *
    FROM batches
    ORDER BY date DESC, time DESC
    LIMIT 1
  `;

  db.get(sqlLatest, [], (err, row) => {
    if (err) {
      console.error("DB error /api/dashboard:", err);
      return res.status(500).json({ message: "DB error" });
    }

    if (!row) {
      return res.status(200).json({
        batchId: "-",
        machineStatus: "offline",
        steelBallWeight: 0,
        steelBallTotal: 0,
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
      });
    }

    // ============================
    // 2) TÍNH TỔNG steel ball TRONG NGÀY
    // ============================
    const sqlSum = `
      SELECT SUM(steel_ball_kg) AS total
      FROM batches
      WHERE date = ?
    `;

    db.get(sqlSum, [row.date], (err2, sumRow) => {
      const totalSteelBall = sumRow?.total ?? 0;

      // map như cũ
      const data = {
        batchId: row.batch_code,
        machineStatus: "abnormal",

        steelBallWeight: row.steel_ball_kg,
        steelBallTotal: totalSteelBall,  // ⭐ THÊM FIELD NÀY ⭐

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
          powerSupply: row.power_kw,
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
