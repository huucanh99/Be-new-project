// routes/dashboard.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

// Hàm lấy batch mới nhất
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

// Hàm lấy tổng steel_ball_kg trong ngày của batch đó
function getDailySteelBallTotal(date, callback) {
  const sqlSum = `
    SELECT SUM(steel_ball_kg) AS total
    FROM batches
    WHERE date = ?
  `;
  db.get(sqlSum, [date], (err, sumRow) => {
    if (err) return callback(err);
    const totalSteelBall = sumRow?.total ?? 0;
    callback(null, totalSteelBall);
  });
}

// Hàm lấy ngưỡng alarm theo steelBallType
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

// GET /api/dashboard
router.get("/", (req, res) => {
  // Tạm fix cứng Type A, sau này muốn truyền từ FE thì dùng query
  const steelBallType = "Type A";

  getLatestBatch((err, row) => {
    if (err) {
      console.error("DB error getLatestBatch /api/dashboard:", err);
      return res.status(500).json({ message: "DB error" });
    }

    // Không có dữ liệu -> offline
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

    // Lấy tổng steel ball trong ngày + lấy ngưỡng alarm
    getDailySteelBallTotal(row.date, (err2, totalSteelBall) => {
      if (err2) {
        console.error("DB error getDailySteelBallTotal:", err2);
        return res.status(500).json({ message: "DB error" });
      }

      getAlarmSettings(steelBallType, (err3, limits) => {
        if (err3) {
          console.error("DB error getAlarmSettings:", err3);
          return res.status(500).json({ message: "DB error" });
        }

        // ===== So sánh với ngưỡng để quyết định abnormal/operating =====
        const abnormalFields = [];

        const checkRange = (key, value) => {
          const limit = limits[key];
          if (!limit) return;          // chưa config thì bỏ qua
          if (value == null) return;

          if (value > limit.upper || value < limit.lower) {
            abnormalFields.push(key);
          }
        };

        // Map param_key trong alarm_settings với cột trong batches
        checkRange("steel_ball_weight", row.steel_ball_kg);
        checkRange("current_main", row.current_main);
        checkRange("voltage_ps", row.voltage_ps);
        checkRange("power_kw", row.power_kw);

        const machineStatus =
          abnormalFields.length > 0 ? "abnormal" : "operating";

        // ===== Trả dữ liệu cho FE đúng format cũ =====
        const data = {
          batchId: row.batch_code,
          machineStatus,        // 👈 giờ là operating / abnormal
          abnormalFields,       // 👈 để dành, sau này muốn tô đỏ theo ngưỡng

          steelBallWeight: row.steel_ball_kg,
          steelBallTotal: totalSteelBall,

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
});

module.exports = router;
