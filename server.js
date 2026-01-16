require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { initDb } = require("./db/db");

const dashboardRoutes = require("./routes/dashboard");
const alarmRoutes = require("./routes/alarms");
const dailyReportRoutes = require("./routes/dailyReport");
const historicalReportRoutes = require("./routes/historical");
const alarmSettingsRoutes = require("./routes/alarmSettings");
const componentLifeRoutes = require("./routes/componentLife");
const steelTypeSettings = require("./routes/steelTypeSettings");

const authRoutes = require("./routes/auth");
const { requireAuth, requireAdmin } = require("./middleware/auth");

const { startComponentLifeTicker } = require("./controllers/componentLifeTicker");

const app = express();

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://26.51.197.241:5173",
  "http://26.51.197.241:5174",
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());

/**
 * Initializes runtime database tables and required seed rows.
 */
initDb();

/**
 * Health check endpoint.
 */
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

/**
 * Public auth routes (no token required).
 */
app.use("/api/auth", authRoutes);

/**
 * Protected routes (JWT required).
 */
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use("/api/alarms", requireAuth, alarmRoutes);
app.use("/api/daily-report", requireAuth, dailyReportRoutes);
app.use("/api/historical-report", requireAuth, historicalReportRoutes);
app.use("/api/alarm-settings", requireAuth, alarmSettingsRoutes);
app.use("/api/steel-type-settings", requireAuth, steelTypeSettings);

/**
 * Admin-only routes (JWT + admin role required).
 */
app.use("/api/component-life", requireAuth, requireAdmin, componentLifeRoutes);

const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0";

let stopTicker = null;

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  stopTicker = startComponentLifeTicker();
  console.log("ComponentLife ticker started");
});

/**
 * Gracefully shuts down ticker before exiting the process.
 */
function shutdown() {
  console.log("Shutting down server...");
  try {
    if (stopTicker) stopTicker();
  } catch (e) {
    console.error("Error stopping ticker:", e);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
