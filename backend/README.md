# 健康小站 · 后端 API

> Node.js + Express + **SQLite**（Node 22+ 内建 `node:sqlite`）+ 阿里云 OSS

---

## 快速启动

```bash
# 1. 确保 Node.js 版本 >= 22（内建 node:sqlite）
node -v

# 2. 安装依赖
npm install

# 3. 复制环境变量
cp .env.example .env
# 编辑 .env，填入 OSS 密钥和管理员密码

# 4. 启动（首次启动会自动建表 + 写入默认模块）
npm start

# 访问
open http://localhost:3000
open http://localhost:3000/admin
```

---

## 数据库说明

- **SQLite 单文件**，路径在 `backend/data/health.db`（可在 `.env` 中改）
- **WAL 模式**：读写并发，互不阻塞
- **零运维**：无需安装/启动/配置独立的数据库服务
- **备份**：`cp data/health.db backup/health_20260709.db`（或 `sqlite3 .backup`）
- **容量上限**：单库可达 TB 级，本项目预估到几百 MB

---

## 目录结构

```
backend/
├── src/
│   ├── index.js          # Express 入口
│   ├── config.js         # 配置中心
│   ├── db.js             # SQLite 连接
│   ├── middleware/
│   │   ├── auth.js       # 简单 token 认证
│   │   └── validate.js   # 输入校验
│   └── routes/
│       ├── users.js      # 用户注册/管理登录
│       ├── track.js      # 事件追踪
│       ├── checkin.js    # 打卡同步
│       ├── content.js    # 内容模块
│       └── admin.js      # 管理后台
├── schema.sql            # SQLite 建表脚本（启动时自动执行）
├── public/index.html     # 管理后台前端
├── data/                 # SQLite 数据库目录
└── .env                  # 环境变量
```

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/health` | 健康检查 |
| POST | `/api/users` | 用户注册/登录 |
| POST | `/api/users/login` | 管理登录 |
| POST | `/api/track/event` | 事件追踪 |
| POST | `/api/track/video-watch` | 视频追踪 |
| GET  | `/api/checkin/todos` | 加载打卡 |
| POST | `/api/checkin/todos` | 同步打卡 |
| GET  | `/api/content` | 全部模块 |
| GET  | `/api/content/:moduleId` | 单个模块 |
| POST | `/api/content/:moduleId` | 更新模块 |
| POST | `/api/admin/upload` | 文件上传（需认证） |
| GET  | `/api/admin/stats` | 统计数据（需认证） |
| GET  | `/api/admin/events` | 事件列表（需认证） |
| GET  | `/api/admin/users` | 用户列表（需认证） |
| GET  | `/api/admin/video-stats` | 视频统计（需认证） |

---

## 部署到生产

参考仓库根目录的 `DEPLOYMENT_CHECKLIST.md`（已适配 SQLite 方案）。

关键点：
- 服务器安装 **Node.js 22+**（`node:sqlite` 是内建模块）
- 用 `pm2 start src/index.js -i 2` 启动双进程（利用 2 核）
- 定时 `sqlite3 data/health.db ".backup ..."` 备份数据库
- 大文件走 OSS + CDN，不经 ECS
