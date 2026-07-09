# 健康小站 · 部署注意事项（SQLite 方案）

> 最后更新：2026-07-09
> 适用版本：v1.1（SQLite 重构版）
> 目标环境：2 核 2G ECS（Ubuntu 22.04 LTS）

---

## 目录

- [1. 服务器选型与初始化](#1-服务器选型与初始化)
- [2. Node.js 版本：必须 ≥ 22](#2-nodejs-版本必须--22)
- [3. SQLite 部署要点](#3-sqlite-部署要点)
- [4. 进程管理 PM2 Cluster](#4-进程管理-pm2-cluster)
- [5. Nginx 反向代理 + gzip](#5-nginx-反向代理--gzip)
- [6. 文件存储 OSS](#6-文件存储-oss)
- [7. HTTPS 证书](#7-https-证书)
- [8. 数据库备份与恢复](#8-数据库备份与恢复)
- [9. 监控与日志](#9-监控与日志)
- [10. 安全加固](#10-安全加固)
- [11. 常见问题排查](#11-常见问题排查)

---

## 1. 服务器选型与初始化

### 1.1 推荐配置（2 核 2G 即可）

| 项目 | 规格 | 月费参考 |
|------|------|----------|
| ECS | 2 vCPU / 2 GB RAM / 40 GB ESSD | ~60-70 元 |
| 带宽 | 按量计费，峰值 30-50 Mbps | 几元 |
| 系统 | Ubuntu 22.04 LTS | 包含 |
| 地域 | 杭州 / 上海（OSS 同区走内网免费） | — |

### 1.2 安全组开放端口

| 端口 | 协议 | 用途 | 是否对外 |
|------|------|------|----------|
| 22 | TCP | SSH | ✅ 必须 |
| 80 | TCP | HTTP（Nginx） | ✅ 必须 |
| 443 | TCP | HTTPS | ✅ 必须 |
| 3000 | TCP | Node.js | ❌ **只允许 127.0.0.1**（Nginx 内部转发） |

> ⚠️ 3000 端口**不要**对公网开放，Nginx 在 80/443 后面代理即可。

### 1.3 系统初始化

```bash
# 更新系统
apt update && apt upgrade -y

# 创建部署用户（不要直接用 root 跑服务）
adduser deploy
usermod -aG sudo deploy

# 允许 deploy 用户免密码 sudo（PM2 需要）
echo "deploy ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/deploy

# 用 deploy 用户登录
ssh deploy@<公网IP>
```

---

## 2. Node.js 版本：必须 ≥ 22

### 2.1 为什么必须 Node 22

`node:sqlite` 是 **Node 22 才正式 GA** 的内建模块。本项目用它替代 `better-sqlite3`，好处：

- 零编译（不需要 `python3 build-essential`）
- 零依赖（`package.json` 里不写）
- 性能与 `better-sqlite3` 持平

### 2.2 安装命令

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# 验证
node -v        # 必须输出 v22.x.x 或更高
node -e "require('node:sqlite')"   # 不报错即可
```

### 2.3 如果服务器上是 Node 20

两条路：
- **方案 A（推荐）**：升级到 Node 22，命令见上
- **方案 B（兜底）**：把 `backend/src/db.js` 切回 `better-sqlite3` 编译方案
  - 服务器需要 `apt install -y python3 build-essential`
  - 重新 `npm install better-sqlite3`

> 强烈推荐 Node 22，部署起来干净利落。

---

## 3. SQLite 部署要点

### 3.1 数据文件位置

```
backend/data/health.db        ← 主库
backend/data/health.db-wal    ← WAL 日志（运行时自动生成）
backend/data/health.db-shm    ← 共享内存索引
```

可在 `.env` 中改路径：`DB_PATH=./data/health.db`

### 3.2 启动时自动建表 ✅

**不需要**像 MySQL 那样手动 `mysql -u root -p < schema.sql`。
后端启动时检测到 db 文件不存在，会自动执行 `schema.sql` 建表 + 写入 8 个默认模块（diet/exercise/sleep/screen/habits/mental/loop/action）。

只需确保 `backend/data/` 目录可写：

```bash
mkdir -p /var/www/healthstation/backend/data
chown -R deploy:deploy /var/www/healthstation/backend/data
```

### 3.3 文件权限

```bash
# 数据库文件只能 deploy 用户读写
chmod 600 /var/www/healthstation/backend/data/health.db
chmod 700 /var/www/healthstation/backend/data
```

### 3.4 磁盘空间监控

SQLite 单库 TB 级没问题，但**服务器系统盘**只有 40GB，要警惕日志和上传文件：

```bash
# 定时清理 PM2 日志
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 4. 进程管理 PM2 Cluster

### 4.1 启动命令

```bash
cd /var/www/healthstation/backend
npm install --production
pm2 start src/index.js -i 2 --name health-api
pm2 save
pm2 startup | bash    # 注册 systemd，开机自启
```

`-i 2` 启动**两个 Node 进程**，各占 1 个 CPU 核，PM2 自动做负载均衡和故障转移。

### 4.2 内存限制（关键！2G 服务器必须加）

```bash
# 方案 A：修改 ecosystem 配置
pm2 start src/index.js -i 2 \
  --name health-api \
  --node-args="--max-old-space-size=384"

# 方案 B：写入 ecosystem.json
cat > /var/www/healthstation/backend/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'health-api',
    script: 'src/index.js',
    instances: 2,
    exec_mode: 'cluster',
    max_memory_restart: '400M',
    node_args: '--max-old-space-size=384',
    env: { NODE_ENV: 'production' }
  }]
};
EOF

pm2 start ecosystem.config.js
pm2 save
```

**为什么是 384MB？**
- 2 进程 × 384MB = 768MB
- OS + Nginx + PM2 ≈ 600MB
- 缓冲 ≈ 600MB
- 合计 2G 刚刚好

### 4.3 常用 PM2 命令

```bash
pm2 list                  # 查看进程
pm2 logs health-api       # 实时日志
pm2 monit                 # 实时监控面板
pm2 reload health-api     # 零停机热重载
pm2 restart health-api    # 重启
pm2 stop health-api       # 停止
pm2 delete health-api     # 移除
```

### 4.4 零停机部署流程

```bash
# 1. 拉取新代码
cd /var/www/healthstation
git pull

# 2. 装依赖（如有变化）
cd backend && npm install --production

# 3. 零停机重载（PM2 依次重启每个进程）
pm2 reload health-api
```

---

## 5. Nginx 反向代理 + gzip

### 5.1 完整配置

`/etc/nginx/sites-available/healthstation`：

```nginx
server {
    listen 80;
    server_name health.your-domain.com;   # ← 换成你的域名

    # gzip 压缩（HTML/JSON 压到 1/5，省 80% 带宽）
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;
    gzip_comp_level 6;

    # 前端静态文件
    root /var/www/healthstation;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 转发
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # 上传文件
    location /uploads/ {
        alias /var/www/healthstation/uploads/;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
    }

    # 静态资源缓存（图片）
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }

    # 安全 headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
}
```

### 5.2 启用配置

```bash
ln -s /etc/nginx/sites-available/healthstation /etc/nginx/sites-enabled/
nginx -t                     # 验证配置
systemctl reload nginx
```

### 5.3 验证

```bash
curl -I http://health.your-domain.com/
curl http://health.your-domain.com/api/health
# 应返回: {"status":"ok","time":"...","user":null}
```

---

## 6. 文件存储 OSS

### 6.1 推荐用 OSS，不上传到 ECS

**不要**把 PDF/视频传到服务器的 `uploads/` 目录。理由：
- 2G 内存 + 40GB 硬盘撑不住
- 大文件下载会卡死带宽
- 阿里云 OSS 走 CDN 又快又便宜

### 6.2 必填的 .env 变量

```bash
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=<你的AK>
OSS_ACCESS_KEY_SECRET=<你的SK>
OSS_BUCKET=health-station-files
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
OSS_CDN_BASE=https://cdn.your-domain.com   # 可选，配置了 CDN 就填
```

### 6.3 创建 OSS Bucket

1. 阿里云控制台 → OSS → 创建 Bucket
2. 名称：`health-station-files`
3. 地域：和 ECS 同地域（**内网传输免费**）
4. 读写权限：**公共读**（让用户能直接访问 PDF/视频 URL）
5. 创建 RAM 子用户，授权 `AliyunOSSFullAccess`

### 6.4 降级：本地存储（无 OSS 时）

如果暂未开通 OSS，代码会**自动降级**到本地 `uploads/pdf/模块名/` 和 `uploads/video/模块名/`。
- 适合开发和小规模测试
- 生产环境强烈建议 OSS

---

## 7. HTTPS 证书

### 7.1 用 certbot 一键签发

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d health.your-domain.com
```

会自动：
- 申请证书（Let's Encrypt）
- 修改 Nginx 配置加 443 监听
- HTTP → HTTPS 自动跳转
- 加 crontab 自动续期（90 天）

### 7.2 验证自动续期

```bash
certbot renew --dry-run
```

### 7.3 国内服务器注意

- 阿里云 / 腾讯云 ECS 必须**先备案**才能用 80/443
- 备案周期约 15 个工作日
- 期间可以用 IP + 端口测试，但**不能**上线

---

## 8. 数据库备份与恢复

### 8.1 自动备份（cron）

```bash
crontab -e

# 每天凌晨 3 点备份 SQLite
0 3 * * * sqlite3 /var/www/healthstation/backend/data/health.db ".backup /backup/health_$(date +\%Y\%m\%d).db)"

# 清理 30 天前的旧备份
0 4 * * * find /backup -name "health_*.db" -mtime +30 -delete
```

> 为什么要用 `.backup` 而非 `cp`？
> `.backup` 是 SQLite 的热备份 API，**不会锁库**也不影响读写。直接 `cp` 在高并发写时可能拿到损坏的 db。

### 8.2 手动备份

```bash
sqlite3 /var/www/healthstation/backend/data/health.db ".backup /tmp/manual-backup.db"
```

### 8.3 恢复

```bash
# 1. 停服务
pm2 stop health-api

# 2. 备份当前库（避免恢复失败丢数据）
cp /var/www/healthstation/backend/data/health.db /tmp/old.db

# 3. 用备份覆盖
cp /backup/health_20260709.db /var/www/healthstation/backend/health.db
chmod 600 /var/www/healthstation/backend/data/health.db

# 4. 启服务
pm2 start health-api
```

### 8.4 备份验证（每月做一次）

```bash
# 把备份拷到本地检查能否打开
scp deploy@server:/backup/health_20260709.db /tmp/
sqlite3 /tmp/health_20260709.db "SELECT COUNT(*) FROM events; SELECT COUNT(*) FROM users;"
```

---

## 9. 监控与日志

### 9.1 PM2 日志

```bash
# 实时
pm2 logs health-api

# 落盘位置
/root/.pm2/logs/health-api-out.log
/root/.pm2/logs/health-api-error.log
```

### 9.2 日志轮转

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### 9.3 阿里云监控

云监控控制台 → ECS → 告警规则：
- CPU > 80% 持续 5 分钟 → 告警
- 内存 > 85% 持续 5 分钟 → 告警
- 磁盘使用率 > 85% → 告警
- 公网出带宽 > 80% 峰值 → 告警

---

## 10. 安全加固

### 10.1 修改管理后台密码

```bash
nano /var/www/healthstation/backend/.env
# ADMIN_PASSWORD=<至少 16 位的强密码>
pm2 reload health-api
```

### 10.2 防火墙

```bash
# 安装 ufw
apt install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 10.3 SSH 密钥登录（推荐）

```bash
# 本地：生成密钥（如已有可跳过）
ssh-keygen -t ed25519

# 把公钥复制到服务器
ssh-copy-id deploy@<公网IP>

# 服务器：禁用密码登录
sudo nano /etc/ssh/sshd_config
# PasswordAuthentication no
sudo systemctl restart sshd
```

### 10.4 数据库文件

- `backend/data/health.db` **绝对不要**让公网访问
- Nginx 配置不要把 `/data/` 暴露出去
- 定期检查文件权限：`chmod 600`

### 10.5 定期更新

```bash
# 每月一次
apt update && apt upgrade -y
npm outdated    # 检查过时的 npm 包
```

---

## 11. 常见问题排查

### Q1: 启动报 `Cannot find module 'node:sqlite'`

**原因**：Node 版本 < 22。
**解决**：
```bash
node -v   # 必须 >= v22
# 升级见 第 2 节
```

### Q2: `SQLITE_BUSY` 错误

**原因**：写锁等待超时。
**解决**：已在 `db.js` 设置 `busy_timeout = 5000`，5000ms 内会自动重试。如仍出现，检查是否有长事务没结束。

### Q3: 打卡数据 POST 后还是空的

**排查**：
```bash
sqlite3 /var/www/healthstation/backend/data/health.db
sqlite> SELECT * FROM checkin_data;
sqlite> .exit
```

### Q4: 上传文件后访问 404

- 检查 `OSS_CDN_BASE` 或 OSS URL 是否正确
- 公共读权限是否开启
- 浏览器开发者工具查看实际请求 URL

### Q5: PM2 进程反复重启

**原因**：内存溢出。
**解决**：调整 `--max-old-space-size`，或加 `max_memory_restart: '400M'` 触发自动重启。

### Q6: 80 端口被占用

```bash
lsof -i :80
# 通常是 apache2 占用了
systemctl stop apache2
systemctl disable apache2
```

### Q7: 中文乱码

SQLite 默认 UTF-8，应该没问题。如果出现：
```bash
sqlite3 health.db "PRAGMA encoding;"   # 应为 UTF-8
```
如果不对，需要重建库（SQLite 不支持改编码）。

---

## 12. 一页式部署清单

```bash
# === 一键部署流程 ===

# 1. SSH 登录
ssh deploy@<公网IP>

# 2. 装基础环境
sudo apt update && sudo apt install -y nginx sqlite3
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# 3. 拉代码
sudo mkdir -p /var/www/healthstation
sudo chown deploy:deploy /var/www/healthstation
cd /var/www/healthstation
git clone https://github.com/DD-010502/health-station.git .

# 4. 装依赖
cd backend
npm install --production
cp .env.example .env
nano .env   # 填入 OSS 密钥、ADMIN_PASSWORD

# 5. 建 db 目录
mkdir -p data

# 6. 启动
pm2 start src/index.js -i 2 --name health-api \
  --node-args="--max-old-space-size=384"
pm2 save
pm2 startup | bash

# 7. 配 Nginx
sudo tee /etc/nginx/sites-available/healthstation << 'EOF'
server {
    listen 80;
    server_name health.your-domain.com;
    root /var/www/healthstation;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    location / { try_files $uri $uri/ /index.html; }
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/healthstation /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 8. 配 SSL
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d health.your-domain.com

# 9. 配 cron 备份
(crontab -l 2>/dev/null; echo "0 3 * * * sqlite3 /var/www/healthstation/backend/data/health.db \".backup /backup/health_\$(date +\\%Y\\%m\\%d).db\"") | crontab -

# 10. 验证
curl https://health.your-domain.com/api/health
```

✅ 全部执行完即可上线。

---

**文档版本**：v1.0 · 2026-07-09
**项目版本**：健康小站 v1.1（SQLite 版）
**预计部署耗时**：1-2 小时（不含备案和素材准备）
