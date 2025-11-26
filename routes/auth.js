// routes/auth.js
const express = require("express");
const router = express.Router();

const { login, me } = require("../controllers/authController");
const { authRequired, adminOnly } = require("../middleware/authMiddleware");

// Đăng nhập
router.post("/login", login);

// Lấy thông tin user hiện tại (cần token)
router.get("/me", authRequired, me);

// Ví dụ route chỉ admin được vào
router.get("/admin-test", authRequired, adminOnly, (req, res) => {
  res.json({ message: "Hello admin! This is protected data." });
});

module.exports = router;
