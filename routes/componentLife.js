// routes/componentLife.js
const express = require("express");
const router = express.Router();

// ✅ SỬA import theo vị trí db.js mới của em
const { db } = require("../db/db"); // hoặc "../db/db" tuỳ project

/**
 * Inserts a lifetime warning alarm into the alarms table for the given component.
 */
function insertLifetimeAlarm(componentName, cb) {
  const sql = `
    INSERT INTO alarms (type, location, start_time, end_time, details)
    VALUES (?, ?, datetime('now'), NULL, ?)
  `;
  const params = [
    "Lifetime Warning",
    componentName,
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
    SELECT
      component_name,
      accumulated_hours,
      warning_hours,
      last_reset_at
    FROM component_life
    ORDER BY component_name ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("DB error GET /api/component-life:", err);
      return res.status(500).json({ message: "DB error" });
    }

    const data = (rows || []).map((r) => ({
      id: r.component_name, // FE đang dùng id = name
      component_name: r.component_name,
      accumulated_hours: r.accumulated_hours,
      warning_hours: r.warning_hours,
      last_reset_at: r.last_reset_at,
    }));

    return res.json(data);
  });
});

/**
 * POST /api/component-life
 * Updates warning_hours for multiple components.
 * Body: { items: [{ id: "impeller1", warning_hours: 100 }, ...] }
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

  db.serialize(() => {
    db.run("BEGIN IMMEDIATE", (eBegin) => {
      if (eBegin) {
        console.error("Failed to begin transaction:", eBegin);
        return res.status(500).json({ message: "DB busy" });
      }

      const stmt = db.prepare(sql);
      let hadError = false;

      items.forEach((it) => {
        const compName = String(it?.id || "").trim();
        const wh = Number(it?.warning_hours);

        if (!compName) return;
        if (!Number.isFinite(wh) || wh < 0) return;

        stmt.run([wh, compName], (err) => {
          if (err) {
            hadError = true;
            console.error("Error updating warning_hours:", err, {
              compName,
              wh,
            });
          }
        });
      });

      stmt.finalize((err) => {
        if (err || hadError) {
          if (err) console.error("DB error finalize warning_hours:", err);
          return db.run("ROLLBACK", () =>
            res.status(500).json({ message: "DB error" })
          );
        }

        db.run("COMMIT", (eCommit) => {
          if (eCommit) {
            console.error("Commit error:", eCommit);
            return res.status(500).json({ message: "DB error" });
          }
          return res.json({ message: "Warning hours updated" });
        });
      });
    });
  });
});

/**
 * POST /api/component-life/reset
 * Body: { id: "impeller1" }
 * Resets accumulated_hours to 0 and updates last_reset_at,
 * and also resets tick_state clock.
 */
router.post("/reset", (req, res) => {
  const compName = String(req.body?.id || "").trim();
  if (!compName) return res.status(400).json({ message: "id is required" });

  db.serialize(() => {
    db.run("BEGIN IMMEDIATE", (eBegin) => {
      if (eBegin) {
        console.error("Failed to begin transaction:", eBegin);
        return res.status(500).json({ message: "DB busy" });
      }

      const resetCompSql = `
        UPDATE component_life
        SET accumulated_hours = 0,
            last_reset_at = datetime('now')
        WHERE component_name = ?
      `;

      db.run(resetCompSql, [compName], function (err) {
        if (err) {
          console.error("DB error resetting component_life:", err);
          return db.run("ROLLBACK", () =>
            res.status(500).json({ message: "DB error" })
          );
        }

        if (this.changes === 0) {
          return db.run("ROLLBACK", () =>
            res.status(404).json({ message: "Component not found" })
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

          db.run("COMMIT", (eCommit) => {
            if (eCommit) {
              console.error("Commit error:", eCommit);
              return res.status(500).json({ message: "DB error" });
            }
            return res.json({ message: "Component reset to 0 hours" });
          });
        });
      });
    });
  });
});

/**
 * POST /api/component-life/tick
 * Body: { id: "impeller1", deltaHours: 0.5 }
 * Manually adds deltaHours and triggers a warning alarm when crossing threshold.
 */
router.post("/tick", (req, res) => {
  if (process.env.ENABLE_MANUAL_TICK !== "1") {
    return res.status(403).json({ message: "Manual tick disabled" });
  }

  const compName = String(req.body?.id || "").trim();
  const dh = Number(req.body?.deltaHours);

  if (!compName || !Number.isFinite(dh) || dh <= 0) {
    return res.status(400).json({ message: "id & positive deltaHours required" });
  }

  db.serialize(() => {
    db.run("BEGIN IMMEDIATE", (eBegin) => {
      if (eBegin) {
        console.error("Failed to begin transaction:", eBegin);
        return res.status(500).json({ message: "DB busy" });
      }

      const selectSql = `
        SELECT accumulated_hours, warning_hours
        FROM component_life
        WHERE component_name = ?
      `;

      db.get(selectSql, [compName], (err, row) => {
        if (err) {
          console.error("DB error selecting component_life:", err);
          return db.run("ROLLBACK", () =>
            res.status(500).json({ message: "DB error" })
          );
        }
        if (!row) {
          return db.run("ROLLBACK", () =>
            res.status(404).json({ message: "Component not found" })
          );
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
            console.error("DB error updating accumulated_hours:", err2);
            return db.run("ROLLBACK", () =>
              res.status(500).json({ message: "DB error" })
            );
          }

          const finish = (payload) => {
            db.run("COMMIT", (eCommit) => {
              if (eCommit) {
                console.error("Commit error:", eCommit);
                return res.status(500).json({ message: "DB error" });
              }
              return res.json(payload);
            });
          };

          if (warning > 0 && wasUnder && nowOverOrEqual) {
            insertLifetimeAlarm(compName, () => {
              finish({
                message: "Tick updated & lifetime warning triggered",
                triggered: true,
                component: compName,
                accumulated_hours: after,
                warning_hours: warning,
              });
            });
          } else {
            finish({
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
  });
});

module.exports = router;
