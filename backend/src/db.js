// ============================================================
// SQLite 数据库连接（Node 22+ 内建 node:sqlite）
// - 同步 API，性能卓越
// - 默认启用 WAL 模式：读写并发，互不阻塞
// - 启动时若 db 文件不存在，自动建表 + 写入默认模块
// - 不需要 better-sqlite3 编译，Node 22+ 开箱即用
// ============================================================
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const dbPath = path.resolve(config.db.path);

// 确保 db 所在目录存在
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

// 性能与并发优化
db.exec('PRAGMA journal_mode = WAL');     // WAL 模式：读写并发
db.exec('PRAGMA synchronous = NORMAL');   // 写入性能与安全平衡
db.exec('PRAGMA foreign_keys = ON');      // 启用外键约束
db.exec('PRAGMA busy_timeout = 5000');    // 写入锁等待超时 5 秒

// ============================================================
// 启动时自动建表（首次启动执行）
// ============================================================
(function initSchema() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
})();

// ============================================================
// 统一查询接口（兼容旧 mysql2 调用风格）
// - SELECT  → 返回 [rows]
// - INSERT/UPDATE/DELETE → 返回 [{ affectedRows, lastInsertRowid }]
//
// 这样 routes/*.js 里的
//   const [rows] = await pool.query(...)
//   const [[row]] = await pool.query(...)
//   const [[{ total }]] = await pool.query(...)
// 全部继续可用，无需大改
// ============================================================
function isWrite(sql) {
  return /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|PRAGMA)/i.test(sql);
}

function query(sql, params = []) {
  try {
    const stmt = db.prepare(sql);

    if (isWrite(sql)) {
      const info = stmt.run(...(Array.isArray(params) ? params : [params]));
      return Promise.resolve([{ affectedRows: info.changes, lastInsertRowid: info.lastInsertRowid }]);
    }

    // SELECT 类
    const rows = stmt.all(...(Array.isArray(params) ? params : [params]));

    // 聚合单值（COUNT/MAX/MIN 无 GROUP BY）→ 包成 [rows[0]] 形式
    // 兼容 const [[{ total }]] = await pool.query(...)
    const trimmed = sql.trim();
    if (rows.length === 0) {
      return Promise.resolve([[]]);
    }
    if (
      rows.length === 1 &&
      /SELECT\s+(COUNT|MAX|MIN|AVG|SUM)\(/i.test(trimmed) &&
      !/GROUP BY/i.test(trimmed)
    ) {
      return Promise.resolve([[rows[0]]]);
    }
    return Promise.resolve([rows]);
  } catch (err) {
    return Promise.reject(err);
  }
}

module.exports = { db, query };
