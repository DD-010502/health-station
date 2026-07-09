# 健康小站 · 部署注意事项（SQLite 方案）

> 最后更新：2026-07-09
> 适用版本：v1.1（SQLite 重构版）
> **目标环境：阿里云 · 轻量应用服务器 · 2 核 2G · 香港节点（免备案）**

---

## 目录

- [0. 快速决策：选轻量还是 ECS？](#0-快速决策选轻量还是-ecs)
- [1. 服务器选型与初始化](#1-服务器选型与初始化)
- [2. Node.js 版本：必须 ≥ 22](#2-nodejs-版本必须--22)
- [3. SQLite 部署要点](#3-sqlite-部署要点)
- [4. 进程管理 PM2 Cluster](#4-进程管理-pm2-cluster)
- [5. Nginx 反向代理 + gzip](#5-nginx-反向代理--gzip)
- [6. 文件存储 OSS](#6-文件存储-oss)
- [7. HTTPS 证书](#7-https-证书)
- [8. **CDN 加速（香港节点大陆访问必备）**](#8-cdn-加速香港节点大陆访问必备)
- [9. 数据库备份与恢复](#9-数据库备份与恢复)
- [10. 监控与日志](#10-监控与日志)
- [11. 安全加固](#11-安全加固)
- [12. 常见问题排查](#12-常见问题排查)
- [13. **接下来你要做什么（操作清单）**](#13-接下来你要做什么操作清单)

---

## 0. 快速决策：选轻量还是 ECS？

**结论：本项目推荐「轻量应用服务器 · 香港节点」。**

| 维度 | 轻量应用服务器（香港）| ECS 2核2G（杭州/上海）|
|------|----------------------|----------------------|
| 月费 | ~60-100 元 | ~100-150 元 |
| 备案 | ❌ **不需要** | ✅ 必须（15 个工作日）|
| 带宽 | 峰值 3-5 Mbps | 按量 30-50 Mbps |
| 流量 | 部分套餐限 1TB/月 | 不限 |
| 性能 | 共享型，够用 | 略强 |
| 横向扩展 | ❌ 单机 | ✅ 可加 SLB |
| 适合规模 | DAU < 5000 | DAU < 50000 |

### 选轻量的理由（你的项目）

1. 400 用户规模轻量够用
2. 免备案，**今天买明天就能上线**
3. SQLite 单文件，**不需要独立云数据库**
4. 大文件走 OSS+CDN，**不依赖服务器带宽**
5. 月费省一半

### 选 ECS 的理由

- DAU 破 1000
- 主要用户在大陆，且不能接受 20-50ms 延迟
- 需要做灾备 / 横向扩展

> ⚠️ **如果你的用户主要在大陆**：仍可买轻量香港，但**必须配 CDN 加速**（见第 8 节）。

---

## 1. 服务器选型与初始化

### 1.1 推荐配置：轻量应用服务器 2 核 2G（香港）

| 项目 | 规格 | 月费参考 |
|------|------|----------|
| 轻量应用服务器 | 2 vCPU / 2 GB RAM / 40-50 GB SSD | ~60-100 元 |
| 带宽 | 峰值 3-5 Mbps（部分套餐更高） | 包含 |
| 月流量 | 套餐内 1000 GB（部分不限） | 包含 |
| 系统 | Ubuntu 22.04 LTS | 包含 |
| 地域 | 中国香港 | — |

### 1.2 购买流程

1. 阿里云控制台 → **轻量应用服务器** → 创建实例
2. 地域：**中国香港**（避免 20 工作日备案）
3. 镜像：**Ubuntu 22.04 LTS**
4. 套餐：2 vCPU / 2 GB / 40 GB SSD
5. 带宽套餐：建议 5M 峰值（够用）
6. 购买时长：先买 1 个月试用，**确认一切正常再续费/转年付**
7. 拿到公网 IP

### 1.3 安全组与防火墙

阿里云轻量的"防火墙"在控制台设置（不是安全组）：

| 端口 | 协议 | 用途 | 是否对外开放 |
|------|------|------|---------------|
| 22 | TCP | SSH | ✅ |
| 80 | TCP | HTTP | ✅ |
| 443 | TCP | HTTPS | ✅ |
| 3000 | TCP | Node.js | ❌ **不对外**（Nginx 内部转发）|

> ⚠️ 3000 端口**永远不要**对公网开放，Nginx 在 80/443 后面代理即可。

### 1.4 系统初始化

```bash
# 首次 SSH 登录（阿里云控制台重置密码后用 root）
ssh root@<公网IP>

# 更新系统
apt update && apt upgrade -y

# 创建部署用户（不要直接用 root 跑服务）
adduser deploy
usermod -aG sudo deploy

# 允许 deploy 免密码 sudo（PM2 需要）
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy

# 后续用 deploy 用户登录
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
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# 验证
node -v        # 必须输出 v22.x.x 或更高
node -e "require('node:sqlite')"   # 不报错即可
```

### 2.3 如果服务器上是 Node 20

两条路：
- **方案 A（推荐）**：升级到 Node 22，命令见上
- **方案 B（兜底）**：把 `backend/src/db.js` 切回 `better-sqlite3` 编译方案
  - 服务器需要 `sudo apt install -y python3 build-essential`
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
sudo chown -R deploy:deploy /var/www/healthstation/backend/data
```

### 3.3 文件权限

```bash
chmod 600 /var/www/healthstation/backend/data/health.db
chmod 700 /var/www/healthstation/backend/data
```

### 3.4 磁盘空间监控

轻量应用服务器系统盘 40-50GB，要警惕日志和上传文件：

```bash
# 定时清理 PM2 日志
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 3.5 轻量服务器的注意点

- 轻量应用服务器系统盘较小（40-50GB），**不要**把上传文件放本地
- **必须**走 OSS（见第 6 节），否则一周就可能撑爆

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
# 方案 A：直接传参
pm2 start src/index.js -i 2 \
  --name health-api \
  --node-args="--max-old-space-size=384"

# 方案 B：写入 ecosystem.config.js（更规范）
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
cd /var/www/healthstation
git pull
cd backend && npm install --production
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

    # 静态资源缓存
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
sudo ln -s /etc/nginx/sites-available/healthstation /etc/nginx/sites-enabled/
sudo nginx -t                     # 验证配置
sudo systemctl reload nginx
```

### 5.3 验证

```bash
curl -I http://health.your-domain.com/
curl http://health.your-domain.com/api/health
# 应返回: {"status":"ok","time":"...","user":null}
```

---

## 6. 文件存储 OSS（强烈推荐）

### 6.1 为什么必须用 OSS（轻量香港节点）

**不要**把 PDF/视频传到服务器的 `uploads/` 目录。理由：

- 轻量服务器系统盘只有 40-50GB，撑不住
- 3-5 Mbps 带宽根本喂不动视频
- 阿里云 OSS 走 CDN 又快又便宜

### 6.2 必填的 .env 变量

```bash
OSS_REGION=oss-cn-hangzhou       # ← OSS 选杭州/上海/北京等大陆区
OSS_ACCESS_KEY_ID=<你的AK>
OSS_ACCESS_KEY_SECRET=<你的SK>
OSS_BUCKET=health-station-files
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
OSS_CDN_BASE=https://cdn.your-domain.com   # CDN 加速域名（见第 8 节）
```

### 6.3 OSS 选什么地域？

| 你的服务器 | 建议 OSS 地域 | 原因 |
|-----------|--------------|------|
| 香港轻量 | **杭州 / 上海**（大陆区） | 大陆用户访问快；OSS+CDN 走大陆边缘节点 |
| 大陆 ECS | 同地域 | 内网传输免费 |

> 香港 → 大陆 OSS 不走内网（要走公网），但配合 CDN 加速后**用户实际访问是从大陆 CDN 拉**，**不经过香港服务器**，反而最快。

### 6.4 创建 OSS Bucket

1. 阿里云控制台 → OSS → 创建 Bucket
2. 名称：`health-station-files`
3. 地域：杭州或上海
4. 读写权限：**公共读**（让用户能直接访问 PDF/视频 URL）
5. 创建 RAM 子用户，授权 `AliyunOSSFullAccess`

### 6.5 降级：本地存储（无 OSS 时）

代码会**自动降级**到本地 `uploads/pdf/模块名/` 和 `uploads/video/模块名/`。
- 适合开发和小规模测试
- 生产环境**强烈建议 OSS**

---

## 7. HTTPS 证书

### 7.1 香港节点优势

香港节点**不需要备案**，可以直接签发 Let's Encrypt 证书，立即上 HTTPS。

### 7.2 certbot 一键签发

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d health.your-domain.com
```

会自动：
- 申请证书（Let's Encrypt）
- 修改 Nginx 配置加 443 监听
- HTTP → HTTPS 自动跳转
- 加 crontab 自动续期（90 天）

### 7.3 DNS 解析先做

签发证书**之前**，先在域名 DNS 添加 A 记录指向香港服务器公网 IP（让 Let's Encrypt 验证域名所有权）：

```
类型: A
主机: health
值: <香港服务器IP>
TTL: 10 分钟
```

---

## 8. CDN 加速（香港节点大陆访问必备）

> ⚠️ **这一节是香港节点最重要的配置**。不配 CDN，大陆用户访问会卡到怀疑人生。

### 8.1 为什么必须配 CDN

```
没配 CDN：
  大陆用户 → 直连香港服务器（200-300ms 延迟 + 3-5Mbps 带宽）
  视频首屏：5-10 秒

配了 CDN：
  大陆用户 → 大陆边缘节点（30-50ms 延迟 + CDN 全速）
  视频首屏：1-2 秒
```

### 8.2 推荐 CDN 方案：阿里云 CDN

#### 步骤 1：开通 CDN

1. 阿里云控制台 → **CDN**
2. 添加域名：`cdn.your-domain.com`（子域名，用于 OSS 加速）
3. 源站类型：**OSS 域名**
4. 源站信息：选择你的 OSS Bucket
5. 加速类型：**全站加速**

#### 步骤 2：DNS 解析

```
类型: CNAME
主机: cdn
值: <阿里云 CDN 给你的 CNAME 值>
TTL: 10 分钟
```

#### 步骤 3：HTTPS 证书（CDN 也要配证书）

CDN 控制台 → HTTPS 设置 → 上传证书或选阿里云免费证书。

#### 步骤 4：缓存策略

| 资源类型 | 缓存时间 | 配置 |
|---------|---------|------|
| HTML | 0 秒（不缓存，强制回源） | 默认 |
| JS / CSS | 30 天 | 路径后缀 `*.js;*.css` |
| 图片（jpg/png/webp） | 30 天 | 路径后缀 `*.jpg;*.png;*.webp` |
| 视频（mp4） | 7 天 | 路径后缀 `*.mp4` |
| PDF | 7 天 | 路径后缀 `*.pdf` |

#### 步骤 5：更新 .env

```bash
OSS_CDN_BASE=https://cdn.your-domain.com
```

后端上传文件后，**返回的 URL 自动用 CDN 域名**。

### 8.3 前端静态资源 CDN（可选）

如果你也想让 HTML/JS 走 CDN：

1. CDN 加第二个域名：`static.your-domain.com`
2. 源站：选 **IP**，填香港服务器公网 IP
3. 把前端 `try/` 目录部署到服务器
4. DNS 解析 `static.your-domain.com` → CDN CNAME
5. 用户访问 `https://static.your-domain.com/` 加载页面

> 这是进阶优化，初版可以**先不做**，等业务跑起来再优化。

### 8.4 验证 CDN 生效

```bash
# 在大陆电脑上 ping 域名
ping cdn.your-domain.com
# 应该解析到大陆 CDN 节点（电信/联通/移动 IP）

# 模拟用户访问
curl -I https://cdn.your-domain.com/health-station-files/test.pdf
# 应该返回 200 + 命中缓存 (X-Swift-CacheTime)
```

### 8.5 月费预估

- 阿里云 CDN：0.18 元/GB（按量），初期几十 GB 几块钱
- 流量越大越便宜
- 400 用户规模，**月费几元到几十元**

---

## 9. 数据库备份与恢复

### 9.1 自动备份（cron）

```bash
crontab -e

# 每天凌晨 3 点备份 SQLite
0 3 * * * sqlite3 /var/www/healthstation/backend/data/health.db ".backup /backup/health_$(date +\%Y\%m\%d).db"

# 清理 30 天前的旧备份
0 4 * * * find /backup -name "health_*.db" -mtime +30 -delete
```

> 为什么要用 `.backup` 而非 `cp`？
> `.backup` 是 SQLite 的热备份 API，**不会锁库**也不影响读写。直接 `cp` 在高并发写时可能拿到损坏的 db。

### 9.2 手动备份

```bash
sqlite3 /var/www/healthstation/backend/data/health.db ".backup /tmp/manual-backup.db"
```

### 9.3 恢复

```bash
pm2 stop health-api
cp /var/www/healthstation/backend/data/health.db /tmp/old.db   # 备份当前库
cp /backup/health_20260709.db /var/www/healthstation/backend/data/health.db
chmod 600 /var/www/healthstation/backend/data/health.db
pm2 start health-api
```

### 9.4 备份验证（每月做一次）

```bash
scp deploy@server:/backup/health_20260709.db /tmp/
sqlite3 /tmp/health_20260709.db "SELECT COUNT(*) FROM events; SELECT COUNT(*) FROM users;"
```

### 9.5 轻量服务器注意

轻量系统盘 40-50GB，**别把备份放系统盘**。建议：
- 备份目录 `/backup/` 放系统盘
- 每周一次手动下载到本地（用 scp）
- 后续接入阿里云对象存储做异地备份（可选）

---

## 10. 监控与日志

### 10.1 PM2 日志

```bash
pm2 logs health-api
# 落盘位置: /root/.pm2/logs/health-api-out.log
#           /root/.pm2/logs/health-api-error.log
```

### 10.2 日志轮转

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### 10.3 阿里云轻量监控

轻量应用服务器控制台 → 监控 → 开启基础监控：
- CPU 使用率
- 内存使用率
- 公网出带宽
- 磁盘使用率

**告警规则建议**：
- CPU > 80% 持续 5 分钟
- 内存 > 85% 持续 5 分钟
- 磁盘使用率 > 85%

### 10.4 实时监控面板

```bash
pm2 monit     # 实时 CPU/内存/日志看板
htop         # 系统级（sudo apt install -y htop）
```

---

## 11. 安全加固

### 11.1 修改管理后台密码

```bash
nano /var/www/healthstation/backend/.env
# ADMIN_PASSWORD=<至少 16 位的强密码>
pm2 reload health-api
```

### 11.2 防火墙（轻量自带控制台即可）

在轻量应用服务器控制台 → 防火墙 → 配置规则：
- 22/80/443 放行
- 3000 **不**放行

### 11.3 SSH 密钥登录（推荐）

```bash
# 本地 Mac：生成密钥
ssh-keygen -t ed25519

# 把公钥复制到服务器
ssh-copy-id deploy@<公网IP>

# 服务器：禁用密码登录
sudo nano /etc/ssh/sshd_config
# PasswordAuthentication no
sudo systemctl restart sshd
```

### 11.4 数据库文件

- `backend/data/health.db` **绝对不要**让公网访问
- Nginx 配置不要把 `/data/` 暴露出去
- 定期检查文件权限：`chmod 600`

### 11.5 定期更新

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 12. 常见问题排查

### Q1: 启动报 `Cannot find module 'node:sqlite'`

**原因**：Node 版本 < 22。
**解决**：
```bash
node -v   # 必须 >= v22
# 升级见第 2 节
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
sudo lsof -i :80
# 通常是 apache2 占用了
sudo systemctl stop apache2
sudo systemctl disable apache2
```

### Q7: 中文乱码

SQLite 默认 UTF-8，应该没问题。如果出现：
```bash
sqlite3 health.db "PRAGMA encoding;"   # 应为 UTF-8
```
如果不对，需要重建库（SQLite 不支持改编码）。

### Q8: 大陆用户访问很慢

**原因**：没配 CDN（见第 8 节）。
**解决**：开阿里云 CDN，把 `cdn.your-domain.com` 解析到 CDN。

### Q9: 视频加载卡顿

- 确认走的是 OSS+CDN，不是服务器
- 视频文件用 `mp4` 编码（H.264），不要用 MOV
- 视频大小建议 < 100MB/段
- 考虑用 HLS（m3u8 + ts 分片）做流媒体

### Q10: 域名解析不生效

```bash
ping health.your-domain.com
nslookup health.your-domain.com
# 国内 DNS 解析慢，DNS 缓存可能需要 10-30 分钟
```

---

## 13. 接下来你要做什么（操作清单）

> 这是按时间顺序的**完整行动清单**，照着做就行。

### 📅 第 1 步：购买服务器（1 小时）

- [ ] 登录阿里云控制台
- [ ] 购买**轻量应用服务器 · 2 核 2G · 香港节点 · Ubuntu 22.04**
- [ ] 拿到公网 IP
- [ ] 控制台防火墙放行：22、80、443

### 📅 第 2 步：购买域名（30 分钟）

- [ ] 阿里云万网 / 腾讯云 DNSPod 购买域名（.com 推荐）
- [ ] DNS 解析：添加 A 记录 `health.your-domain.com` → 香港服务器 IP
- [ ] 等待 10-30 分钟 DNS 生效（`ping health.your-domain.com` 验证）

### 📅 第 3 步：准备内容素材（2-4 小时，不依赖任何外部条件）

- [ ] 7 张正式图片（hero、title1/2/3、team、mona-lisa、joyride）→ 替换 `assets/images/`
- [ ] 6 个模块的 PDF（每模块 2-3 个）
- [ ] 6 个模块的视频（每模块 2-3 个 mp4）
- [ ] 视频封面图
- [ ] 各模块卷首语文字

### 📅 第 4 步：开通 OSS + CDN（30 分钟）

- [ ] 创建 OSS Bucket（杭州/上海）+ 公共读权限
- [ ] 创建 RAM 子用户 + AccessKey + AliyunOSSFullAccess 授权
- [ ] 开通阿里云 CDN，添加 `cdn.your-domain.com`
- [ ] DNS 解析 `cdn` CNAME 到 CDN 给的值
- [ ] 给 CDN 配置 HTTPS 证书（或选阿里云免费证书）

### 📅 第 5 步：服务器初始化（1 小时）

- [ ] SSH 登录服务器：`ssh root@<IP>`
- [ ] 创建 deploy 用户
- [ ] 装 Node.js 22 + PM2 + Nginx + sqlite3 + certbot
- [ ] 拉代码：`git clone https://github.com/DD-010502/health-station.git /var/www/healthstation`
- [ ] `cd backend && npm install --production`
- [ ] `cp .env.example .env` 并填入 OSS 密钥、ADMIN_PASSWORD、CDN 域名
- [ ] 启动后端（PM2 Cluster 双进程，384MB 内存限制）
- [ ] 配置 Nginx 反向代理
- [ ] 配 HTTPS 证书
- [ ] 配置 crontab 每日备份
- [ ] 配置 PM2 logrotate

### 📅 第 6 步：上传内容（1-2 小时）

- [ ] 通过管理后台上传 PDF / 视频 / 封面到 OSS
- [ ] 通过 API 或管理后台更新 `content_modules`，填入 OSS URL
- [ ] 编辑各模块卷首语文字
- [ ] 配置 `window.CONTENT_DATA` 注入（或通过 `GET /api/content` 动态加载）

### 📅 第 7 步：全流程测试（1 小时）

- [ ] 打开 `https://health.your-domain.com`
- [ ] 输入昵称 → 检查 `users` 表新增
- [ ] 浏览各模块 → 检查 `events` 表
- [ ] 打卡 → 检查 `checkin_data` 表
- [ ] 播放视频 → 检查 `video_watch` 表
- [ ] 打开 `/admin` 登录 → 看管理后台数据
- [ ] 检查 CDN 缓存是否命中（`curl -I https://cdn.your-domain.com/...`）
- [ ] 检查大陆访问速度（用 `https://www.17ce.com` 或 `https://tools.ipip.net` 测速）

### 📅 第 8 步：上线公告（30 分钟）

- [ ] 修改 `ADMIN_PASSWORD` 为强密码
- [ ] 启用 SSH 密钥登录
- [ ] 关闭防火墙 22 端口对全网开放（仅允许你的 IP）
- [ ] 在 README/CONTACT 留下联系方式
- [ ] 通知用户上线

### 📅 第 9 步：持续运营

- [ ] 每周看一次管理后台统计
- [ ] 每月做一次备份恢复演练
- [ ] 每季度更新一次内容
- [ ] 关注阿里云控制台告警
- [ ] 监控 PM2 进程状态

---

### 一页式快速部署命令

```bash
# === 完整部署（一行一行复制执行）===

# 1. SSH 登录
ssh root@<公网IP>

# 2. 装基础
apt update && apt install -y nginx sqlite3
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2

# 3. 创建用户
adduser deploy
usermod -aG sudo deploy
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy

# 4. 拉代码（以 deploy 用户身份）
su - deploy
mkdir -p /var/www/healthstation
cd /var/www/healthstation
git clone https://github.com/DD-010502/health-station.git .

# 5. 装依赖 + 配 .env
cd backend
npm install --production
cp .env.example .env
nano .env  # 填 OSS 密钥、ADMIN_PASSWORD、CDN 域名

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

# 8. HTTPS
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d health.your-domain.com

# 9. 备份 cron
(crontab -l 2>/dev/null; echo "0 3 * * * sqlite3 /var/www/healthstation/backend/data/health.db \".backup /backup/health_\$(date +\\%Y\\%m\\%d).db\"") | crontab -

# 10. PM2 日志轮转
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

✅ 全部执行完即可上线。

---

**文档版本**：v1.1 · 2026-07-09
**项目版本**：健康小站 v1.1（SQLite 版）
**目标环境**：阿里云轻量应用服务器 · 2 核 2G · 香港节点
**预计部署耗时**：4-6 小时（含素材准备），纯部署动作 1-2 小时
