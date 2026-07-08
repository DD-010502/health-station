// ============================================================
// 管理后台 API
// POST /api/admin/upload       — 上传文件到 OSS
// GET  /api/admin/stats        — 仪表板统计数据
// GET  /api/admin/events       — 事件列表（分页+筛选）
// GET  /api/admin/users        — 用户列表
// GET  /api/admin/video-stats  — 视频观看统计
// ============================================================
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const pool = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

// 所有管理接口需要认证
router.use(requireAuth);

// 安全解析 JSON 字段（mysql2 可能已自动解析）
function parseJsonField(val, fallback) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch (e) { return fallback; }
}

// --------------- 文件上传 ---------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

// 接受 file (主文件) + cover (视频封面，可选)
const uploadFields = upload.fields([
  { name: 'file',  maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);

let ossClient = null;
function getOssClient() {
  if (ossClient) return ossClient;
  if (!config.oss.accessKeyId) return null;
  const OSS = require('ali-oss');
  ossClient = new OSS({
    region: config.oss.region,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    bucket: config.oss.bucket,
    endpoint: config.oss.endpoint,
  });
  return ossClient;
}

async function uploadToOss(client, buffer, mimetype, prefix, ext) {
  const ossKey = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const result = await client.put(ossKey, buffer, {
    mime: mimetype,
    headers: { 'Cache-Control': 'public, max-age=31536000' },
  });
  return config.oss.cdnBase ? `${config.oss.cdnBase}/${ossKey}` : result.url;
}

router.post('/upload', uploadFields, async (req, res) => {
  try {
    const { type, module_id, title, desc } = req.body;

    if (!type || !['pdf', 'video'].includes(type)) return res.status(400).json({ error: 'type 必须是 pdf 或 video' });
    if (!module_id) return res.status(400).json({ error: '缺少 module_id (板块)' });

    const mainFile = (req.files && req.files.file && req.files.file[0]) || null;
    if (!mainFile) return res.status(400).json({ error: '未选择文件' });

    const client = getOssClient();

    // 无 OSS → 本地存储
    if (!client) {
      const fs = require('fs');
      const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads', type, module_id);
      fs.mkdirSync(uploadsDir, { recursive: true });

      const mainExt = mainFile.originalname.split('.').pop() || (type === 'pdf' ? 'pdf' : 'mp4');
      const mainName = Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.' + mainExt;
      fs.writeFileSync(path.join(uploadsDir, mainName), mainFile.buffer);
      const mainUrl = '/uploads/' + type + '/' + module_id + '/' + mainName;

      let coverUrl = null;
      if (type === 'video') {
        const coverFile = (req.files && req.files.cover && req.files.cover[0]) || null;
        if (coverFile) {
          const coverExt = coverFile.originalname.split('.').pop() || 'jpg';
          const coverName = Date.now() + '-cover-' + Math.random().toString(36).slice(2, 6) + '.' + coverExt;
          fs.writeFileSync(path.join(uploadsDir, coverName), coverFile.buffer);
          coverUrl = '/uploads/' + type + '/' + module_id + '/' + coverName;
        }
      }

      const fileId = module_id + '-' + type + '-' + Date.now();
      const response = { id: fileId, type, module_id, title: title || mainFile.originalname, url: mainUrl, size: mainFile.size };
      if (coverUrl) response.coverUrl = coverUrl;
      if (desc) response.desc = desc;
      return res.status(201).json(response);
    }

    // 上传主文件
    const mainExt = mainFile.originalname.split('.').pop() || (type === 'pdf' ? 'pdf' : 'mp4');
    const mainUrl = await uploadToOss(client, mainFile.buffer, mainFile.mimetype, `health/${type}/${module_id}`, mainExt);

    // 上传封面（仅视频）
    let coverUrl = null;
    if (type === 'video') {
      const coverFile = (req.files && req.files.cover && req.files.cover[0]) || null;
      if (coverFile) {
        const coverExt = coverFile.originalname.split('.').pop() || 'jpg';
        coverUrl = await uploadToOss(client, coverFile.buffer, coverFile.mimetype, `health/cover/${module_id}`, coverExt);
      }
    }

    const fileId = `${module_id}-${type}-${Date.now()}`;

    const response = {
      id: fileId,
      type,
      module_id,
      title: title || mainFile.originalname,
      url: mainUrl,
      size: mainFile.size,
    };
    if (coverUrl) response.coverUrl = coverUrl;
    if (desc) response.desc = desc;

    res.status(201).json(response);
  } catch (err) {
    console.error('[admin/upload]', err);
    res.status(500).json({ error: '上传失败: ' + err.message });
  }
});

// --------------- 统计数据 ---------------
router.get('/stats', async (req, res) => {
  try {
    const [[{ totalUsers }]]      = await pool.query('SELECT COUNT(*) AS totalUsers FROM users');
    const [[{ totalEvents }]]     = await pool.query('SELECT COUNT(*) AS totalEvents FROM events');
    const [[{ todayEvents }]]     = await pool.query("SELECT COUNT(*) AS todayEvents FROM events WHERE DATE(created_at) = CURDATE()");
    const [[{ totalVideos }]]     = await pool.query('SELECT COUNT(*) AS totalVideos FROM video_watch');
    const [[{ todayVideos }]]     = await pool.query("SELECT COUNT(*) AS todayVideos FROM video_watch WHERE DATE(created_at) = CURDATE()");

    // 各事件类型分布
    const [eventTypes] = await pool.query(
      'SELECT type, COUNT(*) AS count FROM events GROUP BY type ORDER BY count DESC LIMIT 10'
    );

    // 最近 7 天每日事件数
    const [dailyEvents] = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM events
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date`
    );

    // 各模块访问量
    const [moduleViews] = await pool.query(
      "SELECT module_id, COUNT(*) AS count FROM events WHERE type = 'view_module' GROUP BY module_id ORDER BY count DESC"
    );

    res.json({
      totalUsers, totalEvents, todayEvents, totalVideos, todayVideos,
      eventTypes, dailyEvents, moduleViews,
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// --------------- 事件列表（分页） ---------------
router.get('/events', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const type   = req.query.type || '';
    const userId = req.query.user_id || '';

    let where = 'WHERE 1=1';
    const params = [];
    if (type) { where += ' AND type = ?'; params.push(type); }
    if (userId) { where += ' AND user_id = ?'; params.push(userId); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM events ${where}`, params);
    const [rows] = await pool.query(
      `SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ total, page, limit, data: rows });
  } catch (err) {
    console.error('[admin/events]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// --------------- 用户列表 ---------------
router.get('/users', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM users');
    const [rows] = await pool.query(
      `SELECT u.*,
         (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id) AS event_count,
         (SELECT MAX(e.created_at) FROM events e WHERE e.user_id = u.id) AS last_active
       FROM users u
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({ total, page, limit, data: rows });
  } catch (err) {
    console.error('[admin/users]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// --------------- 单个用户详情 ---------------
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 用户基本信息
    const [[user]] = await pool.query('SELECT id, name, created_at, updated_at FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    // 事件统计
    const [[eventCounts]] = await pool.query(
      'SELECT type, COUNT(*) AS count FROM events WHERE user_id = ? GROUP BY type ORDER BY count DESC',
      [userId]
    );
    const [eventTypeRows] = await pool.query(
      'SELECT type, COUNT(*) AS count FROM events WHERE user_id = ? GROUP BY type ORDER BY count DESC',
      [userId]
    );

    // 视频观看统计
    const [[videoSummary]] = await pool.query(
      `SELECT COUNT(DISTINCT session_id) AS total_sessions,
              COUNT(DISTINCT video_id) AS total_videos,
              ROUND(AVG(percent), 1) AS avg_percent,
              ROUND(SUM(duration_sec * percent / 100), 1) AS total_watched_sec
       FROM video_watch WHERE user_id = ? AND event = 'tick'`,
      [userId]
    );

    // 打卡数据
    const [[checkin]] = await pool.query('SELECT * FROM checkin_data WHERE user_id = ?', [userId]);

    res.json({
      user,
      eventTypes: eventTypeRows,
      totalEvents: eventTypeRows.reduce((s, r) => s + r.count, 0),
      videoSummary: {
        totalSessions: videoSummary?.total_sessions || 0,
        totalVideos: videoSummary?.total_videos || 0,
        avgPercent: videoSummary?.avg_percent || 0,
        totalWatchedSec: videoSummary?.total_watched_sec || 0,
      },
      checkin: checkin ? {
        todos:      parseJsonField(checkin.todos, []),
        doneDates:  parseJsonField(checkin.done_dates, []),
        doneTasks:  parseJsonField(checkin.done_tasks, {}),
        updatedAt:  checkin.updated_at,
      } : null,
    });
  } catch (err) {
    console.error('[admin/user-detail]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 单个用户的事件列表
router.get('/users/:userId/events', async (req, res) => {
  try {
    const { userId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM events WHERE user_id = ?', [userId]);
    const [rows] = await pool.query(
      'SELECT * FROM events WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );

    res.json({ total, page, limit, data: rows });
  } catch (err) {
    console.error('[admin/user-events]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 单个用户的视频观看记录
router.get('/users/:userId/video-watch', async (req, res) => {
  try {
    const { userId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM video_watch WHERE user_id = ?', [userId]);
    const [rows] = await pool.query(
      `SELECT session_id, video_id, module_id, event, position_sec, duration_sec, percent, created_at
       FROM video_watch WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    res.json({ total, page, limit, data: rows });
  } catch (err) {
    console.error('[admin/user-videos]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// --------------- 视频观看统计 ---------------
router.get('/video-stats', async (req, res) => {
  try {
    // 各视频观看人次和平均完成度
    const [videoStats] = await pool.query(
      `SELECT video_id, module_id,
         COUNT(*) AS total_events,
         COUNT(DISTINCT session_id) AS total_sessions,
         COUNT(DISTINCT user_id) AS total_users,
         ROUND(AVG(percent), 1) AS avg_percent,
         ROUND(AVG(duration_sec), 1) AS avg_duration
       FROM video_watch
       GROUP BY video_id, module_id
       ORDER BY total_sessions DESC LIMIT 50`
    );

    // 最近 7 天每日观看次数
    const [dailyWatch] = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM video_watch
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date`
    );

    res.json({ videoStats, dailyWatch });
  } catch (err) {
    console.error('[admin/video-stats]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
