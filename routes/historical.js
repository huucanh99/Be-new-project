// routes/historical.js
const express = require("express");
const router = express.Router();

// ✅ Dùng chung db (đúng path + đã init schema)
const { db } = require("../db/db"); // hoặc "../db/db" tuỳ project

const MINUTES_PER_RECORD = 2;

/**
 * Runs a SQL query and returns rows using a Promise (for async/await).
 */
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * Expands the requested from/to range into an actual date range (YYYY-MM-DD) based on report type.
 */
function expandRange(reportType, from, to) {
  const type = String(reportType || "daily").toLowerCase();

  if (type === "daily") {
    return { startDate: from, endDate: to };
  }

  if (type === "monthly") {
    const [fy, fm] = from.split("-").map(Number);
    const [ty, tm] = to.split("-").map(Number);

    const startDate = `${fy}-${String(fm).padStart(2, "0")}-01`;
    const lastDay = new Date(ty, tm, 0).getDate();
    const endDate = `${ty}-${String(tm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    return { startDate, endDate };
  }

  if (type === "yearly") {
    const fy = Number(from);
    const ty = Number(to);

    const startDate = `${fy}-01-01`;
    const endDate = `${ty}-12-31`;

    return { startDate, endDate };
  }

  return { startDate: from, endDate: to };
}

/**
 * GET /api/historical-report
 * Returns summary totals and time series data for daily/monthly/yearly historical charts.
 *
 * Query:
 * - reportType: daily|monthly|yearly
 * - from, to (required)
 */
router.get("/", async (req, res) => {
  try {
    const { reportType = "daily", from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        error: "Query parameters 'from' and 'to' are required",
      });
    }

    const type = String(reportType).toLowerCase();
    if (!["daily", "monthly", "yearly"].includes(type)) {
      return res.status(400).json({
        error: "reportType must be 'daily', 'monthly', or 'yearly'",
      });
    }

    const { startDate, endDate } = expandRange(type, from, to);

    // ✅ Use batches_effective view
    const summarySql = `
      SELECT 
        SUM(COALESCE(power_kw, 0))      AS total_power_kw,
        SUM(COALESCE(steel_ball_kg, 0)) AS total_steel_ball,
        COUNT(*)                        AS record_count
      FROM batches_effective
      WHERE date BETWEEN ? AND ?
    `;
    const summaryRows = await runQuery(summarySql, [startDate, endDate]);
    const summaryRow = summaryRows[0] || {
      total_power_kw: 0,
      total_steel_ball: 0,
      record_count: 0,
    };

    const totalMinutes = (summaryRow.record_count || 0) * MINUTES_PER_RECORD;
    const totalHours = totalMinutes / 60;

    const summary = {
      totalPowerKw: Number((Number(summaryRow.total_power_kw || 0)).toFixed(2)),
      totalSteelBallKg: Number((Number(summaryRow.total_steel_ball || 0)).toFixed(2)),
      totalTimeHours: Number(totalHours.toFixed(2)),
      recordCount: summaryRow.record_count || 0,
    };

    let seriesCurrent = [];
    let seriesSteelBall = [];

    if (type === "daily") {
      const sql = `
        SELECT
          date,
          time,
          current_main,
          steel_ball_kg
        FROM batches_effective
        WHERE date BETWEEN ? AND ?
        ORDER BY date ASC, time ASC, id ASC
      `;
      const rows = await runQuery(sql, [startDate, endDate]);

      seriesCurrent = rows.map((r) => ({
        x: `${r.date} ${r.time}`,
        y: Number(r.current_main || 0),
      }));

      seriesSteelBall = rows.map((r) => ({
        x: `${r.date} ${r.time}`,
        y: Number(r.steel_ball_kg || 0),
      }));
    }

    if (type === "monthly") {
      const sql = `
        SELECT
          substr(date, 1, 7) AS month,
          AVG(COALESCE(current_main, 0))  AS avg_current,
          SUM(COALESCE(steel_ball_kg, 0)) AS total_steel_ball
        FROM batches_effective
        WHERE date BETWEEN ? AND ?
        GROUP BY month
        ORDER BY month ASC
      `;
      const rows = await runQuery(sql, [startDate, endDate]);

      seriesCurrent = rows.map((r) => ({
        x: r.month,
        y: Number((Number(r.avg_current || 0)).toFixed(3)),
      }));

      seriesSteelBall = rows.map((r) => ({
        x: r.month,
        y: Number((Number(r.total_steel_ball || 0)).toFixed(2)),
      }));
    }

    if (type === "yearly") {
      const sql = `
        SELECT
          substr(date, 1, 4) AS year,
          AVG(COALESCE(current_main, 0))  AS avg_current,
          SUM(COALESCE(steel_ball_kg, 0)) AS total_steel_ball
        FROM batches_effective
        WHERE date BETWEEN ? AND ?
        GROUP BY year
        ORDER BY year ASC
      `;
      const rows = await runQuery(sql, [startDate, endDate]);

      seriesCurrent = rows.map((r) => ({
        x: r.year,
        y: Number((Number(r.avg_current || 0)).toFixed(3)),
      }));

      seriesSteelBall = rows.map((r) => ({
        x: r.year,
        y: Number((Number(r.total_steel_ball || 0)).toFixed(2)),
      }));
    }

    return res.json({
      reportType: type,
      rawRange: { from, to },
      dateRange: { startDate, endDate },
      summary,
      seriesCurrent,
      seriesSteelBall,
    });
  } catch (err) {
    console.error("Error GET /api/historical-report:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
