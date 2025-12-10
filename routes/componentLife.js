// routes/componentLife.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

/* =============== Helper: format datetime =============== */
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

/* =============== Helper: ghi alarm Lifetime vào DB =============== */
// Chỉ cần đẩy đúng format cho bảng `alarms` là được
function insertLifetimeAlarm(componentId, cb) {
  const sql = `
    INSERT INTO alarms (type, location, start_time, end_time, details)
    VALUES (?, ?, ?, NULL, ?)
  `;
  const params = [
    "Lifetime Warning",          // type
    componentId,                 // location (impeller1, filter, ...)
    nowString(),                 // start_time
    "Exceeded lifetime threshold", // details
  ];

  db.run(sql, params, (err) => {
    if (err) {
      console.error("❌ Error insert lifetime alarm:", err);
    } else {
      console.log("✅ Lifetime alarm inserted for", componentId);
    }
    if (cb) cb(err);
  });
}

/* ======================================================
   GET /api/component-life  → load danh sách component
   ====================================================== */
router.get("/", (req, res) => {
  const sql = `
    SELECT id,
           component_name,
           accumulated_hours,
           warning_hours,
           last_reset_at
    FROM component_life
    ORDER BY id ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("❌ Error /api/component-life (GET):", err);
      return res.status(500).json({ message: "DB error" });
    }

    const data = rows.map((r) => ({
      // FE dùng id = component_name = "impeller1", "blade1", ...
      id: r.component_name,
      component_name: r.component_name,
      accumulated_hours: r.accumulated_hours,
      warning_hours: r.warning_hours,
      last_reset_at: r.last_reset_at,
    }));

    res.json(data);
  });
});

/* ======================================================
   POST /api/component-life
   body: { items: [ { id, warning_hours } ] }
   → update warning_hours cho từng component
   ====================================================== */
router.post("/", (req, res) => {
  const { items } = req.body || {};
  console.log("POST /api/component-life body:", req.body);

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items is required" });
  }

  const sql = `
    UPDATE component_life
    SET warning_hours = ?
    WHERE component_name = ?
  `;
  const stmt = db.prepare(sql);

  db.serialize(() => {
    items.forEach((it) => {
      const wh = Number(it.warning_hours) || 0;
      const compName = it.id; // id = component_name luôn

      stmt.run([wh, compName], (err) => {
        if (err) {
          console.error("❌ Error update warning_hours:", err);
        } else {
          console.log(`✅ Updated warning_hours for ${compName} = ${wh}`);
        }
      });
    });

    stmt.finalize((err) => {
      if (err) {
        console.error("❌ Error finalize update:", err);
        return res.status(500).json({ message: "DB error" });
      }
      res.json({ message: "Warning hours updated" });
    });
  });
});

/* ======================================================
   POST /api/component-life/reset
   body: { id }
   → accumulated_hours = 0, ghi last_reset_at = now
   ====================================================== */
router.post("/reset", (req, res) => {
  const { id } = req.body || {};
  console.log("POST /api/component-life/reset body:", req.body);

  if (!id) {
    return res.status(400).json({ message: "id is required" });
  }

  const compName = id; // id = component_name

  const sql = `
    UPDATE component_life
    SET accumulated_hours = 0,
        last_reset_at = ?
    WHERE component_name = ?
  `;

  db.run(sql, [nowString(), compName], (err) => {
    if (err) {
      console.error("❌ Error reset component life:", err);
      return res.status(500).json({ message: "DB error" });
    }

    console.log(`✅ Reset component_life for ${compName} to 0h`);
    res.json({ message: "Component reset to 0 hours" });
  });
});

/* ======================================================
   POST /api/component-life/tick
   body: { id, deltaHours }
   → tăng accumulated_hours, nếu vượt warning_hours lần đầu
     thì ghi alarm vào bảng alarms
   ====================================================== */
router.post("/tick", (req, res) => {
  const { id, deltaHours } = req.body || {};
  const dh = Number(deltaHours) || 0;

  if (!id || dh <= 0) {
    return res
      .status(400)
      .json({ message: "id & positive deltaHours required" });
  }

  const compName = id; // id = component_name

  const selectSql = `
    SELECT component_name, accumulated_hours, warning_hours
    FROM component_life
    WHERE component_name = ?
  `;

  db.get(selectSql, [compName], (err, row) => {
    if (err) {
      console.error("❌ Error select component_life:", err);
      return res.status(500).json({ message: "DB error" });
    }
    if (!row) {
      return res.status(404).json({ message: "Component not found" });
    }

    const before = Number(row.accumulated_hours) || 0;
    const warning = Number(row.warning_hours) || 0;
    const after = before + dh;

    const wasUnder = before < warning;
    const nowOverOrEqual = after >= warning;

    const updateSql = `
      UPDATE component_life
      SET accumulated_hours = ?
      WHERE component_name = ?
    `;
    db.run(updateSql, [after, compName], (err2) => {
      if (err2) {
        console.error("❌ Error update accumulated_hours:", err2);
        return res.status(500).json({ message: "DB error" });
      }

      console.log(
        `✅ Tick ${compName}: ${before}h -> ${after}h (warning = ${warning}h)`
      );

      if (warning > 0 && wasUnder && nowOverOrEqual) {
        insertLifetimeAlarm(compName, () => {
          return res.json({
            message: "Tick updated & lifetime warning triggered",
            triggered: true,
            component: compName,
            accumulated_hours: after,
            warning_hours: warning,
          });
        });
      } else {
        return res.json({
          message: "Tick updated",
          triggered: false,
          component: compName,
          accumulated_hours: after,
          warning_hours: warning,
        });
      }
    });
  });
});

module.exports = router;
