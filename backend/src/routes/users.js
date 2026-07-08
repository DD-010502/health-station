// POST /api/users       — 用户注册/登录（返回 token）
// POST /api/users/login — 管理后台登录
const router = require('express').Router();
const pool = require('../db');
const { generateToken, checkAdminPassword } = require('../middleware/auth');

// 用户注册/登录（供前端调用）
router.post('/', async (req, res) => {
  try {
    const { name, id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '昵称不能为空' });
    }

    const trimmed = name.trim().slice(0, 20);
    const token = generateToken();

    // 老用户更新
    if (id) {
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
      if (rows.length > 0) {
        await pool.query('UPDATE users SET name = ?, token = ?, updated_at = NOW() WHERE id = ?', [trimmed, token, id]);
        return res.json({ id, name: trimmed, token, created_at: rows[0].created_at, updated_at: new Date().toISOString() });
      }
    }

    // 新用户
    const newId = id || ('u-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now());
    await pool.query('INSERT INTO users (id, name, token) VALUES (?, ?, ?)', [newId, trimmed, token]);
    res.status(201).json({ id: newId, name: trimmed, token, created_at: new Date().toISOString() });
  } catch (err) {
    console.error('[users]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 管理后台登录（简单密码校验，返回 token）
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }
    if (!checkAdminPassword(password)) {
      return res.status(401).json({ error: '密码错误' });
    }

    // 查找或创建管理员用户
    const [rows] = await pool.query('SELECT * FROM users WHERE name = ?', [username]);
    let user;
    if (rows.length > 0) {
      const token = generateToken();
      await pool.query('UPDATE users SET token = ? WHERE id = ?', [token, rows[0].id]);
      user = { id: rows[0].id, name: rows[0].name, token };
    } else {
      const newId = 'admin-' + Math.random().toString(36).slice(2, 10);
      const token = generateToken();
      await pool.query('INSERT INTO users (id, name, token) VALUES (?, ?, ?)', [newId, username, token]);
      user = { id: newId, name: username, token };
    }

    res.json({ ...user, is_admin: true });
  } catch (err) {
    console.error('[users/login]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
