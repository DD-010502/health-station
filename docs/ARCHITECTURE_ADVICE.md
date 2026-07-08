# 健康小站 — 架构选型建议

> 基于 400 用户规模、2核2G ECS 的部署方案分析。待实施时参考。

---

## 一、SQLite 替代 MySQL 方案

### 可行性结论

✅ **完全可行。** 400 用户规模下 SQLite 绰绰有余，所有业务功能均可覆盖。

### 负载推演（极端情况：400 人同时操作）

```
假设分布：
  300 人浏览页面（读 content_modules）
   80 人打卡/看视频（写 events + video_watch）
   20 人保存打卡数据（写 checkin_data）

→ 100 个写请求同时到达
→ 每条 INSERT 约 0.5-1ms（SSD）
→ 最长排队等待 100ms（0.1 秒）
→ 用户完全无感知
```

### WAL 模式特性

| 操作 | 是否并行 |
|------|----------|
| 读 + 读 | ✅ 无限并行 |
| 读 + 写 | ✅ 互不阻塞 |
| 写 + 写 | ⚠️ 排队（毫秒级，无影响） |

### SQLite 能力上限 vs 实际需求

| 指标 | SQLite 能力 | 400 用户需求 | 余量 |
|------|-------------|-------------|------|
| 读/秒 | 数万次 | 2-5 次 | ✅ 巨大 |
| 写/秒 | 数百次 | 偶尔 | ✅ 巨大 |
| 数据库大小 | TB 级 | 几百 MB | ✅ |
| 同时连接 | 数百 | 几个 | ✅ |

### 需要改动的代码

| 文件 | 改动内容 | 预计耗时 |
|------|----------|----------|
| `backend/schema.sql` | DDL 语法改为 SQLite | 30 分钟 |
| `backend/src/db.js` | mysql2 → better-sqlite3 | 10 分钟 |
| `backend/src/routes/checkin.js` | `ON DUPLICATE KEY UPDATE` → `ON CONFLICT` | 5 分钟 |
| `backend/src/routes/content.js` | 同上 | 5 分钟 |
| `backend/src/routes/admin.js` | 日期函数改写（~5 条 SQL） | 20 分钟 |
| `backend/package.json` | 换依赖 | 2 分钟 |

**总计约 1-2 小时工作量。**

### MySQL 特性 → SQLite 对应方案

| MySQL 语法 | SQLite 替代 |
|------------|-------------|
| `ON DUPLICATE KEY UPDATE` | `INSERT ... ON CONFLICT ... DO UPDATE SET` |
| `CURDATE()` | `date('now')` |
| `DATE_SUB(CURDATE(), INTERVAL 7 DAY)` | `date('now', '-7 days')` |
| `JSON` 列类型 | `TEXT` + SQLite JSON 函数 |
| `ON UPDATE CURRENT_TIMESTAMP` | 触发器 或 代码手动设值 |
| `AUTO_INCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `DECIMAL` 类型 | `REAL`（精度足够） |
| `CHARACTER SET utf8mb4` | SQLite 天然 UTF-8，无需声明 |

### 何时需要迁移回 MySQL

> 日活破千、并发写入破百时再考虑。那是该开心的「甜蜜烦恼」。

---

## 二、带宽方案

### 核心策略：ECS 只走轻量数据，大文件走 OSS + CDN

```
用户打开网页
  ↓
ECS → HTML + API JSON       ← 几十 KB/次，400 人同时约 30MB 总量
  ↓
OSS → 图片/视频/PDF + CDN   ← 大文件不经过 ECS
```

### 流量估算

```
ECS 单次请求：HTML ~50KB + API JSON ~5KB = ~55KB
400 人同时加载：55KB × 400 ≈ 22MB
3 秒内发完需要带宽：22MB × 8 / 3s ≈ 58 Mbps
5 秒内发完需要带宽：22MB × 8 / 5s ≈ 35 Mbps
```

### 推荐配置

| 项目 | 方案 | 月费 |
|------|------|------|
| ECS 公网带宽 | **按量计费**，峰值设 30-50 Mbps | 初期几块钱 |
| OSS 对象存储 | 存图片/视频/PDF | 按量（初期限免） |
| CDN 加速 | OSS 自带 CDN 能力 | 按量，初期几块钱 |

> ⚠️ 不要选固定带宽，初期流量小按量计费便宜得多。

---

## 三、Node.js 并发方案

### Node.js 天然适合 I/O 密集型

```
400 个请求同时到达 Node：
  ├─ 请求1：查 SQLite → 异步等 I/O(0.5ms) → 返回
  ├─ 请求2：查 SQLite → 异步等 I/O(0.5ms) → 返回
  ├─ ...
  └─ 请求400：查 SQLite → 异步等 I/O(0.5ms) → 返回

Node 不卡在 I/O 等待上，400 并发是常规水平。
```

### PM2 Cluster 双保险

```bash
# 2核 CPU → 跑 2 个 Node 进程，各占一个核
pm2 start index.js -i 2
```

| 效果 | 说明 |
|------|------|
| 负载均衡 | PM2 自动分配请求到两个进程 |
| 热重载 | `pm2 reload` 更新代码，零停机 |
| 自动重启 | 进程崩溃自动拉起 |
| 内存 | 2 进程各约 150MB ≈ 300MB，2G 内存足够 |

---

## 四、推荐整体架构

```
用户 ←→ 域名 DNS
          ↓
     Nginx (反向代理 + gzip 压缩)
          ↓
     Node.js × 2 (PM2 Cluster)
          ↓
     SQLite (单文件, WAL 模式)
          ↓
     只返回 HTML + API JSON


     OSS + CDN (图片/视频/PDF)
     ↑
     用户直接访问（不经过 ECS）
```

### 各组件职责

| 组件 | 作用 | 压力 |
|------|------|------|
| Nginx gzip | HTML/JSON 压缩到原 1/5，省 80% 带宽 | ✅ |
| PM2 Cluster × 2 | Node.js 双进程兜底 | ✅ |
| SQLite WAL | 读写互不锁 | ✅ |
| OSS + CDN | 大文件不经过 ECS | ✅ |

### 服务器配置预估

| 配置项 | 选型 | 月费 |
|--------|------|------|
| ECS | 2核2G，杭州 | ~60-70 元 |
| 系统盘 | 40GB ESSD PL0 | ~12 元 |
| 带宽 | 按量计费，峰值 30-50 Mbps | ~几元 |
| OSS | 存储 + 下行流量 | ~几元 |
| **合计** | | **~80-100 元/月** |

> 相比 2核4G + MySQL 方案（~120 元/月），每月省 ~40 元，且部署更简单。

---

## 五、实施待办

- [ ] 将 `backend` 改为 SQLite 版本
- [ ] 本地测试所有 API
- [ ] 购买 ECS 2核2G（杭州）
- [ ] 购买域名 + OSS
- [ ] 部署 + 配置 PM2 Cluster + Nginx
- [ ] 上传素材至 OSS
- [ ] 全流程测试
