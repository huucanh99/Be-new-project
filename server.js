require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { initDb } = require("./db/db");
const dashboardRoutes = require("./routes/dashboard");
const alarmRoutes = require("./routes/alarms");
const dailyReportRoutes = require("./routes/dailyReport");

const app = express();

app.use(
  cors({
    origin: "http://localhost:5174",
    credentials: true,
  })
);

app.use(express.json());

initDb();

app.get("/", (req, res) => {
  res.send("Backend is running!");
});

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/alarms", alarmRoutes);
app.use("/api/daily-report", dailyReportRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
