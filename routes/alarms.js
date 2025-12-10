// routes/alarms.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

/* ============= Helper: format datetime ============= */
function nowString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-` +
    `${pad(now.getMonth() + 1)}-` +
    `${pad(now.getDate())} ` +
    `${pad(now.getHours())}:` +
    `${pad(now.getMinutes())}:` +
    `${pad(now.getSeconds())}`
  );
}

/* ===================================================
   GET /api/alarms
   → trả về lịch sử alarm (mới nhất trước)
   =================================================== */
router.get("/", (req, res) => {
  const sql = `
    SELECT 
      id,
      type,
      location,
      start_time AS start,
      COALESCE(end_time, '') AS end,
      COALESCE(details, '') AS details
    FROM alarms
    ORDER BY datetime(start_time) DESC, id DESC
    LIMIT 100
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("❌ DB error /api/alarms:", err);
      return res.status(500).json({ message: "DB error" });
    }

    res.json(rows);
  });
});

/* ===================================================
   POST /api/alarms/ack
   → “Acknowledge” tất cả alarm đang active
     (end_time IS NULL) bằng cách set end_time = now
   =================================================== */
router.post("/ack/:id", (req, res) => {
  const alarmId = req.params.id;

  const sql = `
    UPDATE alarms
    SET end_time = datetime('now')
    WHERE id = ? AND end_time IS NULL
  `;

  db.run(sql, [alarmId], function (err) {
    if (err) {
      console.error("❌ DB error /api/alarms/ack:", err);
      return res.status(500).json({ message: "DB error" });
    }

    if (this.changes === 0) {
      // không có hàng nào được update: id sai hoặc alarm đã được ack rồi
      return res
        .status(404)
        .json({ message: "Alarm not found or already acknowledged" });
    }

    console.log(`✅ Alarm ${alarmId} acknowledged`);
    res.json({ ok: true, updated: this.changes });
  });
});

module.exports = router;
