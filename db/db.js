// db/db.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Đường dẫn tới file SQLite
const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

// initDb: hiện tại không tạo bảng hay seed gì cả
// Bảng batches sẽ do seed-batches.js tạo & seed
function initDb() {
  console.log("✅ SQLite DB connected (no auto tables, no seeding from db.js)");
}

module.exports = {
  db,
  initDb,
};
