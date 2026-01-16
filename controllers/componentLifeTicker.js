// controllers/componentLifeTicker.js
const { db } = require("../db/db");

const TICK_INTERVAL_MS = 60_000;
const DELTA_HOURS_PER_STEP = 1;

/**
 * Returns the current timestamp formatted as YYYY-MM-DD HH:mm:ss.
 */
function nowString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Inserts a lifetime warning alarm for the given component.
 */
function insertLifetimeAlarm(componentId) {
  const sql = `
    INSERT INTO alarms (type, location, start_time, end_time, details)
    VALUES (?, ?, ?, NULL, ?)
  `;
  db.run(sql, [
    "Lifetime Warning",
    componentId,
    nowString(),
    "Exceeded lifetime threshold",
  ]);
}

/**
 * Executes one ticker cycle:
 * updates component lifetime hours and triggers warning alarms if needed.
 */
function tickOnce() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN IMMEDIATE", (eBegin) => {
        if (eBegin) return reject(eBegin);

        db.get(
          "SELECT last_tick_at FROM tick_state WHERE key = ?",
          ["component_life"],
          (err, state) => {
            if (err || !state) {
              return db.run("ROLLBACK", () =>
                reject(err || new Error("tick_state not found"))
              );
            }

            const now = Date.now();
            const elapsed = now - state.last_tick_at;
            const steps = Math.floor(elapsed / TICK_INTERVAL_MS);

            if (steps <= 0) {
              return db.run("COMMIT", () => resolve({ steps: 0 }));
            }

            const delta = steps * DELTA_HOURS_PER_STEP;

            db.all(
              `
              SELECT component_name, accumulated_hours, warning_hours
              FROM component_life
              `,
              [],
              (err2, rows) => {
                if (err2) {
                  return db.run("ROLLBACK", () => reject(err2));
                }

                const updateStmt = db.prepare(`
                  UPDATE component_life
                  SET accumulated_hours = ?
                  WHERE component_name = ?
                `);

                rows.forEach((r) => {
                  const before = Number(r.accumulated_hours) || 0;
                  const warning = Number(r.warning_hours) || 0;
                  const after = before + delta;

                  updateStmt.run([after, r.component_name]);

                  if (warning > 0 && before < warning && after >= warning) {
                    insertLifetimeAlarm(r.component_name);
                  }
                });

                updateStmt.finalize(() => {
                  db.run(
                    "UPDATE tick_state SET last_tick_at = ? WHERE key = ?",
                    [
                      state.last_tick_at +
                        steps * TICK_INTERVAL_MS,
                      "component_life",
                    ],
                    (err3) => {
                      if (err3) {
                        return db.run("ROLLBACK", () => reject(err3));
                      }
                      db.run("COMMIT", () =>
                        resolve({ steps, delta })
                      );
                    }
                  );
                });
              }
            );
          }
        );
      });
    });
  });
}

/**
 * Starts the component lifetime ticker and runs it at fixed intervals.
 */
function startComponentLifeTicker() {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;

    try {
      const r = await tickOnce();
      if (r.steps > 0) {
        console.log(`⏱️ ticker: +${r.delta}h`);
      }
    } catch (e) {
      console.error("ticker error:", e);
    } finally {
      running = false;
    }
  };

  run();
  const timer = setInterval(run, TICK_INTERVAL_MS);
  return () => clearInterval(timer);
}

module.exports = { startComponentLifeTicker };
