const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { db } = require("../db/db"); // nhớ đúng path theo project em

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: "Missing username/password" });
  }

  db.get(
    "SELECT id, username, password_hash, role FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err) return res.status(500).json({ message: "DB error" });
      if (!user) return res.status(401).json({ message: "Invalid credentials" });

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ message: "Invalid credentials" });

      const token = jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: "2h" }
      );

      return res.json({
        token,
        user: { id: user.id, username: user.username, role: user.role },
      });
    }
  );
});

module.exports = router;
