# 健康小站 · 上线路程图

> 当前状态：本地开发完成，前后端未联通，未部署
> 数据库：SQLite（better-sqlite3，单文件 + WAL 模式）

---

## 总览

```
现在                         目标
──────                      ──────
后端: localhost:3000  ✅     后端: https://api.health.xxx
前端: file:// 本地打开       前端: https://health.xxx (同一域名)
数据库: 本地 SQLite          数据库: ECS 本地 SQLite 单文件
文件: 本地磁盘               文件: 阿里云 OSS
```

---

## 第一阶段：本地联通（1 小时）

让前端页面能通过 HTTP 访问，并且能调用后端 API。

- [ ] **1.1 让 Express 托管前端页面**
  - 修改 `backend/src/index.js`，加一行 `app.use(express.static(...))` 指向 `try/` 目录
  - 这样 `localhost:3000` 同时提供前端 HTML 和后端 API
  - 不再用 `file://` 打开

- [ ] **1.2 全流程测试**
  - 打开 `localhost:3000` → 看到主页面
  - 输入昵称 → 检查数据库 users 表确认新增
  - 打卡 → 检查 events 表和 checkin_data 表
  - 点击视频 → 检查 video_watch 表
  - 确认管理后台能看到用户数据

---

## 第二阶段：阿里云 ECS 服务器（2 小时）

- [ ] **2.1 购买 ECS 实例**
  - 地域：杭州/上海（离用户近）
  - 规格：2 核 2G（SQLite 方案，初期够用）
  - 系统：Ubuntu 22.04
  - 拿到公网 IP

- [ ] **2.2 安全组配置**
  - 开放 22（SSH）、80（HTTP）、443（HTTPS）
  - 3000 端口不需要开放（Nginx 内部转发）

- [ ] **2.3 SSH 登录服务器**
  ```bash
  ssh root@<公网IP>
  ```

- [ ] **2.4 安装运行环境**
  ```bash
  # Node.js 20
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs

  # SQLite3（一般系统已自带，验证一下即可）
  apt install -y sqlite3

  # Nginx
  apt install -y nginx

  # PM2（进程守护）
  npm install -g pm2
  ```

- [ ] **2.5 上传代码到服务器**
  ```bash
  # 方式 A：git clone（推荐）
  git clone <你的仓库> /var/www/healthstation

  # 方式 B：scp 直接传
  scp -r try/ root@<IP>:/var/www/healthstation/
  ```

- [ ] **2.6 初始化数据库**
  ```bash
  # 启动后端时会自动建表 + 插入默认模块（无需手动导入 schema.sql）
  # 也可手动执行：
  cd /var/www/healthstation/backend
  mkdir -p data
  sqlite3 data/health.db < schema.sql
  ```

- [ ] **2.7 配置 .env**
  ```bash
  cp backend/.env.example backend/.env
  # 编辑填入 OSS 密钥和管理员密码
  nano backend/.env
  ```

- [ ] **2.8 启动后端（PM2 Cluster 双进程）**
  ```bash
  cd /var/www/healthstation/backend
  npm install --production
  pm2 start src/index.js -i 2 --name health-api
  pm2 save
  pm2 startup    # 开机自启
  ```

  > 双进程模式 `-i 2` 利用 2 个 CPU 核心，比单进程吞吐翻倍。

---

## 第三阶段：Nginx 反向代理 + 域名（1 小时）

- [ ] **3.1 购买域名**
  - 阿里云万网 / 腾讯云 DNSPod
  - 建议：`health.xxx.com` 或独立域名

- [ ] **3.2 域名解析**
  - 添加 A 记录 → 指向 ECS 公网 IP
  - 生效后 `ping health.xxx.com` 验证

- [ ] **3.3 配置 Nginx**

  ```nginx
  # /etc/nginx/sites-available/healthstation
  server {
      listen 80;
      server_name health.xxx.com;   # ← 换成你的域名

      root /var/www/healthstation;

      # 前端静态文件
      location / {
          try_files $uri $uri/ /index.html;
      }

      # 后端 API 转发
      location /api/ {
          proxy_pass http://127.0.0.1:3000;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      }
  }
  ```

  ```bash
  ln -s /etc/nginx/sites-available/healthstation /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
  ```

- [ ] **3.4 验证**
  - `http://health.xxx.com` → 看到主页面
  - `http://health.xxx.com/admin` → 看到管理后台
  - `http://health.xxx.com/api/health` → 返回 JSON

---

## 第四阶段：HTTPS + SSL 证书（30 分钟）

- [ ] **4.1 安装 certbot**
  ```bash
  apt install -y certbot python3-certbot-nginx
  ```

- [ ] **4.2 申请证书**
  ```bash
  certbot --nginx -d health.xxx.com
  ```
  自动配置 HTTPS，证书 90 天自动续期。

- [ ] **4.3 验证**
  - `https://health.xxx.com` → 浏览器显示 🔒
  - HTTP 自动跳转 HTTPS

---

## 第五阶段：阿里云 OSS 文件存储（1 小时）

- [ ] **5.1 开通 OSS**
  - 阿里云控制台 → 对象存储 OSS
  - 创建 Bucket：`health-station-files`
  - 地域：和 ECS 同地域（内网传输免费）
  - 权限：公共读

- [ ] **5.2 创建 AccessKey**
  - RAM 访问控制 → 创建子用户
  - 授权：AliyunOSSFullAccess
  - 拿到 AccessKey ID 和 Secret

- [ ] **5.3 配置后端**
  ```bash
  # 编辑 backend/.env
  OSS_REGION=oss-cn-hangzhou
  OSS_ACCESS_KEY_ID=<你的AK>
  OSS_ACCESS_KEY_SECRET=<你的SK>
  OSS_BUCKET=health-station-files
  OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
  ```
  ```bash
  pm2 restart health-api
  ```

- [ ] **5.4 测试上传**
  - 打开管理后台 → 上传文件
  - 确认文件出现在 OSS Bucket 中
  - 复制返回的 URL，能公开访问

- [ ] **5.5 （可选）CDN 加速**
  - 阿里云 CDN → 添加域名 `cdn.health.xxx.com`
  - 源站：OSS Bucket
  - 配置 `.env` 中 `OSS_CDN_BASE=https://cdn.health.xxx.com`

---

## 第六阶段：内容上线（2 小时）

- [ ] **6.1 准备图片素材**
  - 替换 `assets/images/` 下所有图片为正式版
  - hero.png, title1/2/3.jpg, team.jpg, joyride.png

- [ ] **6.2 上传 PDF 和视频**
  - 通过管理后台上传 PDF 到各模块
  - 上传视频 + 封面到各模块
  - 记录返回的 OSS URL

- [ ] **6.3 更新模块内容**
  - 通过 `POST /api/content/:moduleId` 或管理后台
  - 把 PDF/视频 URL 填入对应模块的 pdfs/videos 数组
  - 编辑卷首语文字

- [ ] **6.4 配置内容注入**
  - 让后端在返回 HTML 时，把模块内容注入为 `window.CONTENT_DATA`
  - 或者前端通过 `GET /api/content` 动态加载

---

## 第七阶段：生产加固（1 小时）

- [ ] **7.1 修改管理后台密码**
  ```bash
  # 编辑 backend/.env
  ADMIN_PASSWORD=<强密码>
  pm2 restart health-api
  ```

- [ ] **7.2 配置 SQLite 自动备份**
  ```bash
  # crontab -e，每天凌晨 3 点备份（SQLite 备份就是复制单文件）
  0 3 * * * cp /var/www/healthstation/backend/data/health.db /backup/health_$(date +\%Y\%m\%d).db

  # 推荐使用 .backup 模式（热备份，不影响运行）
  0 3 * * * sqlite3 /var/www/healthstation/backend/data/health.db ".backup /backup/health_$(date +\%Y\%m\%d).db"
  ```

- [ ] **7.3 配置日志**
  ```bash
  pm2 install pm2-logrotate
  pm2 set pm2-logrotate:max_size 10M
  pm2 set pm2-logrotate:retain 30
  ```

- [ ] **7.4 监控告警（可选）**
  - 阿里云云监控：ECS CPU、内存、磁盘
  - PM2 自带监控：`pm2 monit`

---

## 第八阶段：持续维护

- [ ] 定期更新内容（卷首语、PDF、视频）
- [ ] 查看管理后台统计数据，了解用户行为
- [ ] 根据用户反馈调整模块和内容
- [ ] 数据库定期备份恢复演练

---

## 一句话总结

```
本地开发完成 → 买服务器 + 域名 → 配 Nginx 联通前后端
→ 配 HTTPS → 配 OSS 存文件 → 上传内容 → 上线 ✅

预计总时间：1-2 天（不含等待域名备案）
```

## 当前可做（不等服务器）

- [ ] 本地联通前后端（第一阶段，1 小时）
- [ ] 准备正式图片、PDF、视频素材
- [ ] 注册阿里云账号，开通 OSS
- [ ] 购买域名
