// routes/alarms.js
const express = require("express");
const router = express.Router();

// ✅ ĐỔI import này theo db.js mới của em
// Nếu db.js mới nằm ở: be-project1/db.js  → dùng "../db"
// Nếu nằm ở: be-project1/db/db.js         → dùng "../db/db"
const { db } = require("../db/db"); // <-- sửa đúng path cho dự án của em

/**
 * GET /api/alarms
 * Returns alarm history ordered by most recent first.
 */
router.get("/", (req, res) => {
  const sql = `
    SELECT 
      id,
      type,
      COALESCE(location, '') AS location,
      start_time AS start,
      COALESCE(end_time, '') AS end,
      COALESCE(details, '') AS details
    FROM alarms
    ORDER BY datetime(start_time) DESC, id DESC
    LIMIT 100
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("DB error GET /api/alarms:", err);
      return res.status(500).json({ message: "DB error" });
    }
    return res.json(rows || []);
  });
});

/**
 * POST /api/alarms/ack/:id
 * Acknowledges an active alarm by setting its end_time.
 */
router.post("/ack/:id", (req, res) => {
  const alarmId = Number(req.params.id);
  if (!Number.isFinite(alarmId)) {
    return res.status(400).json({ message: "Invalid alarm id" });
  }

  const sql = `
    UPDATE alarms
    SET end_time = datetime('now')
    WHERE id = ?
      AND (end_time IS NULL OR end_time = '')
  `;

  db.run(sql, [alarmId], function (err) {
    if (err) {
      console.error("DB error POST /api/alarms/ack:", err);
      return res.status(500).json({ message: "DB error" });
    }

    if (this.changes === 0) {
      return res
        .status(404)
        .json({ message: "Alarm not found or already acknowledged" });
    }

    return res.json({ ok: true, updated: this.changes });
  });
});

module.exports = router;
