// routes/dailyReport.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

/**
 * Promise wrapper for db.all() to use async/await.
 */
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

/**
 * GET /api/daily-report
 * Builds daily/shift/batch reports from the batches table and returns aggregated data for charts.
 */
router.get("/", async (req, res) => {
  const { date, uptoHour, reportType, batchId, shift } = req.query;

  if (!date) return res.status(400).json({ message: "date is required" });

  const hourLimit = uptoHour ? parseInt(uptoHour, 10) : 23;

  try {
    const cols = await dbAll(`PRAGMA table_info(batches)`);
    const colSet = new Set((cols || []).map((c) => c.name));

    const typeCandidates = [
      "steel_ball_type",
      "steelBallType",
      "steel_type",
      "steelType",
      "type",
    ];

    const typeCol = typeCandidates.find((c) => colSet.has(c)) || null;

    const batchSql = `
      SELECT DISTINCT batch_code
      FROM batches
      WHERE date = ?
      ORDER BY batch_code ASC
    `;
    const batchRows = await dbAll(batchSql, [date]);
    const batchIds = (batchRows || []).map((r) => r.batch_code);

    let whereClause = "";
    let params = [];

    if (reportType === "Shift Report" && shift) {
      whereClause = `WHERE date = ?`;
      params = [date];

      if (shift == 1) {
        whereClause += `
          AND (
            CAST(substr(time,1,2) AS INTEGER) >= 22
            OR CAST(substr(time,1,2) AS INTEGER) < 6
          )
        `;
      } else if (shift == 2) {
        whereClause += `
          AND CAST(substr(time,1,2) AS INTEGER) >= 6
          AND CAST(substr(time,1,2) AS INTEGER) < 14
        `;
      } else if (shift == 3) {
        whereClause += `
          AND CAST(substr(time,1,2) AS INTEGER) >= 14
          AND CAST(substr(time,1,2) AS INTEGER) < 22
        `;
      }
    } else if (reportType === "Batch Summary") {
      whereClause = `WHERE date = ?`;
      params = [date];

      if (batchId) {
        whereClause += ` AND batch_code = ?`;
        params.push(batchId);
      }
    } else {
      whereClause = `
        WHERE date = ?
          AND CAST(substr(time,1,2) AS INTEGER) <= ?
      `;
      params = [date, hourLimit];
    }

    const typeSelect = typeCol ? `, ${typeCol} AS steel_ball_type` : ``;

    const dataSql = `
      SELECT batch_code, date, time, power_kw${typeSelect}
      FROM batches
      ${whereClause}
      ORDER BY batch_code ASC, time ASC
    `;

    const rows = await dbAll(dataSql, params);

    if (!rows || rows.length === 0) {
      return res.json({
        date,
        uptoHour: hourLimit,
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

      steelBatches = powerBatches.map((b) => ({
        batch: b.batch,
        value: b.value * 0.8,
      }));

      return res.json({
        date,
        uptoHour: hourLimit,
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
        steelBallType,
        powerBatches: [],
        powerTimeData,
        steelBatches: [],
        steelLineData,
        alarmRows,
        batchIds,
      });
    }

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
        steelBallType,
        powerBatches,
        powerTimeData: [],
        steelBatches,
        steelLineData: [],
        alarmRows,
        batchIds,
      });
    }

    return res.json({
      date,
      uptoHour: hourLimit,
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
