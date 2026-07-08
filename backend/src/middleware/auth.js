// 简单 Token 认证中间件
// 前端请求头: Authorization: Bearer <token>
// 将解析出的 user 对象挂载到 req.user

const crypto = require('crypto');
const pool = require('../db');

// 生成随机 token
function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

// 可选认证 — 有 token 就解析，没有也放行（用于追踪接口）
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(); // 无 token 也放行
  }

  const token = header.slice(7);
  try {
    const [rows] = await pool.query('SELECT id, name, token FROM users WHERE token = ?', [token]);
    if (rows.length > 0) {
      req.user = { id: rows[0].id, name: rows[0].name };
    }
  } catch (e) { /* 数据库错误也放行 */ }
  next();
}

// 强制认证 — 无有效 token 返回 401（用于管理接口）
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }

  const token = header.slice(7);
  try {
    const [rows] = await pool.query('SELECT id, name, token FROM users WHERE token = ?', [token]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'token 无效' });
    }
    req.user = { id: rows[0].id, name: rows[0].name };
    next();
  } catch (e) {
    res.status(500).json({ error: '服务器错误' });
  }
}

// 简单密码校验（管理后台登录用，从环境变量读取）
function checkAdminPassword(password) {
  const adminPwd = process.env.ADMIN_PASSWORD || 'admin123';
  return password === adminPwd;
}

module.exports = { generateToken, optionalAuth, requireAuth, checkAdminPassword };
