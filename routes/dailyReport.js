// routes/dailyReport.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

router.get("/", (req, res) => {
  const { date, uptoHour, reportType, batchId, shift } = req.query;

  if (!date) {
    return res.status(400).json({ message: "date is required" });
  }

  const hourLimit = uptoHour ? parseInt(uptoHour, 10) : 23;

  // =========================
  // 1. Lấy list batch cho dropdown
  //    Batch Summary: lấy toàn bộ batch trong ngày (KHÔNG lọc theo giờ)
  //    Các report khác: dùng full day cho dropdown
  // =========================
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

    // =========================
    // 2. WHERE clause chính cho data
    // =========================
    let whereClause = "";
    let params = [];

    // ---- SHIFT REPORT ----
    if (reportType === "Shift Report" && shift) {
      whereClause = `WHERE date = ?`;
      params = [date];

      if (shift == 1) {
        // Night Shift: 22:00 -> 06:00
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
    }
    // ---- BATCH SUMMARY: KHÔNG LỌC THEO uptoHour, chỉ lọc date + batch ----
    else if (reportType === "Batch Summary") {
      whereClause = `WHERE date = ?`;
      params = [date];

      if (batchId) {
        whereClause += ` AND batch_code = ?`;
        params.push(batchId);
      }
    }
    // ---- DAILY TOTAL REPORT (và fallback khác) ----
    else {
      whereClause = `
        WHERE date = ?
          AND CAST(substr(time,1,2) AS INTEGER) <= ?
      `;
      params = [date, hourLimit];
    }

    // =========================
    // 3. SQL lấy data
    // =========================
    const dataSql = `
      SELECT batch_code, date, time, power_kw
      FROM batches
      ${whereClause}
      ORDER BY batch_code ASC, time ASC
    `;

    console.log("SQL:", dataSql.replace(/\s+/g, " "));
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

      let powerBatches = [];
      let powerTimeData = [];
      let steelBatches = [];
      let steelLineData = [];
      const alarmRows = []; // hiện tại chưa dùng

      // =====================================================
      // 1) DAILY TOTAL REPORT — TỔNG POWER THEO BATCH
      // =====================================================
      if (reportType === "Daily Total Report") {
        const batchAgg = {}; // { batch_code: { total } }

        rows.forEach((r) => {
          const p = Number(r.power_kw) || 0;
          if (!batchAgg[r.batch_code]) {
            batchAgg[r.batch_code] = { total: 0 };
          }
          batchAgg[r.batch_code].total += p;
        });

        // KHÔNG làm tròn, trả ra raw sum
        powerBatches = Object.keys(batchAgg).map((batch) => ({
          batch,
          value: batchAgg[batch].total,
        }));

        // steel = 0.8 * power, KHÔNG làm tròn
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
        });
      }

      // =====================================================
      // 2) BATCH SUMMARY — TRẢ FULL TIME SERIES CỦA BATCH
      //    (KHÔNG DÙNG uptoHour LỌC NỮA)
      // =====================================================
      if (reportType === "Batch Summary") {
        powerTimeData = rows.map((r) => ({
          time: r.time,
          value: Number(r.power_kw) || 0, // giữ nguyên số từ DB
        }));

        steelLineData = rows.map((r) => {
          const p = Number(r.power_kw) || 0;
          return {
            time: r.time,
            value: p * 0.8, // KHÔNG làm tròn, để FE tự format
          };
        });

        return res.json({
          date,
          uptoHour: hourLimit, // FE vẫn có thể hiển thị, nhưng không dùng để lọc
          reportType,
          powerBatches: [],
          powerTimeData,
          steelBatches: [],
          steelLineData,
          alarmRows,
          batchIds,
        });
      }

      // =====================================================
      // 3) SHIFT REPORT — TỔNG POWER THEO BATCH TRONG CA
      // =====================================================
      if (reportType === "Shift Report") {
        const batchAgg = {};

        rows.forEach((r) => {
          const p = Number(r.power_kw) || 0;
          if (!batchAgg[r.batch_code]) {
            batchAgg[r.batch_code] = { total: 0 };
          }
          batchAgg[r.batch_code].total += p;
        });

        // KHÔNG làm tròn
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
        });
      }

      // Fallback nếu reportType lạ
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
      });
    });
  });
});

module.exports = router;
