// routes/dashboard.js
const express = require("express");
const router = express.Router();

// GET /api/dashboard
router.get("/", (req, res) => {
  // DỮ LIỆU GIẢ DEMO – SAU NÀY LẤY TỪ DB/SENSOR
  const data = {
    batchId: "250930_0100",

    // CHỖ NÀY QUYẾT ĐỊNH MÀU:
    // 'operating' | 'standby' | 'abnormal' | 'offline'
    machineStatus: "abnormal", // thử abnormal để thấy nút Alert nhấp nháy

    steelBallWeight: 123.45, // KG

    voltage: {
      powerSupply: 123.01,
    },

    rpm: {
      impeller1: 123.01,
      impeller2: 123.01,
    },

    current: {
      powerSupply: 123.01,
      impeller1: 543.21, // > 500 cho nó danger
      impeller2: 123.01,
      dustCollector: 123.01,
    },

    power: {
      powerSupply: 123.01,
      impeller1: 123.01,
      impeller2: 123.01,
      dustCollector: 123.01,
    },
  };

  res.json(data);
});

module.exports = router;
