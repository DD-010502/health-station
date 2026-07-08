-- ============================================================
-- 健康小站 · MySQL 数据库建表脚本
-- 使用方法: mysql -u root -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS health_station
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE health_station;

-- -----------------------------------------------------------
-- 1. 用户表
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(64)  PRIMARY KEY,
  name        VARCHAR(64)  NOT NULL,
  token       VARCHAR(64)  DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 2. 事件追踪表（通用事件）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(64)  NOT NULL,
  user_name   VARCHAR(64)  NOT NULL,
  type        VARCHAR(32)  NOT NULL COMMENT '事件类型: set_nickname,add_task,remove_task,checkin,open_letter,view_module,open_pdf,open_video',
  module_id   VARCHAR(32)  DEFAULT NULL,
  target_id   VARCHAR(64)  DEFAULT NULL,
  payload     JSON         DEFAULT NULL COMMENT '额外字段 (task_label, date, href, session_id 等)',
  ts          BIGINT       NOT NULL COMMENT '客户端时间戳 (毫秒)',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_type (type),
  INDEX idx_ts (ts),
  INDEX idx_user_type (user_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 3. 视频观看追踪表
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_watch (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(64)   NOT NULL,
  user_name     VARCHAR(64)   NOT NULL,
  session_id    VARCHAR(64)   NOT NULL COMMENT '单次观看会话',
  module_id     VARCHAR(32)   DEFAULT NULL,
  video_id      VARCHAR(64)   NOT NULL,
  event         VARCHAR(16)   NOT NULL COMMENT 'play|pause|seek|end|tick|close',
  position_sec  DECIMAL(8,1)  DEFAULT 0,
  duration_sec  DECIMAL(8,1)  DEFAULT 0,
  percent       DECIMAL(5,1)  DEFAULT 0,
  ts            BIGINT        NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_user_video (user_id, video_id),
  INDEX idx_ts (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 4. 打卡数据表
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkin_data (
  user_id     VARCHAR(64)  PRIMARY KEY,
  todos       JSON         DEFAULT NULL COMMENT '打卡任务列表',
  done_dates  JSON         DEFAULT NULL COMMENT '已完成日期数组 ["2026-07-08",...]',
  done_tasks  JSON         DEFAULT NULL COMMENT '{ "2026-07-08": ["task1","task2"], ... }',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 5. 模块内容表（CMS）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_modules (
  module_key       VARCHAR(32)  PRIMARY KEY COMMENT 'diet,exercise,sleep,screen,habits,mental,loop,action',
  name             VARCHAR(64)  NOT NULL,
  intro_title      VARCHAR(128) DEFAULT NULL,
  intro_paragraphs JSON         DEFAULT NULL COMMENT '段落数组',
  pdfs             JSON         DEFAULT NULL COMMENT '[{id,title,url},...]',
  videos           JSON         DEFAULT NULL COMMENT '[{id,title,desc,url,poster},...]',
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 插入默认模块
INSERT INTO content_modules (module_key, name) VALUES
  ('diet',     '营养饮食'),
  ('exercise', '积极运动'),
  ('sleep',    '良好睡眠'),
  ('screen',   '合理视屏'),
  ('habits',   '禁烟禁酒'),
  ('mental',   '心理健康'),
  ('loop',     '环环相扣的健康行为'),
  ('action',   '计划与行动')
ON DUPLICATE KEY UPDATE name = VALUES(name);
