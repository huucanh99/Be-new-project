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

// ✅ NEW: auth routes + middleware
const authRoutes = require("./routes/auth");
const { requireAuth, requireAdmin } = require("./middleware/auth");

const app = express();

// 👇 list những origin được phép gọi API
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://26.51.197.241:5173", // IP Radmin + port Vite
  "http://26.51.197.241:5174",
];

app.use(
  cors({
    origin: (origin, cb) => {
      // cho phép request không có origin (Postman, cURL…)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());

initDb();

app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// ✅ NEW: login route (không cần token)
app.use("/api/auth", authRoutes);

// ✅ Protected routes: cần login
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use("/api/alarms", requireAuth, alarmRoutes);
app.use("/api/daily-report", requireAuth, dailyReportRoutes);
app.use("/api/historical-report", requireAuth, historicalReportRoutes);
app.use("/api/alarm-settings", requireAuth, alarmSettingsRoutes);
app.use("/api/steel-type-settings", requireAuth, steelTypeSettings);

// ✅ Admin-only routes: cần login + role admin
app.use("/api/component-life", requireAuth, requireAdmin, componentLifeRoutes);


// 👇 listen trên 0.0.0.0 để máy khác truy cập được
const PORT = process.env.PORT || 4000;
// app.listen(PORT, () => {
//   console.log(`Server running at http://localhost:${PORT}`);
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
