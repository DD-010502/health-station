# 健康小站 · 部署与迁移指南

---

## 一、整体架构

```
浏览器
  │
  ├── GET index.html (静态文件)
  │     嵌入 iframe → components/*.html (静态文件)
  │     箭头链接 → pages/*.html (静态文件)
  │
  ├── POST /api/users              ──┐
  ├── POST /api/track/event        ──┤
  ├── POST /api/track/video-watch  ──┤── 后端服务
  ├── GET  /api/checkin/todos      ──┤
  └── POST /api/checkin/todos      ──┘
```

**关键点：前端和后端是分开部署的。** 前端是纯静态 HTML，放哪里都行；后端是 API 服务，需要单独运行。

---

## 二、前端部署

### 方式 A：Nginx（推荐）

```nginx
server {
    listen 80;
    server_name health.example.com;
    root /var/www/healthstation;   # ← 把 try/ 文件夹内容放这里

    # 静态文件直接返回
    location / {
        try_files $uri $uri/ =404;
    }

    # API 请求转发到后端
    location /api/ {
        proxy_pass http://127.0.0.1:3000;   # ← 后端地址
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 方式 B：CDN + 后端独立域名

1. 把整个 `try/` 文件夹上传到 OSS / CDN（阿里云 OSS、腾讯云 COS 等）
2. 后端部署在另一台服务器，开启 CORS
3. 在前端设置 API 地址

### 方式 C：Node.js / Express 一体化

```js
const express = require('express');
const app = express();

// 静态文件 — 把 try/ 文件夹放这里
app.use(express.static('/var/www/healthstation'));

// API 路由
app.post('/api/users', async (req, res) => { /* ... */ });
app.post('/api/track/event', async (req, res) => { /* ... */ });
app.post('/api/track/video-watch', async (req, res) => { /* ... */ });

app.listen(3000);
```

---

## 三、部署前必须修改的配置

### 3.1 API 地址

如果前后端不在同一个域名/端口下，前端需要知道后端地址。

**方式一：前端注入脚本（推荐）**

在 `index.html` 的 `<script>` 之前插入一个配置脚本：

```html
<!-- 在 index.html 的 </head> 前插入 -->
<script>
  // 部署时修改这里
  window.API_BASE = 'https://api.health.example.com';
  window.TRACK_ENDPOINT = window.API_BASE + '/api/track/event';
  window.VIDEO_WATCH_ENDPOINT = window.API_BASE + '/api/track/video-watch';
  window.CHECKIN_API = window.API_BASE + '/api/checkin';
</script>
```

**方式二：Nginx 反向代理（推荐，零前端改动）**

上面的 Nginx 配置中 `/api/` 自动转发到后端，前端不需要改任何代码。这是最简单的方案。

### 3.2 内容注入

部署时需要把数据库中的模块内容注入到前端。有两种方式：

**方式 A：服务端渲染注入（推荐）**

在后端模板或 Nginx SSI 中，在页面 `<script>` 之前输出：

```html
<script>
  window.CONTENT_DATA = {
    diet: {
      intro: { title: "...", paragraphs: ["...", "..."] },
      pdfs:  [{ id: "diet-pdf-1", title: "...", url: "https://oss.example.com/xxx.pdf" }],
      videos: [{ id: "diet-vid-1", title: "...", desc: "...", url: "https://oss.example.com/xxx.mp4" }],
    },
    // ... 其他模块
  };
</script>
```

**方式 B：前端 fetch 加载**

修改 `health-detail.html` 的初始化逻辑，从 API 动态拉取内容。需要添加：

```js
// 在 renderAll() 之前
async function loadContent() {
  try {
    const resp = await fetch('/api/content');
    if (resp.ok) {
      const data = await resp.json();
      Object.assign(CONTENT, data);
    }
  } catch(e) {}
  renderAll();
}
loadContent();
```

### 3.3 图片资源

确保以下文件存在于 `assets/images/`：

| 文件 | 用途 |
|---|---|
| `hero.png` | 主页面 Hero |
| `title1.jpg` | 健康知识页 Hero |
| `title2.jpg` | 健康循环页 Hero |
| `title3.jpg` | 计划行动页 Hero |
| `team.jpg` | 团队照片 |
| `mona-lisa.png` | 打卡页蒙娜丽莎 |
| `joyride.png` | 榫卯页插图 |

---

## 四、数据迁移

### 4.1 用户数据

用户数据完全由后端管理。前端 `localStorage.healthUser` 是本地缓存，后端 `POST /api/users` 返回的 `user_id` 是唯一标识。

迁移时：
- 如果已有用户数据在某个数据库，直接导入到新的 `users` 表
- 如果没有历史数据，上线后用户首次输入昵称即自动创建

### 4.2 打卡数据

打卡数据目前双写（localStorage + 后端 API）。迁移时：

1. **新用户**：无历史数据，从零开始
2. **老用户（测试阶段）**：localStorage 中有数据，需要迁移

老用户数据迁移脚本（浏览器 console 运行）：

```js
// 在浏览器中运行，把本地数据上传到后端
const todos = JSON.parse(localStorage.getItem('healthTodos') || '[]');
const doneDates = JSON.parse(localStorage.getItem('healthDoneDates') || '[]');
const doneTasks = JSON.parse(localStorage.getItem('healthDoneTasks') || '{}');
const user = JSON.parse(localStorage.getItem('healthUser') || '{}');

fetch('/api/checkin/todos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: user.id, todos, doneDates, doneTasks }),
});
```

### 4.3 事件追踪数据

如果前期测试有事件数据在后端，按数据库结构迁移即可。event 表结构简单（user_id, type, ts, payload），直接导出导入。

---

## 五、部署步骤清单

```
□ 1. 准备服务器（Nginx / Node.js / 云服务）
□ 2. 部署后端 API 服务，确认以下端点可用：
     - POST /api/users
     - POST /api/track/event
     - POST /api/track/video-watch
     - GET/POST /api/checkin/todos（可选）
□ 3. 上传 PDF/视频文件到 OSS，记录 URL
□ 4. 配置内容注入（window.CONTENT_DATA 或 API 动态加载）
□ 5. 替换 assets/images/ 中的图片为正式素材
□ 6. 配置 Nginx 反向代理（或设置 CORS）
□ 7. 把 try/ 文件夹上传到服务器静态目录
□ 8. 配置域名 + HTTPS
□ 9. 测试：输入昵称 → 浏览页面 → 打卡 → 检查后端是否收到事件
□ 10. 迁移测试阶段的老数据（如有）
```

---

## 六、一句话总结

**不能直接复制粘贴。** 需要做三件事：

1. **配反向代理** — 让 `/api/` 请求转发到后端（改 Nginx 配置，不改前端代码）
2. **注入内容** — 把数据库里的 PDF/视频 URL 通过 `window.CONTENT_DATA` 输出到页面
3. **换图片** — 把 `assets/images/` 里的占位图换成正式素材

做完这三步，复制文件夹到服务器静态目录，配好域名，就可以了。
