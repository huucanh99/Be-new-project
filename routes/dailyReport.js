// routes/dailyReport.js
const express = require("express");
const router = express.Router();

// ✅ SỬA import theo vị trí db.js mới của em
const { db } = require("../db/db"); // hoặc "../db/db" tuỳ project

/**
 * Promise wrapper for db.all() to use async/await.
 */
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

/**
 * Build time upper bound string from uptoHour.
 * uptoHour=19 -> "19:59:59"
 */
function hourToTimeMax(uptoHour) {
  const h = Number.parseInt(uptoHour, 10);
  const hh = Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 23;
  return String(hh).padStart(2, "0") + ":59:59";
}

/**
 * GET /api/daily-report
 * Builds daily/shift/batch reports from batches_effective (VIEW)
 * Query params:
 * - date=YYYY-MM-DD (required)
 * - uptoHour=0..23 (optional)
 * - reportType: "Daily Total Report" | "Shift Report" | "Batch Summary"
 * - batchId (optional for Batch Summary)
 * - shift (optional for Shift Report): 1|2|3
 */
router.get("/", async (req, res) => {
  const { date, uptoHour, reportType, batchId, shift } = req.query;

  if (!date) return res.status(400).json({ message: "date is required" });

  const timeMax = hourToTimeMax(uptoHour);

  try {
    // ✅ Batch list for UI dropdown
    const batchSql = `
      SELECT DISTINCT batch_code
      FROM batches_effective
      WHERE date = ?
      ORDER BY batch_code ASC
    `;
    const batchRows = await dbAll(batchSql, [date]);
    const batchIds = (batchRows || []).map((r) => r.batch_code);

    // ✅ Build where clause
    let whereClause = `WHERE date = ?`;
    const params = [date];

    if (reportType === "Shift Report" && shift) {
      // Schema mới có cột shift => lọc trực tiếp
      whereClause += ` AND shift = ?`;
      params.push(Number(shift));
    } else if (reportType === "Batch Summary") {
      if (batchId) {
        whereClause += ` AND batch_code = ?`;
        params.push(batchId);
      }
      // (Batch summary không lọc uptoHour theo code cũ — giữ giống cũ)
    } else {
      // Daily Total Report / default: lọc tới giờ
      whereClause += ` AND time <= ?`;
      params.push(timeMax);
    }

    // ✅ Load data
    const dataSql = `
      SELECT
        batch_code,
        date,
        time,
        shift,
        steel_ball_type,
        power_kw
      FROM batches_effective
      ${whereClause}
      ORDER BY batch_code ASC, time ASC, id ASC
    `;

    const rows = await dbAll(dataSql, params);

    // Empty response (giữ format như cũ)
    if (!rows || rows.length === 0) {
      return res.json({
        date,
        uptoHour: Number.parseInt(uptoHour ?? "23", 10) || 23,
        reportType,
        steelBallType: null,
        powerBatches: [],
        powerTimeData: [],
        steelBatches: [],
        steelLineData: [],
        alarmRows: [],
        batchIds,
      });
    }

    const lastRow = rows[rows.length - 1];
    const steelBallType = lastRow?.steel_ball_type ?? null;

    let powerBatches = [];
    let powerTimeData = [];
    let steelBatches = [];
    let steelLineData = [];
    const alarmRows = [];

    // ✅ DAILY TOTAL REPORT: sum power_kw per batch
    if (reportType === "Daily Total Report") {
      const batchAgg = {};

      rows.forEach((r) => {
        const p = Number(r.power_kw) || 0;
        const b = r.batch_code || "UNKNOWN";
        if (!batchAgg[b]) batchAgg[b] = { total: 0 };
        batchAgg[b].total += p;
      });

      powerBatches = Object.keys(batchAgg).map((batch) => ({
        batch,
        value: batchAgg[batch].total,
      }));

      // giữ logic cũ: steel = power * 0.8
      steelBatches = powerBatches.map((b) => ({
        batch: b.batch,
        value: b.value * 0.8,
      }));

      return res.json({
        date,
        uptoHour: Number.parseInt(uptoHour ?? "23", 10) || 23,
        reportType,
        steelBallType,
        powerBatches,
        powerTimeData: [],
        steelBatches,
        steelLineData: [],
        alarmRows,
        batchIds,
      });
    }

    // ✅ BATCH SUMMARY: time series of power_kw for the batch
    if (reportType === "Batch Summary") {
      powerTimeData = rows.map((r) => ({
        time: r.time,
        value: Number(r.power_kw) || 0,
      }));

      steelLineData = rows.map((r) => {
        const p = Number(r.power_kw) || 0;
        return { time: r.time, value: p * 0.8 };
      });

      return res.json({
        date,
        uptoHour: Number.parseInt(uptoHour ?? "23", 10) || 23,
        reportType,
        steelBallType,
        powerBatches: [],
        powerTimeData,
        steelBatches: [],
        steelLineData,
        alarmRows,
        batchIds,
      });
    }

    // ✅ SHIFT REPORT: sum power_kw per batch in that shift
    if (reportType === "Shift Report") {
      const batchAgg = {};

      rows.forEach((r) => {
        const p = Number(r.power_kw) || 0;
        const b = r.batch_code || "UNKNOWN";
        if (!batchAgg[b]) batchAgg[b] = { total: 0 };
        batchAgg[b].total += p;
      });

      powerBatches = Object.keys(batchAgg).map((batch) => ({
        batch,
        value: batchAgg[batch].total,
      }));

      steelBatches = powerBatches.map((b) => ({
        batch: b.batch,
        value: b.value * 0.8,
      }));

      return res.json({
        date,
        uptoHour: Number.parseInt(uptoHour ?? "23", 10) || 23,
        reportType,
        steelBallType,
        powerBatches,
        powerTimeData: [],
        steelBatches,
        steelLineData: [],
        alarmRows,
        batchIds,
      });
    }

    // default fallback
    return res.json({
      date,
      uptoHour: Number.parseInt(uptoHour ?? "23", 10) || 23,
      reportType,
      steelBallType,
      powerBatches: [],
      powerTimeData: [],
      steelBatches: [],
      steelLineData: [],
      alarmRows,
      batchIds,
    });
  } catch (err) {
    console.error("Error loading daily report:", err);
    return res.status(500).json({ message: "Database error" });
  }
});

module.exports = router;
