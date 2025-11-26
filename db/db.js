// db/db.js
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

// Hàm khởi tạo DB + tạo user admin mặc định nếu chưa có
function initDb() {
  db.serialize(() => {
    // Tạo bảng users
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL
      )`
    );

    const adminUser = process.env.ADMIN_USER || "admin";
    const adminPass = process.env.ADMIN_PASS || "123456";

    // Kiểm tra xem admin đã tồn tại chưa
    db.get(
      "SELECT id FROM users WHERE username = ?",
      [adminUser],
      (err, row) => {
        if (err) {
          console.error("Error checking admin user:", err);
          return;
        }

        if (!row) {
          // Chưa có admin → tạo mới
          bcrypt.hash(adminPass, 10, (err, hash) => {
            if (err) {
              console.error("Error hashing admin password:", err);
              return;
            }

            db.run(
              "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
              [adminUser, hash, "admin"],
              (err2) => {
                if (err2) {
                  console.error("Error inserting admin user:", err2);
                } else {
                  console.log(
                    `Created default admin user: ${adminUser} / ${adminPass}`
                  );
                }
              }
            );
          });
        } else {
          console.log("Admin user already exists.");
        }
      }
    );
  });
}

module.exports = { db, initDb };
