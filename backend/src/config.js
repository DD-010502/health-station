// 配置中心 — 所有环境变量从这里读取
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  debug: process.env.DEBUG === 'true',

  // SQLite
  db: {
    // 数据库文件路径，相对 backend/ 目录
    path: process.env.DB_PATH || './data/health.db',
  },

  // 阿里云 OSS
  oss: {
    region:          process.env.OSS_REGION || 'oss-cn-hangzhou',
    accessKeyId:     process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
    bucket:          process.env.OSS_BUCKET || 'health-station-files',
    endpoint:        process.env.OSS_ENDPOINT || 'https://oss-cn-hangzhou.aliyuncs.com',
    cdnBase:         process.env.OSS_CDN_BASE || '',   // CDN 加速域名，为空则直接用 OSS URL
  },
};
