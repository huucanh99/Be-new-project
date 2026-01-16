// routes/componentLife.js
const express = require("express");
const router = express.Router();
const { db } = require("../db/db");

/**
 * Returns the current timestamp formatted as YYYY-MM-DD HH:mm:ss.
 */
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

/**
 * Inserts a lifetime warning alarm into the alarms table for the given component.
 */
function insertLifetimeAlarm(componentId, cb) {
  const sql = `
    INSERT INTO alarms (type, location, start_time, end_time, details)
    VALUES (?, ?, ?, NULL, ?)
  `;
  const params = [
    "Lifetime Warning",
    componentId,
    nowString(),
    "Exceeded lifetime threshold",
  ];

  db.run(sql, params, (err) => {
    if (err) console.error("Error inserting lifetime alarm:", err);
    if (cb) cb(err);
  });
}

/**
 * GET /api/component-life
 * Returns the list of components and their lifetime tracking values.
 */
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
      console.error("DB error GET /api/component-life:", err);
      return res.status(500).json({ message: "DB error" });
    }

    const data = rows.map((r) => ({
      id: r.component_name,
      component_name: r.component_name,
      accumulated_hours: r.accumulated_hours,
      warning_hours: r.warning_hours,
      last_reset_at: r.last_reset_at,
    }));

    res.json(data);
  });
});

/**
 * POST /api/component-life
 * Updates warning_hours for multiple components.
 */
router.post("/", (req, res) => {
  const { items } = req.body || {};

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
      const compName = it.id;

      stmt.run([wh, compName], (err) => {
        if (err) console.error("Error updating warning_hours:", err);
      });
    });

    stmt.finalize((err) => {
      if (err) {
        console.error("DB error finalizing warning_hours update:", err);
        return res.status(500).json({ message: "DB error" });
      }
      res.json({ message: "Warning hours updated" });
    });
  });
});

/**
 * POST /api/component-life/reset
 * Resets accumulated_hours to 0 and updates last_reset_at, and also resets tick_state clock.
 */
router.post("/reset", (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ message: "id is required" });

  const compName = id;

  db.serialize(() => {
    db.run("BEGIN IMMEDIATE", (eBegin) => {
      if (eBegin) {
        console.error("Failed to begin transaction:", eBegin);
        return res.status(500).json({ message: "DB busy" });
      }

      const sql = `
        UPDATE component_life
        SET accumulated_hours = 0,
            last_reset_at = ?
        WHERE component_name = ?
      `;

      db.run(sql, [nowString(), compName], (err) => {
        if (err) {
          console.error("DB error resetting component life:", err);
          return db.run("ROLLBACK", () =>
            res.status(500).json({ message: "DB error" })
          );
        }

        const resetClockSql = `
          UPDATE tick_state
          SET last_tick_at = ?
          WHERE key = ?
        `;

        db.run(resetClockSql, [Date.now(), "component_life"], (err2) => {
          if (err2) {
            console.error("DB error resetting tick_state:", err2);
            return db.run("ROLLBACK", () =>
              res.status(500).json({ message: "DB error" })
            );
          }

          db.run("COMMIT", () => {
            res.json({ message: "Component reset to 0 hours" });
          });
        });
      });
    });
  });
});

/**
 * POST /api/component-life/tick
 * Manually adds deltaHours to a component and triggers a warning alarm when crossing threshold.
 */
router.post("/tick", (req, res) => {
  if (process.env.ENABLE_MANUAL_TICK !== "1") {
    return res.status(403).json({ message: "Manual tick disabled" });
  }

  const { id, deltaHours } = req.body || {};
  const dh = Number(deltaHours) || 0;

  if (!id || dh <= 0) {
    return res.status(400).json({ message: "id & positive deltaHours required" });
  }

  const compName = id;

  const selectSql = `
    SELECT component_name, accumulated_hours, warning_hours
    FROM component_life
    WHERE component_name = ?
  `;

  db.get(selectSql, [compName], (err, row) => {
    if (err) {
      console.error("DB error selecting component_life:", err);
      return res.status(500).json({ message: "DB error" });
    }
    if (!row) return res.status(404).json({ message: "Component not found" });

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
        console.error("DB error updating accumulated_hours:", err2);
        return res.status(500).json({ message: "DB error" });
      }

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
