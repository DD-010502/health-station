// POST /api/track/event      — 通用事件追踪
// POST /api/track/video-watch — 视频观看追踪
const router = require('express').Router();
const pool = require('../db');

// 通用事件
router.post('/event', async (req, res) => {
  try {
    const { user_id, user_name, type, module_id, target_id, ts, ...rest } = req.body;

    if (!user_id || !type) {
      return res.status(400).json({ error: '缺少 user_id 或 type' });
    }

    // 将额外字段打包成 payload JSON
    const payload = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;

    await pool.query(
      'INSERT INTO events (user_id, user_name, type, module_id, target_id, payload, ts) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user_id, user_name || '', type, module_id || null, target_id || null, payload, ts || Date.now()]
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[track/event]', err);
    // 追踪接口不应阻塞前端 — 即使失败也返回 201
    res.status(201).json({ ok: true, warning: 'logged with error' });
  }
});

// 视频观看追踪
router.post('/video-watch', async (req, res) => {
  try {
    const {
      user_id, user_name, session_id, module_id, video_id,
      event, positionSec, durationSec, percent, ts,
    } = req.body;

    if (!user_id || !video_id || !event) {
      return res.status(400).json({ error: '缺少必要字段' });
    }

    await pool.query(
      `INSERT INTO video_watch
         (user_id, user_name, session_id, module_id, video_id, event, position_sec, duration_sec, percent, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id, user_name || '', session_id || '', module_id || null, video_id,
        event, positionSec || 0, durationSec || 0, percent || 0, ts || Date.now(),
      ]
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[track/video-watch]', err);
    res.status(201).json({ ok: true, warning: 'logged with error' });
  }
});

module.exports = router;
