// routes/dailyReport.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db"); // dùng db sqlite có sẵn

// GET /api/daily-report?date=2025-11-27&uptoHour=16&reportType=Daily%20Total%20Report&batchId=Bxxxx
router.get("/", (req, res) => {
  const { date, uptoHour, reportType, batchId } = req.query;

  if (!date) {
    return res.status(400).json({ message: "date is required" });
  }

  const hourLimit = uptoHour ? parseInt(uptoHour, 10) : 23;

  // ===== 1. Lấy list tất cả batch trong ngày (để làm dropdown) =====
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

    const batchIds = (batchRows || []).map((r) => r.batch_code);

    // ===== 2. Lấy data chính cho chart =====
    //  - Daily / Shift report  -> tất cả batch trong ngày
    //  - Batch Summary         -> chỉ 1 batch được chọn (batchId)
    let whereExtra = "";
    const params = [date, hourLimit];

    if (reportType === "Batch Summary" && batchId) {
      whereExtra = " AND batch_code = ?";
      params.push(batchId);
    }

    const dataSql = `
      SELECT id, batch_code, date, time, power_kw
      FROM batches
      WHERE date = ?
        AND CAST(substr(time, 1, 2) AS INTEGER) <= ?
        ${whereExtra}
      ORDER BY time ASC
    `;

    db.all(dataSql, params, (err, rows) => {
      if (err) {
        console.error("Error loading daily report:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (!rows || rows.length === 0) {
        // Không có dữ liệu cho query này nhưng vẫn trả batchIds cho dropdown
        return res.json({
          date,
          uptoHour: hourLimit,
          reportType,
          powerBatches: [],
          powerTimeData: [],
          steelBatches: [],
          steelLineData: [],
          alarmRows: [],
          batchIds, // vẫn gửi list batch có trong ngày
        });
      }

      // Power theo batch
      const powerBatches = rows.map((r) => ({
        batch: r.batch_code,
        time: r.time,
        value: r.power_kw,
      }));

      // Power theo time (Batch Summary dùng cái này)
      const powerTimeData = rows.map((r) => ({
        time: r.time,
        value: r.power_kw,
      }));

      // Steel ball: tạm cho = power_kw * 0.8
      const steelBatches = rows.map((r) => ({
        batch: r.batch_code,
        time: r.time,
        value: Math.round(r.power_kw * 0.8),
      }));

      const steelLineData = steelBatches.map((b) => ({
        time: b.time,
        value: b.value,
      }));

      // Alarm: tạm để trống
      const alarmRows = [];

      return res.json({
        date,
        uptoHour: hourLimit,
        reportType,
        powerBatches,
        powerTimeData,
        steelBatches,
        steelLineData,
        alarmRows,
        batchIds, // luôn gửi list batch (distinct) trong ngày
      });
    });
  });
});

module.exports = router;
