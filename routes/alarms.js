// routes/alarms.js
const express = require("express");
const router = express.Router();
const { authRequired } = require("../middleware/authMiddleware");

// GET /api/alarms
router.get("/", authRequired, (req, res) => {
  const alarms = [
    {
      type: "Current Abnormality",
      location: "Impeller 2",
      start: "25/09/30 10:30:00",
      end: "25/09/30 10:30:00",
      details: "",
    },
    {
      type: "Lifetime Warning",
      location: "Impeller 1",
      start: "25/09/30 08:30:00",
      end: "25/09/30 09:30:00",
      details: "Overtime",
    },
    {
      type: "Weight Abnormal",
      location: "",
      start: "25/09/30 08:30:00",
      end: "25/09/30 09:30:00",
      details: "",
    },
    {
      type: "Lifetime Warning",
      location: "Claw 1",
      start: "25/09/30 08:30:00",
      end: "",
      details: "Overtime",
    },
    {
      type: "Lifetime Warning",
      location: "Claw 1",
      start: "25/09/30 08:30:00",
      end: "",
      details: "Overtime",
    },
    {
      type: "Current Abnormality",
      location: "Dust Collector",
      start: "25/09/30 08:40:00",
      end: "25/09/30 08:40:30",
      details: "",
    },
  ];

  res.json(alarms);
});

module.exports = router;
