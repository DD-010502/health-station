# 健康小站 · 后端 API

Node.js + Express + MySQL + 阿里云 OSS

## 快速开始

```bash
cd backend
cp .env.example .env   # 编辑 .env 填入数据库和 OSS 凭证
npm install
mysql -u root -p < schema.sql   # 建库建表
npm run dev             # 启动开发服务器 (http://localhost:3000)
```

## API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/users` | 用户注册/登录 |
| `POST` | `/api/track/event` | 事件追踪 |
| `POST` | `/api/track/video-watch` | 视频观看追踪 |
| `GET` | `/api/checkin/todos?user_id=xxx` | 加载打卡数据 |
| `POST` | `/api/checkin/todos` | 同步打卡数据 |
| `GET` | `/api/content/:moduleId` | 获取模块内容 |
| `GET` | `/api/content` | 获取全部模块 |
| `POST` | `/api/content/:moduleId` | 更新模块内容 |
| `POST` | `/api/admin/upload` | 上传文件到 OSS |

## 与前端集成

前端已配置为自动调用这些端点。Nginx 部署时只需将 `/api/` 代理到此服务即可：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;
}
```

如需前后端分离部署，前端需在 `<head>` 中设置 API 地址：

```html
<script>
window.API_BASE = 'https://api.health.example.com';
window.TRACK_ENDPOINT = window.API_BASE + '/api/track/event';
window.VIDEO_WATCH_ENDPOINT = window.API_BASE + '/api/track/video-watch';
window.CHECKIN_API = window.API_BASE + '/api/checkin';
</script>
```
