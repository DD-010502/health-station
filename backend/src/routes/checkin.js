// GET  /api/checkin/todos  — 加载用户打卡数据
// POST /api/checkin/todos  — 全量同步打卡数据
// POST /api/checkin/done   — 记录单条打卡
const router = require('express').Router();
const pool = require('../db');

// 加载打卡数据
router.get('/todos', async (req, res) => {
  try {
    const user_id = req.query.user_id;
    if (!user_id) return res.status(400).json({ error: '缺少 user_id' });

    const [rows] = await pool.query('SELECT * FROM checkin_data WHERE user_id = ?', [user_id]);

    if (rows.length === 0) {
      return res.json({ todos: [], doneDates: [], doneTasks: {} });
    }

    const parseField = (val, fb) => {
      if (val === null || val === undefined) return fb;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch(e) { return fb; }
    };
    res.json({
      todos:      parseField(rows[0].todos, []),
      doneDates:  parseField(rows[0].done_dates, []),
      doneTasks:  parseField(rows[0].done_tasks, {}),
    });
  } catch (err) {
    console.error('[checkin/get]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 全量同步
router.post('/todos', async (req, res) => {
  try {
    const { user_id, todos, doneDates, doneTasks } = req.body;
    if (!user_id) return res.status(400).json({ error: '缺少 user_id' });

    await pool.query(
      `INSERT INTO checkin_data (user_id, todos, done_dates, done_tasks, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         todos = excluded.todos,
         done_dates = excluded.done_dates,
         done_tasks = excluded.done_tasks,
         updated_at = datetime('now')`,
      [
        user_id,
        JSON.stringify(todos || []),
        JSON.stringify(doneDates || []),
        JSON.stringify(doneTasks || {}),
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[checkin/sync]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
