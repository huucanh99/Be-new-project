// routes/dailyReport.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

// helper: promise wrapper
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

router.get("/", async (req, res) => {
  const { date, uptoHour, reportType, batchId, shift } = req.query;

  if (!date) return res.status(400).json({ message: "date is required" });

  const hourLimit = uptoHour ? parseInt(uptoHour, 10) : 23;

  try {
    // =========================
    // 0) Detect columns in batches table (avoid "no such column")
    // =========================
    const cols = await dbAll(`PRAGMA table_info(batches)`);
    const colSet = new Set((cols || []).map((c) => c.name));

    // choose the first existing column name for steel ball type
    // (em có thể thêm tên cột khác vào list này nếu DB của em đặt khác)
    const typeCandidates = [
      "steel_ball_type",
      "steelBallType",
      "steel_type",
      "steelType",
      "type",
    ];

    const typeCol = typeCandidates.find((c) => colSet.has(c)) || null;

    // =========================
    // 1) batch list (dropdown)
    // =========================
    const batchSql = `
      SELECT DISTINCT batch_code
      FROM batches
      WHERE date = ?
      ORDER BY batch_code ASC
    `;
    const batchRows = await dbAll(batchSql, [date]);
    const batchIds = (batchRows || []).map((r) => r.batch_code);

    // =========================
    // 2) WHERE chính cho data
    // =========================
    let whereClause = "";
    let params = [];

    if (reportType === "Shift Report" && shift) {
      whereClause = `WHERE date = ?`;
      params = [date];

      if (shift == 1) {
        // Night: 22->06
        whereClause += `
          AND (
            CAST(substr(time,1,2) AS INTEGER) >= 22
            OR CAST(substr(time,1,2) AS INTEGER) < 6
          )
        `;
      } else if (shift == 2) {
        // Day: 06->14
        whereClause += `
          AND CAST(substr(time,1,2) AS INTEGER) >= 6
          AND CAST(substr(time,1,2) AS INTEGER) < 14
        `;
      } else if (shift == 3) {
        // Afternoon: 14->22
        whereClause += `
          AND CAST(substr(time,1,2) AS INTEGER) >= 14
          AND CAST(substr(time,1,2) AS INTEGER) < 22
        `;
      }
    } else if (reportType === "Batch Summary") {
      // Batch Summary: không lọc uptoHour
      whereClause = `WHERE date = ?`;
      params = [date];

      if (batchId) {
        whereClause += ` AND batch_code = ?`;
        params.push(batchId);
      }
    } else {
      // Daily Total + fallback: lọc theo uptoHour
      whereClause = `
        WHERE date = ?
          AND CAST(substr(time,1,2) AS INTEGER) <= ?
      `;
      params = [date, hourLimit];
    }

    // =========================
    // 3) SQL lấy data (logic cũ, ✅ only select existing columns)
    // =========================
    const typeSelect = typeCol ? `, ${typeCol} AS steel_ball_type` : ``;

    const dataSql = `
      SELECT batch_code, date, time, power_kw${typeSelect}
      FROM batches
      ${whereClause}
      ORDER BY batch_code ASC, time ASC
    `;

    console.log("SQL:", dataSql.replace(/\s+/g, " "));
    console.log("Params:", params);

    const rows = await dbAll(dataSql, params);

    if (!rows || rows.length === 0) {
      return res.json({
        date,
        uptoHour: hourLimit,
        reportType,
        steelBallType: null, // ✅ NEW
        powerBatches: [],
        powerTimeData: [],
        steelBatches: [],
        steelLineData: [],
        alarmRows: [],
        batchIds,
      });
    }

    // ✅ NEW: steelBallType from last row (or null)
    const lastRow = rows[rows.length - 1];
    const steelBallType = lastRow?.steel_ball_type ?? null;

    let powerBatches = [];
    let powerTimeData = [];
    let steelBatches = [];
    let steelLineData = [];
    const alarmRows = [];

    // =====================================================
    // 1) DAILY TOTAL REPORT — tổng power theo batch
    // =====================================================
    if (reportType === "Daily Total Report") {
      const batchAgg = {};

      rows.forEach((r) => {
        const p = Number(r.power_kw) || 0;
        if (!batchAgg[r.batch_code]) batchAgg[r.batch_code] = { total: 0 };
        batchAgg[r.batch_code].total += p;
      });

      powerBatches = Object.keys(batchAgg).map((batch) => ({
        batch,
        value: batchAgg[batch].total,
      }));

      // steel = 0.8 * power (logic cũ)
      steelBatches = powerBatches.map((b) => ({
        batch: b.batch,
        value: b.value * 0.8,
      }));

      return res.json({
        date,
        uptoHour: hourLimit,
        reportType,
        steelBallType, // ✅ NEW
        powerBatches,
        powerTimeData: [],
        steelBatches,
        steelLineData: [],
        alarmRows,
        batchIds,
      });
    }

    // =====================================================
    // 2) BATCH SUMMARY — full time series của batch
    // =====================================================
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
        uptoHour: hourLimit,
        reportType,
        steelBallType, // ✅ NEW
        powerBatches: [],
        powerTimeData,
        steelBatches: [],
        steelLineData,
        alarmRows,
        batchIds,
      });
    }

    // =====================================================
    // 3) SHIFT REPORT — tổng power theo batch trong ca
    // =====================================================
    if (reportType === "Shift Report") {
      const batchAgg = {};

      rows.forEach((r) => {
        const p = Number(r.power_kw) || 0;
        if (!batchAgg[r.batch_code]) batchAgg[r.batch_code] = { total: 0 };
        batchAgg[r.batch_code].total += p;
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
        uptoHour: hourLimit,
        reportType,
        steelBallType, // ✅ NEW
        powerBatches,
        powerTimeData: [],
        steelBatches,
        steelLineData: [],
        alarmRows,
        batchIds,
      });
    }

    // fallback
    return res.json({
      date,
      uptoHour: hourLimit,
      reportType,
      steelBallType, // ✅ NEW
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
