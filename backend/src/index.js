// ============================================================
// 健康小站 · 后端 API 服务
// Node.js + Express + MySQL + 阿里云 OSS
// ============================================================
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const config = require('./config');
const { optionalAuth } = require('./middleware/auth');

// 路由
const usersRouter   = require('./routes/users');
const trackRouter   = require('./routes/track');
const checkinRouter = require('./routes/checkin');
const contentRouter = require('./routes/content');
const adminRouter   = require('./routes/admin');

const app = express();

// --------------- 中间件 ---------------
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(optionalAuth);                          // 解析 token（不强制）
if (config.debug) app.use(morgan('dev'));

// --------------- 静态文件 ---------------
// 前端项目根目录（backend/ 的上级，即 try/）
const frontendRoot = path.join(__dirname, '..', '..');

// 管理后台
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use('/admin', express.static(path.join(__dirname, '..', 'public')));

// --------------- API 路由 ---------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), user: req.user || null });
});

app.use('/api/users',   usersRouter);      // POST /api/users, /api/users/login
app.use('/api/track',   trackRouter);      // POST /api/track/event, /api/track/video-watch
app.use('/api/checkin', checkinRouter);    // GET/POST /api/checkin/todos
app.use('/api/content', contentRouter);    // GET /api/content/:moduleId
app.use('/api/admin',   adminRouter);      // CRUD + 上传（需认证）

// --------------- 上传文件（本地存储模式）---------------
app.use('/uploads', express.static(path.join(frontendRoot, 'uploads')));

// --------------- 前端页面（托管整个 try/ 目录）---------------
app.use(express.static(frontendRoot, {
  index: 'index.html',
  extensions: ['html'],
}));

// 所有非 API 路径返回 index.html（SPA fallback）
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  // 对于其他路径，尝试返回 index.html（SPA 路由）
  res.sendFile(path.join(frontendRoot, 'index.html'));
});

// --------------- 全局错误处理 ---------------
app.use((err, req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// --------------- 启动 ---------------
app.listen(config.port, () => {
  console.log(`\n  🏥 健康小站 API 已启动 → http://localhost:${config.port}\n`);
  console.log(`  公开接口:`);
  console.log(`    POST /api/users             — 用户注册/登录`);
  console.log(`    POST /api/track/event       — 事件追踪`);
  console.log(`    POST /api/track/video-watch — 视频追踪`);
  console.log(`    GET  /api/checkin/todos     — 打卡数据`);
  console.log(`    GET  /api/content/:moduleId — 模块内容`);
  console.log(`\n  管理后台:`);
  console.log(`    GET  /admin                 — 管理面板`);
  console.log(`    POST /api/users/login       — 管理员登录`);
  console.log(`    GET  /api/admin/stats       — 统计数据`);
  console.log(`    GET  /api/admin/events      — 事件列表`);
  console.log(`    GET  /api/admin/users       — 用户列表`);
  console.log(`    POST /api/admin/upload      — 文件上传\n`);
  if (!config.oss.accessKeyId) {
    console.warn('  ⚠ OSS 未配置 — 文件上传功能不可用。请复制 .env.example 为 .env\n');
  }
});
