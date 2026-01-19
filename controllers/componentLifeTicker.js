// controllers/componentLifeTicker.js
// Runtime ticker: accumulates component_life hours based on wall-clock elapsed time.

const { db } = require("../db/db"); // ✅ sửa path theo db.js mới (hoặc "../db/db")

const TICK_INTERVAL_MS = 60_000;

// ⚠️ Mặc định hợp lý: mỗi phút tăng 1/60 giờ = 0.0166667h
// Nếu em muốn test nhanh thì set env: TICK_DELTA_HOURS_PER_STEP=1
const DELTA_HOURS_PER_STEP = Number(process.env.TICK_DELTA_HOURS_PER_STEP) || (1 / 60);

/**
 * Inserts a lifetime warning alarm for the given component.
 */
function insertLifetimeAlarm(componentName, cb) {
  const sql = `
    INSERT INTO alarms (type, location, start_time, end_time, details)
    VALUES (?, ?, datetime('now'), NULL, ?)
  `;
  db.run(
    sql,
    ["Lifetime Warning", componentName, "Exceeded lifetime threshold"],
    (err) => {
      if (err) console.error("Error inserting lifetime alarm:", err);
      if (cb) cb(err);
    }
  );
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

            // Nothing to do
            if (steps <= 0) {
              return db.run("COMMIT", () => resolve({ steps: 0, delta: 0 }));
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

                let hadError = false;

                (rows || []).forEach((r) => {
                  const before = Number(r.accumulated_hours) || 0;
                  const warning = Number(r.warning_hours) || 0;
                  const after = before + delta;

                  updateStmt.run([after, r.component_name], (eUp) => {
                    if (eUp) {
                      hadError = true;
                      console.error("Ticker update error:", eUp);
                    }
                  });

                  if (warning > 0 && before < warning && after >= warning) {
                    insertLifetimeAlarm(r.component_name);
                  }
                });

                updateStmt.finalize((eFin) => {
                  if (eFin || hadError) {
                    if (eFin) console.error("Ticker finalize error:", eFin);
                    return db.run("ROLLBACK", () =>
                      reject(eFin || new Error("Ticker update failed"))
                    );
                  }

                  const newLastTick =
                    state.last_tick_at + steps * TICK_INTERVAL_MS;

                  db.run(
                    "UPDATE tick_state SET last_tick_at = ? WHERE key = ?",
                    [newLastTick, "component_life"],
                    (err3) => {
                      if (err3) {
                        return db.run("ROLLBACK", () => reject(err3));
                      }
                      db.run("COMMIT", (eCommit) => {
                        if (eCommit) return reject(eCommit);
                        resolve({ steps, delta });
                      });
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
 * Returns a stop() function.
 */
function startComponentLifeTicker() {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;

    try {
      const r = await tickOnce();
      if (r.steps > 0) {
        console.log(`⏱️ ticker: +${r.delta}h (${r.steps} steps)`);
      }
    } catch (e) {
      console.error("ticker error:", e);
    } finally {
      running = false;
    }
  };

  // run immediately and then interval
  run();
  const timer = setInterval(run, TICK_INTERVAL_MS);

  return () => clearInterval(timer);
}

module.exports = { startComponentLifeTicker };
