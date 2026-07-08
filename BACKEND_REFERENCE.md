# 健康小站 · 后端开发参考文档

> 生成日期：2026-07-08 | 前端路径：`/Users/dd/Documents/html/try/`

---

## 一、项目文件结构

```
try/
├── index.html              # 主页面（SPA 仪表板，iframe 嵌入 5 个子页面）
├── BACKEND_REFERENCE.md    # 本文档
├── components/             # iframe 嵌入式子页面
│   ├── team.html           #   团队介绍信
│   ├── tangram.html        #   七巧板拼图
│   ├── domino.html         #   多米诺骨牌
│   ├── mortise.html        #   榫卯互动
│   └── checkin.html        #   每日打卡
├── pages/                  # 独立子页面（箭头链接目标）
│   ├── health-detail.html  #   6 模块健康知识详情页
│   ├── health-loop.html    #   环环相扣的健康行为（1 模块）
│   ├── mortise.html        #   计划与行动（1 模块）
│   └── checkin.html        #   打卡科学说明（静态页）
└── assets/images/          # 图片资源
    ├── hero.png            #   主页面 Hero 图
    ├── title1.jpg          #   健康知识页 Hero 图
    ├── title2.jpg          #   健康循环页 Hero 图
    ├── title3.jpg          #   计划行动页 Hero 图
    ├── team.jpg            #   团队照片
    ├── mona-lisa.png       #   打卡页蒙娜丽莎
    └── joyride.png         #   榫卯页插图
```

---

## 二、后端需要实现的 API 端点

### 2.1 事件追踪

```
POST /api/track/event
Content-Type: application/json

{
  "user_id": "u-abc12345-1710432000000",
  "user_name": "小明",
  "ts": 1710432000000,
  "type": "事件类型（见下表）",
  // ... 各类型特有字段
}
```

#### 事件类型完整表

| type | 触发场景 | 额外字段 | 来源文件 |
|---|---|---|---|
| `set_nickname` | 用户首次输入昵称 | `name` | index.html |
| `add_task` | 添加打卡项 | `task_label` | checkin.html |
| `remove_task` | 删除打卡项 | `task_label` | checkin.html |
| `checkin` | 完成打卡 | `task_label`, `date` | checkin.html |
| `open_letter` | 打开团队介绍信 | — | team.html |
| `view_module` | 切换到某个知识模块 | `module_id`（diet/exercise/sleep/screen/habits/mental/loop/action） | health-detail.html, health-loop.html, pages/mortise.html |
| `open_pdf` | 点击 PDF 卡片 | `module_id`, `target_id`, `href` | 同上 |
| `open_video` | 点击视频卡片 | `module_id`, `target_id`, `session_id` | 同上 |
| `video_watch` | 视频播放进度 | 见 2.2 | 同上 |

### 2.2 视频观看时长追踪

```
POST /api/track/video-watch
Content-Type: application/json

{
  "user_id": "u-abc12345-1710432000000",
  "user_name": "小明",
  "ts": 1710432000000,
  "type": "video_watch",
  "session_id": "sess-x7k2m9p4-1710432000000",
  "module_id": "diet",
  "target_id": "diet-vid-1",
  "video_id": "diet-vid-1",
  "event": "play|pause|seek|end|tick|close",
  "positionSec": 42.5,
  "durationSec": 180.0,
  "percent": 23.6
}
```

**上报频率**：
- `play` — 用户点击播放
- `pause` — 用户暂停
- `seek` — 用户拖动进度条
- `end` — 视频播放完毕
- `tick` — 每 10 秒自动上报一次
- `close` — 关闭视频弹窗

### 2.3 端点可配置

前端所有端点均通过 `window` 全局变量覆盖：

```js
window.TRACK_ENDPOINT = '/api/track/event';           // 默认值
window.VIDEO_WATCH_ENDPOINT = '/api/track/video-watch'; // 默认值
```

### 2.4 用户管理（新增）

```
POST /api/users
Content-Type: application/json
Request:  { "name": "小明", "id": "u-xxx" }   // id 可选，首次为空
Response: { "id": "user_abc123", "name": "小明", "created_at": "..." }
```

前端行为：
1. 用户输入昵称 → 调用 `POST /api/users`
2. 后端返回 `user_id` → 前端存入 `localStorage.healthUser`
3. 后续所有 track 事件自动携带 `user_id` + `user_name`
4. 后端离线时降级为本地生成 `user_id`

### 2.5 打卡数据同步（新增）

```
GET  /api/checkin/todos              → { todos: [...], doneDates: [...], doneTasks: {...} }
POST /api/checkin/todos              → 全量同步 todos 数组
POST /api/checkin/done               → 同步单条打卡记录 { date, task_label }
```

前端行为：
1. 页面加载 → 尝试 `GET /api/checkin/todos`，成功则使用服务端数据
2. 添加/删除/打卡 → 更新 localStorage + POST 到后端
3. 后端离线时降级为纯 localStorage

### 2.6 传输方式

- 优先使用 `navigator.sendBeacon()`（页面卸载时也能发送）
- 降级为 `fetch()` + `keepalive: true`
- 所有请求为 fire-and-forget，不等待响应

---

## 三、前端数据注入接口

后端在页面加载前（`<script>` 执行前）设置 `window.*` 变量即可替换所有内容。

### 3.1 主页面文字 — `window.PAGE_DATA`

```js
window.PAGE_DATA = {
  heroTitleHtml: 'How do you keep <span class="click" id="healthyWord">healthy</span>?',
  heroTip: '点击 healthy 试试看 ✨',
  nicknameTitle: '请取一个您的专属昵称吧～',
  nicknameSub: '这个名字会陪你一起记录健康旅程',
  nicknamePlaceholder: '输入昵称...',
  nicknameConfirm: '确认',
  sections: [
    { id: 'sec-team',    num: 'Section 01', title: '一封信来自我们' },
    { id: 'sec-tangram', num: 'Section 02', title: '七巧板 · 健康行为小知识拼图' },
    { id: 'sec-loop',    num: 'Section 03', title: '多米诺骨牌 · 环环相扣的健康行为' },
    { id: 'sec-mortise', num: 'Section 04', title: '一锤入榫 · 计划与行动' },
    { id: 'sec-checkin', num: 'Section 05', title: '每日打卡 · 一日一行' },
  ],
  mortiseLinkHtml: '点击请了解如何制定更棒的行动与计划～',
};
```

### 3.2 团队介绍信 — `window.TEAM_LETTER_DATA`

```js
window.TEAM_LETTER_DATA = {
  greeting: '亲爱的同学/朋友：',
  letterEyebrow: 'Letter · No. 01',
  letterTitle: '<em>给青少年</em><span class="cn"> 的一封信</span>',
  letterDate: '写于 二〇二六年 · 初夏',
  cornerTag: 'Team · Letter 01',
  paragraphs: [
    '你好呀~ 欢迎来到「How do you keep healthy?」健康小站！',
    '我们是一支热爱健康教育的团队...',
    // ...
  ],
  signOff: '—— 你的健康小团队 ❤️',
  signAlign: 'right',
  signLabel: '你的健康小团队<br/>于二〇二六年夏',
};
```

### 3.3 打卡页文字 — `window.CHECKIN_DATA`

```js
window.CHECKIN_DATA = {
  title: '健康生活 小清单',
  placeholder: '写下今天想打卡的小事…',
  addButton: '添加',
  emptyHint: '还没有打卡项，写一个开始吧 ✨',
  monaCaption: '看着她，你今天也要微笑打卡哦',
};
```

### 3.4 知识子页面内容 — `window.CONTENT_DATA`

```js
window.CONTENT_DATA = {
  // health-detail.html（6 个模块）
  diet: {
    intro: {
      title: '营养饮食 · 吃对每一餐',
      paragraphs: ['段落1...', '段落2...'],
    },
    pdfs: [
      { id: 'diet-pdf-1', title: '青少年膳食指南手册', url: 'https://oss.example.com/xxx.pdf' },
      // ... 数量无上限
    ],
    videos: [
      { id: 'diet-vid-1', title: '营养早餐怎么搭？', desc: '...', url: 'https://oss.example.com/xxx.mp4', poster: '' },
      // ... 数量无上限
    ],
  },
  exercise: { /* 同上结构 */ },
  sleep:    { /* 同上结构 */ },
  screen:   { /* 同上结构 */ },
  habits:   { /* 同上结构 */ },
  mental:   { /* 同上结构 */ },

  // health-loop.html（1 个模块）
  loop: { intro: {...}, pdfs: [...], videos: [...] },

  // pages/mortise.html（1 个模块）
  action: { intro: {...}, pdfs: [...], videos: [...] },
};
```

**模块 ID 对照表**：

| module_id | 中文名 | 所在页面 |
|---|---|---|
| `diet` | 营养饮食 | health-detail.html |
| `exercise` | 积极运动 | health-detail.html |
| `sleep` | 良好睡眠 | health-detail.html |
| `screen` | 合理视屏 | health-detail.html |
| `habits` | 禁烟禁酒 | health-detail.html |
| `mental` | 心理健康 | health-detail.html |
| `loop` | 环环相扣的健康行为 | health-loop.html |
| `action` | 计划与行动 | pages/mortise.html |

### 3.5 互动模块文字

```js
// 多米诺骨牌链接
window.DOMINO_DATA = { linkText: '点一下 <em>第一块</em>，看它们如何点亮小灯。<br/>请继续了解健康行为之间是如何环环紧密关联的～' };

// 榫卯 iframe 链接
window.MORTISE_DATA = { linkText: '接下来请学习<br/>健康行为的<em>行动计划</em>~' };

// 七巧板提示
window.TANGRAM_DATA = { hintText: '请点击左侧的图形板块来完成拼图吧～<br/>完成后再次点击相应的板块继续学习小知识' };
```

### 3.6 调试开关

```js
window.__HEALTH_DEBUG__ = true;  // 所有 track() 调用输出 console.log
```

---

## 四、前端 localStorage 数据结构

| Key | 类型 | 示例值 | 写入方 | 读取方 |
|---|---|---|---|---|
| `healthUser` | Object | `{"name":"小明","id":"u-x7k2m9p4-1710432000000","created_at":"2026-07-08T...","updated_at":"..."}` | index.html | 所有页面 |
| `healthTodos` | Array | `[{"id":"a1b2","label":"喝一杯水","streak":3,"createdAt":"..."}]` | checkin.html | checkin.html |
| `healthDoneDates` | Array | `["2026-07-08","2026-07-07"]` | checkin.html | index.html, checkin.html |
| `healthDoneTasks` | Object | `{"2026-07-08":["喝一杯水","出门散步"]}` | checkin.html | checkin.html |

**注意**：`index.html` 轮询 `healthDoneDates`（每 3 秒）来计算连续打卡天数。后端同步时需保持此键名。

---

## 五、文件上传建议

### PDF 和视频通过阿里云 OSS 上传

推荐流程：
1. 后端提供 `POST /api/admin/upload` 接口
2. 接收 `multipart/form-data`：`file` + `type`（pdf/video）+ `module_id` + `title`
3. 上传到 OSS，返回 `{ id, url }`
4. 更新数据库中的模块内容
5. 前端下次加载时通过 `window.CONTENT_DATA` 注入新的 PDF/视频 URL

前端已做好数据驱动渲染 — PDF 和视频数量无上限，`pdfs[]` / `videos[]` 数组有多少条就渲染多少卡片。

---

## 六、CSS 品牌色参考

| 变量 | 色值 | 用途 |
|---|---|---|
| `--ink` | `#2B2A28` | 主文字色 |
| `--accent` | `#C24A1F` | 强调色（砖红） |
| `--pink` | `#FDF8F5` | 模块交替背景 |
| `--yellow` | `#F8D053` | 高亮/装饰 |
| `--orange` | `#E07A2E` | 次强调/打卡 |
| `--blue` | `#5BB0D4` | PDF 卡片 |
| `--pink2` | `#CB6851` | 视频卡片/渐变 |
| `--green` | `#799863` / `#4F9A55` | 成功/打卡完成 |
| `--paper` | `#FFFFFF` | 主背景 |

全局字体：`"Ma Shan Zheng", "ZCOOL KuaiLe", "Liu Jian Mao Cao"`（手写体，Google Fonts）

---

## 七、后端 API 实现清单

### 必做
- [ ] `POST /api/users` — 用户注册/登录，返回 `user_id`
- [ ] `POST /api/track/event` — 接收所有用户行为事件
- [ ] `POST /api/track/video-watch` — 接收视频观看时长数据

### 建议
- [ ] `GET /api/checkin/todos` — 加载用户打卡数据
- [ ] `POST /api/checkin/todos` — 同步用户打卡任务列表
- [ ] `GET /api/content/:moduleId` — 返回模块内容（intro + pdfs + videos），替代前端 `window.CONTENT_DATA` 注入

### 管理后台
- [ ] `POST /api/admin/upload` — 上传 PDF/视频到 OSS，返回 URL
- [ ] 管理界面：编辑模块内容、查看用户数据、查看追踪统计

### 数据库表建议
| 表 | 字段 |
|---|---|
| users | id, name, created_at, updated_at |
| events | id, user_id, user_name, type, module_id, target_id, payload(JSON), ts |
| video_watch | id, user_id, session_id, video_id, event, position_sec, duration_sec, percent, ts |
| content_modules | id, module_key, intro_title, intro_paragraphs(JSON), pdfs(JSON), videos(JSON) |
| checkin_todos | user_id, todos(JSON), done_dates(JSON), done_tasks(JSON), updated_at |

## 八、后续可优化项

- 将 `window.CONTENT_DATA` 注入改为 `GET /api/content/:moduleId` 动态加载
- 将 `window.PAGE_DATA` / `window.TEAM_LETTER_DATA` 等改为后端 API
- 打卡数据目前 localStorage + 后端双写，可改为纯后端
- WebSocket 实时推送用户统计数据
- CDN 加速 Google Fonts（马善政字体）加载
