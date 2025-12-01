// routes/dailyReport.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

// Ví dụ:
// /api/daily-report?date=2025-12-01&uptoHour=16&reportType=Daily%20Total%20Report
// /api/daily-report?date=2025-12-01&reportType=Shift%20Report&shift=1
// /api/daily-report?date=2025-12-01&reportType=Batch%20Summary&batchId=...

router.get("/", (req, res) => {
  const { date, uptoHour, reportType, batchId, shift } = req.query;

  if (!date) {
    return res.status(400).json({ message: "date is required" });
  }

  const hourLimit = uptoHour ? parseInt(uptoHour, 10) : 23;

  // ===== 1. Lấy list batch cho dropdown Batch Summary =====
  const batchSql = `
    SELECT DISTINCT batch_code
    FROM batches
    WHERE date = ?
      AND CAST(substr(time, 1, 2) AS INTEGER) <= ?
    ORDER BY batch_code ASC
  `;

  db.all(batchSql, [date, hourLimit], (errBatch, batchRows) => {
    if (errBatch) {
      console.error("Error loading batch list:", errBatch);
      return res.status(500).json({ message: "Database error" });
    }

    const batchIds = (batchRows || []).map(r => r.batch_code);

    // ===== 2. Build điều kiện WHERE chính cho chart =====
    let whereClause = "";
    let params = [];

    // --- Shift Report: lọc theo khoảng giờ, KHÔNG dùng uptoHour ---
    if (reportType === "Shift Report" && shift) {
      whereClause = `WHERE date = ?`;
      params = [date];

      console.log("Shift được gửi từ FE:", shift);

      if (shift == 1) {
        // Night Shift: 22:00 -> 06:00 (qua ngày)
        whereClause += `
          AND (
            CAST(substr(time,1,2) AS INTEGER) >= 22
            OR CAST(substr(time,1,2) AS INTEGER) < 6
          )
        `;
      } else if (shift == 2) {
        // Day Shift: 06:00 -> 14:00
        whereClause += `
          AND CAST(substr(time,1,2) AS INTEGER) >= 6
          AND CAST(substr(time,1,2) AS INTEGER) < 14
        `;
      } else if (shift == 3) {
        // Afternoon Shift: 14:00 -> 22:00
        whereClause += `
          AND CAST(substr(time,1,2) AS INTEGER) >= 14
          AND CAST(substr(time,1,2) AS INTEGER) < 22
        `;
      }
    } else {
      // --- Daily Total + Batch Summary: dùng uptoHour ---
      whereClause = `
        WHERE date = ?
          AND CAST(substr(time,1,2) AS INTEGER) <= ?
      `;
      params = [date, hourLimit];

      // Batch Summary: thêm filter batch_code
      if (reportType === "Batch Summary" && batchId) {
        whereClause += ` AND batch_code = ?`;
        params.push(batchId);
      }
    }

    const dataSql = `
      SELECT id, batch_code, date, time, power_kw
      FROM batches
      ${whereClause}
      ORDER BY time ASC
    `;

    console.log("SQL daily-report:", dataSql.replace(/\s+/g, " "));
    console.log("Params:", params);

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
        });
      }

      // Power theo batch
      const powerBatches = rows.map(r => ({
        batch: r.batch_code,
        time: r.time,
        value: r.power_kw,
      }));

      // Power theo time (Batch Summary dùng)
      const powerTimeData = rows.map(r => ({
        time: r.time,
        value: r.power_kw,
      }));

      // Steel ball: demo = 0.8 * power_kw
      const steelBatches = rows.map(r => ({
        batch: r.batch_code,
        time: r.time,
        value: Math.round(r.power_kw * 0.8),
      }));

      const steelLineData = steelBatches.map(b => ({
        time: b.time,
        value: b.value,
      }));

      const alarmRows = []; // tạm thời chưa có

      return res.json({
        date,
        uptoHour: hourLimit,
        reportType,
        powerBatches,
        powerTimeData,
        steelBatches,
        steelLineData,
        alarmRows,
        batchIds,
      });
    });
  });
});

module.exports = router;
