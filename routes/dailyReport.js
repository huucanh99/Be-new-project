// routes/dailyReport.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

router.get("/", (req, res) => {
  const { date, uptoHour, reportType, batchId, shift } = req.query;

  if (!date) return res.status(400).json({ message: "date is required" });

  const hourLimit = uptoHour ? parseInt(uptoHour, 10) : 23;

  // 1) batch list
  const batchSql = `
    SELECT DISTINCT batch_code
    FROM batches
    WHERE date = ?
    ORDER BY batch_code ASC
  `;

  db.all(batchSql, [date], (errBatch, batchRows) => {
    if (errBatch) {
      console.error("Error loading batch list:", errBatch);
      return res.status(500).json({ message: "Database error" });
    }

    const batchIds = (batchRows || []).map((r) => r.batch_code);

    // 2) WHERE chính
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

    // ✅ Query lấy BEFORE steel ball: dòng đầu tiên (time nhỏ nhất)
    //    - Nếu Batch Summary: lấy theo batch
    //    - Còn lại: lấy theo ngày
    const beforeSql =
      reportType === "Batch Summary" && batchId
        ? `
          SELECT steel_ball_level_kg
          FROM batches
          WHERE date = ? AND batch_code = ?
          ORDER BY time ASC
          LIMIT 1
        `
        : `
          SELECT steel_ball_level_kg
          FROM batches
          WHERE date = ?
          ORDER BY time ASC
          LIMIT 1
        `;

    const beforeParams =
      reportType === "Batch Summary" && batchId ? [date, batchId] : [date];

    db.get(beforeSql, beforeParams, (errBefore, beforeRow) => {
      if (errBefore) {
        console.error("Error loading steel ball BEFORE:", errBefore);
        return res.status(500).json({ message: "Database error" });
      }

      const steelBallBeforeKg = Number(beforeRow?.steel_ball_level_kg ?? 0) || 0;

      // 3) data query (✅ đúng cột steel_ball_level_kg để khỏi 500)
      const dataSql = `
        SELECT batch_code, date, time, power_kw, steel_ball_level_kg
        FROM batches
        ${whereClause}
        ORDER BY batch_code ASC, time ASC
      `;

      db.all(dataSql, params, (err, rows) => {
        if (err) {
          console.error("Error loading daily report:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (!rows || rows.length === 0) {
          return res.json({
            date,
            uptoHour: hourLimit,
            reportType,
            powerBatches: [],
            powerTimeData: [],
            steelBatches: [],
            steelLineData: [],
            alarmRows: [],
            batchIds,
            steelBallBeforeKg,
          });
        }

        let powerBatches = [];
        let powerTimeData = [];
        let steelBatches = [];
        let steelLineData = [];
        const alarmRows = [];

        // 1) DAILY TOTAL
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
            powerBatches,
            powerTimeData: [],
            steelBatches,
            steelLineData: [],
            alarmRows,
            batchIds,
            steelBallBeforeKg,
          });
        }

        // 2) BATCH SUMMARY
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
            powerBatches: [],
            powerTimeData,
            steelBatches: [],
            steelLineData,
            alarmRows,
            batchIds,
            steelBallBeforeKg,
          });
        }

        // 3) SHIFT REPORT
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
            powerBatches,
            powerTimeData: [],
            steelBatches,
            steelLineData: [],
            alarmRows,
            batchIds,
            steelBallBeforeKg,
          });
        }

        // fallback
        return res.json({
          date,
          uptoHour: hourLimit,
          reportType,
          powerBatches: [],
          powerTimeData: [],
          steelBatches: [],
          steelLineData: [],
          alarmRows,
          batchIds,
          steelBallBeforeKg,
        });
      });
    });
  });
});

module.exports = router;
