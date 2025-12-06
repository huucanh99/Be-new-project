// routes/historical.js
// API cho Historical Chart (Daily / Monthly / Yearly)

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const router = express.Router();

// ================== KẾT NỐI DB ==================
const dbPath = path.resolve(__dirname, "../db/database.sqlite");
const db = new sqlite3.Database(dbPath);

// 2 phút / 1 record như file seed-batches.js
const MINUTES_PER_RECORD = 2;

// ================== Helper chạy query ==================
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// ================== Helper convert from/to ==================
function expandRange(reportType, from, to) {
  const type = reportType.toLowerCase();

  if (type === "daily") {
    // from, to: 'YYYY-MM-DD'
    return { startDate: from, endDate: to };
  }

  if (type === "monthly") {
    // from, to: 'YYYY-MM'
    const [fy, fm] = from.split("-").map(Number);
    const [ty, tm] = to.split("-").map(Number);

    const startDate = `${fy}-${String(fm).padStart(2, "0")}-01`;

    // endDate = ngày cuối của tháng "to"
    const lastDay = new Date(ty, tm, 0).getDate();
    const endDate = `${ty}-${String(tm).padStart(2, "0")}-${String(
      lastDay
    ).padStart(2, "0")}`;

    return { startDate, endDate };
  }

  if (type === "yearly") {
    // from, to: 'YYYY'
    const fy = Number(from);
    const ty = Number(to);

    const startDate = `${fy}-01-01`;
    const endDate = `${ty}-12-31`;
    return { startDate, endDate };
  }

  // fallback
  return { startDate: from, endDate: to };
}

// ================== GET /api/historical-report ==================
/**
 * Query params:
 *  - reportType: 'daily' | 'monthly' | 'yearly'
 *  - from:
 *      daily   -> 'YYYY-MM-DD'
 *      monthly -> 'YYYY-MM'
 *      yearly  -> 'YYYY'
 *  - to:   same format as 'from'
 */
router.get("/", async (req, res) => {
  try {
    const { reportType = "daily", from, to } = req.query;

    console.log("[HIST] /api/historical-report", req.query);

    if (!from || !to) {
      return res.status(400).json({
        error: "Query 'from' và 'to' là bắt buộc",
      });
    }

    const type = reportType.toLowerCase();
    if (!["daily", "monthly", "yearly"].includes(type)) {
      return res.status(400).json({
        error: "reportType phải là 'daily', 'monthly' hoặc 'yearly'",
      });
    }

    // Chuyển from/to thành startDate/endDate (YYYY-MM-DD)
    const { startDate, endDate } = expandRange(type, from, to);

    // ===== 1) Summary chung trong khoảng ngày =====
    const summarySql = `
      SELECT 
        SUM(power_kw)      AS total_power_kw,
        SUM(steel_ball_kg) AS total_steel_ball,
        COUNT(*)           AS record_count
      FROM batches
      WHERE date BETWEEN ? AND ?
    `;
    const summaryRows = await runQuery(summarySql, [startDate, endDate]);
    const summaryRow = summaryRows[0] || {
      total_power_kw: 0,
      total_steel_ball: 0,
      record_count: 0,
    };

    const totalMinutes =
      (summaryRow.record_count || 0) * MINUTES_PER_RECORD;
    const totalHours = totalMinutes / 60;

    const summary = {
      totalPowerKw: Number((summaryRow.total_power_kw || 0).toFixed(2)),
      totalSteelBallKg: Number(
        (summaryRow.total_steel_ball || 0).toFixed(2)
      ),
      totalTimeHours: Number(totalHours.toFixed(2)),
      recordCount: summaryRow.record_count || 0,
    };

    // ===== 2) Dữ liệu seriesCurrent + seriesSteelBall =====
    let seriesCurrent = [];
    let seriesSteelBall = [];

    if (type === "daily") {
      // DAILY: từng record chi tiết theo thời gian
      const sql = `
        SELECT
          date,
          time,
          current_main,
          steel_ball_kg
        FROM batches
        WHERE date BETWEEN ? AND ?
        ORDER BY date ASC, time ASC
      `;
      const rows = await runQuery(sql, [startDate, endDate]);

      seriesCurrent = rows.map((r) => ({
        x: `${r.date} ${r.time}`, // FE có thể parse ra time
        y: Number(r.current_main || 0),
      }));

      seriesSteelBall = rows.map((r) => ({
        x: `${r.date} ${r.time}`,
        y: Number(r.steel_ball_kg || 0),
      }));
    }

    if (type === "monthly") {
      // MONTHLY: group theo tháng YYYY-MM
      const sql = `
        SELECT
          substr(date, 1, 7) AS month,
          AVG(current_main)  AS avg_current,
          SUM(steel_ball_kg) AS total_steel_ball
        FROM batches
        WHERE date BETWEEN ? AND ?
        GROUP BY month
        ORDER BY month ASC
      `;
      const rows = await runQuery(sql, [startDate, endDate]);

      seriesCurrent = rows.map((r) => ({
        x: r.month, // '2025-09'
        y: Number((r.avg_current || 0).toFixed(3)),
      }));

      seriesSteelBall = rows.map((r) => ({
        x: r.month,
        y: Number((r.total_steel_ball || 0).toFixed(2)),
      }));
    }

    if (type === "yearly") {
      // YEARLY: group theo năm YYYY
      const sql = `
        SELECT
          substr(date, 1, 4) AS year,
          AVG(current_main)  AS avg_current,
          SUM(steel_ball_kg) AS total_steel_ball
        FROM batches
        WHERE date BETWEEN ? AND ?
        GROUP BY year
        ORDER BY year ASC
      `;
      const rows = await runQuery(sql, [startDate, endDate]);

      seriesCurrent = rows.map((r) => ({
        x: r.year,
        y: Number((r.avg_current || 0).toFixed(3)),
      }));

      seriesSteelBall = rows.map((r) => ({
        x: r.year,
        y: Number((r.total_steel_ball || 0).toFixed(2)),
      }));
    }

    // ===== 3) Trả về =====
    res.json({
      reportType: type,
      rawRange: { from, to },           // FE gửi gì trả lại để debug
      dateRange: { startDate, endDate}, // range thật BE dùng
      summary,
      seriesCurrent,
      seriesSteelBall,
    });
  } catch (err) {
    console.error("Lỗi /api/historical-report:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
