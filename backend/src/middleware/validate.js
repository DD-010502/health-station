// 输入校验中间件工厂

// 校验请求体中是否存在指定字段
function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => !req.body[f] && req.body[f] !== 0);
    if (missing.length > 0) {
      return res.status(400).json({ error: `缺少字段: ${missing.join(', ')}` });
    }
    next();
  };
}

// 校验并修剪字符串长度
function maxLength(field, max) {
  return (req, res, next) => {
    if (req.body[field] && typeof req.body[field] === 'string') {
      if (req.body[field].length > max) {
        return res.status(400).json({ error: `${field} 超过最大长度 ${max}` });
      }
      req.body[field] = req.body[field].trim().slice(0, max);
    }
    next();
  };
}

// 校验 type 枚举值
function validType(field, allowed) {
  return (req, res, next) => {
    const val = req.body[field];
    if (val && !allowed.includes(val)) {
      return res.status(400).json({ error: `${field} 必须是 ${allowed.join('|')}` });
    }
    next();
  };
}

module.exports = { requireFields, maxLength, validType };
