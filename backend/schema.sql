-- ============================================================
-- 健康小站 · SQLite 数据库建表脚本
-- 使用方法: sqlite3 data/health.db < schema.sql
-- 或自动: 启动后端时若 db 文件不存在，会自动建表
-- ============================================================

-- -----------------------------------------------------------
-- 1. 用户表
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          TEXT        PRIMARY KEY,
  name        TEXT        NOT NULL,
  token       TEXT        DEFAULT NULL,
  created_at  TEXT        NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT        NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_name  ON users(name);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);

-- -----------------------------------------------------------
-- 2. 事件追踪表（通用事件）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER     PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT        NOT NULL,
  user_name   TEXT        NOT NULL,
  type        TEXT        NOT NULL,                     -- set_nickname,add_task,remove_task,checkin,open_letter,view_module,open_pdf,open_video
  module_id   TEXT        DEFAULT NULL,
  target_id   TEXT        DEFAULT NULL,
  payload     TEXT        DEFAULT NULL,                 -- JSON string: 额外字段 (task_label, date, href, session_id 等)
  ts          INTEGER     NOT NULL,                     -- 客户端时间戳 (毫秒)
  created_at  TEXT        NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_user     ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type     ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_ts       ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_user_typ ON events(user_id, type);

-- -----------------------------------------------------------
-- 3. 视频观看追踪表
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_watch (
  id            INTEGER    PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT       NOT NULL,
  user_name     TEXT       NOT NULL,
  session_id    TEXT       NOT NULL,                    -- 单次观看会话
  module_id     TEXT       DEFAULT NULL,
  video_id      TEXT       NOT NULL,
  event         TEXT       NOT NULL,                    -- play|pause|seek|end|tick|close
  position_sec  REAL       DEFAULT 0,
  duration_sec  REAL       DEFAULT 0,
  percent       REAL       DEFAULT 0,
  ts            INTEGER    NOT NULL,
  created_at    TEXT       NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vw_session    ON video_watch(session_id);
CREATE INDEX IF NOT EXISTS idx_vw_user_video ON video_watch(user_id, video_id);
CREATE INDEX IF NOT EXISTS idx_vw_ts         ON video_watch(ts);

-- -----------------------------------------------------------
-- 4. 打卡数据表
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkin_data (
  user_id     TEXT    PRIMARY KEY,
  todos       TEXT    DEFAULT NULL,                    -- JSON: 打卡任务列表
  done_dates  TEXT    DEFAULT NULL,                    -- JSON: 已完成日期数组 ["2026-07-08",...]
  done_tasks  TEXT    DEFAULT NULL,                    -- JSON: { "2026-07-08": ["task1","task2"], ... }
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------
-- 5. 模块内容表（CMS）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_modules (
  module_key        TEXT     PRIMARY KEY,               -- diet,exercise,sleep,screen,habits,mental,loop,action
  name              TEXT     NOT NULL,
  intro_title       TEXT     DEFAULT NULL,
  intro_paragraphs  TEXT     DEFAULT NULL,              -- JSON: 段落数组
  pdfs              TEXT     DEFAULT NULL,              -- JSON: [{id,title,url},...]
  videos            TEXT     DEFAULT NULL,              -- JSON: [{id,title,desc,url,poster},...]
  updated_at        TEXT     NOT NULL DEFAULT (datetime('now'))
);

-- 插入默认模块（SQLite 用 INSERT OR IGNORE 替代 ON DUPLICATE KEY）
INSERT OR IGNORE INTO content_modules (module_key, name) VALUES
  ('diet',     '营养饮食'),
  ('exercise', '积极运动'),
  ('sleep',    '良好睡眠'),
  ('screen',   '合理视屏'),
  ('habits',   '禁烟禁酒'),
  ('mental',   '心理健康'),
  ('loop',     '环环相扣的健康行为'),
  ('action',   '计划与行动');
