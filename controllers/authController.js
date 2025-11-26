// controllers/authController.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { db } = require("../db/db");

const JWT_SECRET = process.env.JWT_SECRET || "secret";

// POST /api/auth/login
exports.login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "Server error" });
      }

      if (!user) {
        return res
          .status(401)
          .json({ message: "Invalid username or password" });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res
          .status(401)
          .json({ message: "Invalid username or password" });
      }

      const payload = {
        id: user.id,
        username: user.username,
        role: user.role,
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "2h" });

      res.json({
        token,
        user: payload,
      });
    }
  );
};

// GET /api/auth/me (đã qua middleware auth)
exports.me = (req, res) => {
  // req.user do middleware gán
  res.json({ user: req.user });
};
