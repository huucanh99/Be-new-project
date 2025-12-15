// routes/dashboard.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

// ======================= GET LATEST ROW =======================
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

// =================== ALARM SETTINGS BY TYPE ===================
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

/* ===== Meta để ghi vào bảng alarms ===== */
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

// Tạo alarm nếu chưa có alarm active cùng type + location (chống spam)
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

    // Đã có alarm active → không tạo thêm
    if (row) return;

    const sqlInsert = `
      INSERT INTO alarms (type, location, start_time, details)
      VALUES (?, ?, datetime('now'), ?)
    `;

    db.run(sqlInsert, [meta.type, meta.location, details], (err2) => {
      if (err2) {
        console.error("DB error inserting alarm:", err2);
      } else {
        console.log(`✅ Created alarm: ${meta.type} @ ${meta.location} - ${details}`);
      }
    });
  });
}

// ======================= GET /api/dashboard =======================
// Requirement khách hàng: Dashboard page = realtime snapshot only
router.get("/", (req, res) => {
  // Tạm fix cứng Type A, sau này muốn truyền từ FE thì dùng query (?steelBallType=Type%20A)
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

        // Realtime sensor snapshot (no totals)
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

    getAlarmSettings(steelBallType, (err2, limits) => {
      if (err2) {
        console.error("DB error getAlarmSettings:", err2);
        return res.status(500).json({ message: "DB error" });
      }

      // ===== Check thresholds + create alarms if needed =====
      const abnormalFields = [];

      const checkRange = (key, value) => {
        const limit = limits[key];
        if (!limit) return; // chưa config thì bỏ qua
        if (value == null) return;

        if (value > limit.upper || value < limit.lower) {
          abnormalFields.push(key);
          createAlarmIfNeeded(key, value, limit);
        }
      };

      // Realtime steel ball sensor value:
      // ưu tiên steel_ball_level_kg (case A - load cell), fallback steel_ball_kg nếu DB cũ
      const steelBallRealtime = row.steel_ball_level_kg ?? row.steel_ball_kg ?? null;

      // Map param_key trong alarm_settings với cột trong batches
      checkRange("steel_ball_weight", steelBallRealtime);
      checkRange("current_ps", row.current_ps);
      checkRange("voltage_ps", row.voltage_ps);
      checkRange("power_ps", row.power_ps);

      // Trạng thái gốc: operating, abnormal sẽ do FE suy ra từ bảng alarms
      const machineStatusBase = "operating";

      // ===== Response snapshot only (NO steelBallTotal) =====
      const data = {
        batchId: row.batch_code,
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
