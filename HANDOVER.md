# 健康小站 · 项目交接文档

> 写给一个**完全没有上下文**的新会话 / 新协作者。
> 请先通读本文档，再做任何改动。
> 最后更新：2026-07-09

---

## 0. 一句话总结

这是一个**健康教育主题的静态网站 + Node.js 后端**，目标用户是大中小学生。
原计划部署到阿里云 MySQL ECS，本会话已**完成 SQLite 改造**，并正在做部署前的本地验证。

---

## 1. 项目是什么

### 1.1 业务目标

- 网站名：「How do you keep healthy?」健康小站
- 目标用户：青少年
- 形式：单页 SPA + 5 个 iframe 互动子模块 + 4 个独立子页面
- 核心功能：
  - 用户输入昵称（无登录）
  - 浏览 6 大健康知识模块（饮食、运动、睡眠、视屏、烟酒、心理）
  - 视频播放 + 进度追踪
  - 每日打卡（localStorage + 后端双写）
  - 管理后台查看统计数据
- 规模：约 400 用户

### 1.2 技术栈

| 层级 | 选型 | 备注 |
|------|------|------|
| 前端 | 纯 HTML/CSS/JS | 无构建工具，**直接打开 HTML 即可** |
| 后端 | Node.js 22+ + Express | 用 `node:sqlite`（内建模块） |
| 数据库 | **SQLite**（单文件）| 本会话从 MySQL 改造而来 |
| 文件存储 | 阿里云 OSS（PDF/视频）| 未配置时降级到本地 |
| 部署 | 阿里云轻量应用服务器（计划）| **未部署** |

### 1.3 仓库信息

- GitHub: `https://github.com/DD-010502/health-station`
- 本地路径: `/Users/dd/Documents/html/try/`
- 当前分支: `main`
- 最新 commit: `c5a0a57`（轻量香港节点部署文档）

---

## 2. 当前进展

### 2.1 已完成 ✅

| 任务 | 状态 | commit |
|------|------|--------|
| 项目基础架构（前端 + 后端 + 5 个 API 路由组）| ✅ | v1.0 |
| 后端从 MySQL 改造为 SQLite | ✅ | `68add20` |
| 本地 API 全量冒烟测试（15 个端点）| ✅ | - |
| 部署文档重写为轻量香港节点方案 | ✅ | `c5a0a57` |
| 前端 race condition bug 修复 | ✅ | 未提交 |

### 2.2 进行中 🚧

- **前端打卡链路本地验证**：用户报告「前端打卡但管理后台看不到数据」已定位为 race condition，代码已改，**等待用户硬刷新验证**。

### 2.3 待办 📋

按时间顺序：

1. **本地验证修复生效**（用户正在做）
2. 修复 commit 到 git 并 push
3. 写 `deploy.sh` 一键部署脚本
4. 写 `runbook.md` 部署步骤清单
5. 用户购买轻量应用服务器（香港 2核2G 200Mbps 套餐）
6. 用户购买域名 + 开通 OSS + CDN
7. 执行部署上线
8. 上传内容素材（PDF/视频/图片）到 OSS
9. 全流程线上测试

---

## 3. 当前卡在哪（重点）

### 3.1 用户报告的现象

> 「前端点击打卡，但管理后台没有用户记录」

### 3.2 已确认的根因

**前端 `track()` 函数存在 race condition**：

- `index.html` 第 485 行：点击「确认」按钮时，`saveUser(name)` 是 `async` 函数（内部有 `await fetch`），但调用时**没有 `await`**
- 导致 `track({type: 'set_nickname'})` 在 `localStorage.setItem()` 写入前就执行
- track 函数读不到 user_id，但仍然 `sendBeacon` 发送请求
- 后端 `POST /api/track/event` 收到 body 没有 `user_id`，返回 400
- 前端 `.catch(() => {})` 静默吞掉错误，**用户完全感知不到**

### 3.3 已实施的修复

修改了 3 个文件：

1. **`/Users/dd/Documents/html/try/index.html`**
   - `nicknameConfirm` 监听器加 `async`
   - `saveUser(name)` 改为 `await saveUser(name)`
   - `track()` 函数：没 user_id 时延迟 500ms 重试一次，再没就 warn + 跳过

2. **`/Users/dd/Documents/html/try/components/checkin.html`**
   - `track()` 函数：同上，加 500ms 兜底重试
   - `loadData()`：GET `/api/checkin/todos` 时从 localStorage 读 user_id 拼到 query string
   - `saveTodos()`：POST body 加 `user_id` 字段

3. **修改均已保存到磁盘**（见下面的验证命令）

### 3.4 验证修复是否生效（用户操作步骤）

```bash
# 1. 硬刷新浏览器（Mac: ⌘+Shift+R, Win: Ctrl+Shift+R）
# 2. F12 → Console → 执行 localStorage.clear()
# 3. 再硬刷新
# 4. 输入新昵称 → 确认
# 5. 在 Console 执行: window.__HEALTH_DEBUG__ = true
# 6. 触发打卡动作
# 7. 应在 Console 看到 [track] 开头的输出，包含 user_id
# 8. 打开新窗口 http://localhost:3000/admin → 登录 admin/admin123
# 9. 看「用户列表」和「事件列表」
```

### 3.5 验证后端服务正常

```bash
# 后端是 PM2 跑的
pm2 list

# 应看到 health-api 进程，状态 online，pid 66937（或新 pid）
# db 路径: /Users/dd/Documents/html/try/backend/data/health.db
# curl 测试后端是否正常响应:
curl http://localhost:3000/api/health
# 应返回: {"status":"ok",...}
```

### 3.6 如果修复不生效，下一步排查

1. **F12 → Network 标签** → 保留日志 → 触发打卡
2. 找 `track/event` 请求 → 看 **Payload** 标签
3. 应包含 `user_id` 字段
4. 如果没有 → 浏览器没加载新 HTML → 硬刷新一次
5. 看 **Response** 标签 → 应是 201，不是 400

---

## 4. 接下来要做什么

### 4.1 立即做（修复未提交到 git）

```bash
cd /Users/dd/Documents/html/try
git status   # 应看到 index.html 和 components/checkin.html 修改
git add index.html components/checkin.html
git commit -m "fix: 前端 race condition 导致 track 事件丢失 user_id

- index.html: nicknameConfirm 加 async/await
- index.html + checkin.html: track 函数 500ms 兜底重试
- checkin.html: /api/checkin/todos 请求补 user_id"
git push origin main
```

### 4.2 写部署脚本（`deploy.sh`）

放在 `/Users/dd/Documents/html/try/deploy.sh`，做以下事：

1. 系统包安装（Node 22, nginx, sqlite3, certbot）
2. 创建 deploy 用户
3. 拉 git 代码
4. npm install --production
5. 配 .env（OSS / CDN / ADMIN_PASSWORD 由用户填入或环境变量传入）
6. PM2 启动（`-i 2` + `--max-old-space-size=384`）
7. 配 Nginx 反向代理
8. 配 crontab 备份
9. 配 PM2 logrotate

### 4.3 写 runbook（`runbook.md`）

每一步命令 + 预期输出 + 出错时怎么修。

### 4.4 等用户买服务器后实战部署

- 服务器：阿里云轻量应用服务器 · 2核2G · 香港节点 · 200Mbps 峰值 · Ubuntu 22.04 · 系统镜像（**不要选宝塔**）
- 域名：.com 推荐
- OSS：杭州/上海，公共读
- CDN：阿里云 CDN 全站加速

---

## 5. 踩过的坑（绝对不要再踩）

### 坑 1：PM2 进程残留导致端口被占

**症状**：改了后端代码，`node src/index.js` 启动报 `EADDRINUSE :::3000`

**原因**：之前用 PM2 启动的进程还在跑，PM2 会自动重启杀掉的进程

**正解**：
```bash
# 改代码后重启的正确姿势
cd /Users/dd/Documents/html/try/backend
pm2 reload health-api

# 不是:
# node src/index.js    # ← 端口冲突
# pm2 start src/index.js  # ← 不会替换，会新建
```

**排查端口占用**：
```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
ps -ef | grep "node.*try"
```

### 坑 2：杀掉错的 PID

**症状**：`kill <PID>` 后端口还被占

**原因**：PM2 启动的 PID 跟临时 `node src/index.js` 启动的 PID 不同，要用 `pm2 list` 找

**正解**：
```bash
pm2 list                # 找 health-api 的 PID
pm2 delete health-api   # 删进程
pm2 start ...           # 再启动
```

### 坑 3：localStorage 大小写

**症状**：`Uncaught ReferenceError: LocalStorage is not defined`

**原因**：JS 区分大小写，全局对象是 `localStorage`（**l 和 s 都小写**），不是 `LocalStorage`

**正解**：永远是 `localStorage`，不是 `LocalStorage` / `Localstorage` / `localstorage`

### 坑 4：后端 `await` 异步操作忘记写

**症状**：调用顺序错乱，数据丢失，无报错

**原因**：`saveUser()` / `fetch()` 都是异步的，必须 `await` 才能保证执行顺序

**模式**：
```javascript
// ❌ 错
const user = saveUser(name);
track({...user.name});  // user 可能还是旧值

// ✅ 对
const user = await saveUser(name);
track({...user.name});  // 一定是新值
```

### 坑 5：sendBeacon 失败时静默吞错

**症状**：请求没发出去，但控制台一片干净

**原因**：`sendBeacon` 在页面关闭时会失败，前端用了 `.catch(() => {})` 把错误吞了

**正解**：调试时打开 `window.__HEALTH_DEBUG__ = true`，并把 catch 改成 `console.warn`

### 坑 6：宝塔镜像会吃内存

**症状**：选「应用镜像 · 宝塔面板」部署后，2G 内存只剩 1G

**原因**：宝塔装 LAMP 套件（Apache + MySQL + PHP）完全用不到，常驻吃 50-150MB

**正解**：永远选「**系统镜像 · Ubuntu 22.04 LTS**」，不选宝塔

### 坑 7：MySQL 改 SQLite 的语法差异

**MySQL → SQLite 必须改的语法**：

| MySQL | SQLite |
|-------|--------|
| `ON DUPLICATE KEY UPDATE` | `ON CONFLICT(col) DO UPDATE SET` |
| `CURDATE()` | `date('now')` |
| `DATE_SUB(CURDATE(), INTERVAL 7 DAY)` | `date('now', '-7 days')` |
| `JSON` 列类型 | `TEXT`（存 JSON 字符串）|
| `ENGINE=InnoDB` | 删除 |
| `CHARACTER SET utf8mb4` | 删除（SQLite 天然 UTF-8）|
| `ON UPDATE CURRENT_TIMESTAMP` | 代码手动 `datetime('now')` |
| `AUTO_INCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `DECIMAL(8,1)` | `REAL` |
| `mysql2` 库 | `node:sqlite`（Node 22+ 内建）或 `better-sqlite3` |

### 坑 8：db.js 适配层返回值的格式

**关键**：原 routes/*.js 用 `mysql2` 的 `[rows, fields]` 解构风格，db.js 包装层必须保持兼容：

```javascript
// 聚合查询（SELECT COUNT/MAX/MIN）包成 [rows[0]]，让 const [[{ total }]] = ... 仍可用
// 数组查询直接返回 [rows]
// 写操作返回 [{ affectedRows, lastInsertRowid }]
```

详见 `backend/src/db.js` 的 `query()` 函数。

### 坑 9：浏览器缓存导致改的 HTML 不生效

**症状**：改了前端代码，浏览器没反应

**正解**：**必须**硬刷新：
- Mac: `⌘ + Shift + R`
- Win: `Ctrl + Shift + R` 或 `Ctrl + F5`

普通 `F5` / `⌘ + R` 拿的是缓存。

### 坑 10：本地测试数据清理

测试时会在 `backend/data/health.db` 留下数据，正式部署前要清掉：

```bash
cd /Users/dd/Documents/html/try/backend
rm -f data/health.db data/health.db-shm data/health.db-wal
```

启动时会自动建表 + 插入 8 个默认模块。

---

## 6. 关键文件位置速查

| 文件 | 作用 |
|------|------|
| `backend/src/index.js` | Express 入口，挂载静态文件 + API 路由 |
| `backend/src/db.js` | SQLite 连接 + 自动建表 + mysql2 兼容 query() |
| `backend/src/config.js` | 配置中心，从 .env 读 |
| `backend/src/routes/users.js` | 用户注册/登录（POST /api/users, /api/users/login）|
| `backend/src/routes/track.js` | 事件追踪（POST /api/track/event, /video-watch）|
| `backend/src/routes/checkin.js` | 打卡（GET/POST /api/checkin/todos）|
| `backend/src/routes/content.js` | 模块内容（GET/POST /api/content/:moduleId）|
| `backend/src/routes/admin.js` | 管理后台（/api/admin/stats, /events, /users, /video-stats, /upload）|
| `backend/src/middleware/auth.js` | token 认证（optionalAuth, requireAuth）|
| `backend/schema.sql` | SQLite DDL |
| `backend/.env` | 实际环境变量（不入 git）|
| `backend/.env.example` | 环境变量模板（入 git）|
| `backend/data/health.db` | SQLite 数据库（不入 git）|
| `backend/package.json` | 依赖（已移除 mysql2）|
| `index.html` | 主页（昵称 + 5 个 iframe）|
| `components/team.html` | iframe: 团队介绍信 |
| `components/tangram.html` | iframe: 七巧板 |
| `components/domino.html` | iframe: 多米诺 |
| `components/mortise.html` | iframe: 榫卯 |
| `components/checkin.html` | iframe: 打卡（**已修复 race condition**）|
| `pages/health-detail.html` | 6 模块详情页 |
| `pages/health-loop.html` | 环环相扣健康行为 |
| `pages/mortise.html` | 计划与行动 |
| `pages/checkin.html` | 打卡科学说明 |
| `assets/images/` | 7 张占位图 |
| `DEPLOYMENT_NOTES.md` | 部署注意清单（v1.1 适配轻量香港节点）|
| `BACKEND_REFERENCE.md` | 后端 API 详细文档 |
| `DEPLOYMENT_CHECKLIST.md` | 上线路程图 |
| `docs/ARCHITECTURE_ADVICE.md` | 架构选型分析 |
| `TODO.md` | 项目待办 |

---

## 7. 快速启动 & 调试

### 启动后端

```bash
cd /Users/dd/Documents/html/try/backend
# 方式 A：直接跑
node src/index.js

# 方式 B：PM2（推荐）
pm2 start src/index.js -i 2 --name health-api \
  --node-args="--max-old-space-size=384"
pm2 save
pm2 startup | bash
```

### 打开前端

- 主页: http://localhost:3000/
- 管理后台: http://localhost:3000/admin（admin / admin123）
- 健康检查: http://localhost:3000/api/health

### 调试

```bash
# 实时看后端日志
pm2 logs health-api

# 看 db 内容
sqlite3 /Users/dd/Documents/html/try/backend/data/health.db
> SELECT * FROM users;
> SELECT * FROM events;
> .exit

# 模拟前端请求
curl -X POST http://localhost:3000/api/track/event \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","user_name":"test","type":"add_task","ts":1700000000000}'
```

### 浏览器调试

```javascript
// F12 → Console
localStorage.getItem('healthUser')           // 看用户对象
localStorage.clear()                        // 清空所有 localStorage
window.__HEALTH_DEBUG__ = true              // 打开调试日志
JSON.parse(localStorage.getItem('healthTodos') || '[]')  // 看打卡项
```

---

## 8. 注意事项

1. **绝对不要** `node src/index.js` 跟 PM2 混用，会端口冲突
2. **绝对不要**选宝塔镜像（吃内存）
3. **绝对不要**忘记 `await` 异步操作
4. **绝对不要**普通刷新（要硬刷新才生效）
5. **绝对不要**在管理后台用默认密码 `admin123` 上线
6. **绝对不要**把 `backend/data/health.db` 提交到 git（已在 .gitignore）
7. **绝对不要**把 `.env` 提交到 git（已在 .gitignore）

---

## 9. 联系 / 参考

- 阿里云轻量香港节点: https://www.aliyun.com/product/swas
- Node.js 22 LTS: https://nodejs.org/
- 阿里云 CDN: https://www.aliyun.com/product/cdn
- certbot: https://certbot.eff.org/

---

**文档结束**。新会话从顶部 §0 开始读，5 分钟内可进入工作状态。
