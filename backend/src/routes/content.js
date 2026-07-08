// GET  /api/content/:moduleId  — 获取模块内容（前端注入用）
// POST /api/content/:moduleId  — 更新模块内容（管理后台用）
const router = require('express').Router();
const pool = require('../db');

// 获取单个模块
router.get('/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const [rows] = await pool.query('SELECT * FROM content_modules WHERE module_key = ?', [moduleId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: '模块不存在' });
    }

    const mod = rows[0];
    res.json({
      module_key:       mod.module_key,
      name:             mod.name,
      intro: {
        title:          mod.intro_title || '',
        paragraphs:     mod.intro_paragraphs ? JSON.parse(mod.intro_paragraphs) : [],
      },
      pdfs:             mod.pdfs   ? JSON.parse(mod.pdfs)   : [],
      videos:           mod.videos ? JSON.parse(mod.videos) : [],
    });
  } catch (err) {
    console.error('[content/get]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取全部模块
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM content_modules ORDER BY module_key');
    const result = {};
    rows.forEach(mod => {
      result[mod.module_key] = {
        name:   mod.name,
        intro:  {
          title:      mod.intro_title || '',
          paragraphs: mod.intro_paragraphs ? JSON.parse(mod.intro_paragraphs) : [],
        },
        pdfs:   mod.pdfs   ? JSON.parse(mod.pdfs)   : [],
        videos: mod.videos ? JSON.parse(mod.videos) : [],
      };
    });
    res.json(result);
  } catch (err) {
    console.error('[content/all]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 更新模块内容（管理后台）
router.post('/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { name, intro_title, intro_paragraphs, pdfs, videos } = req.body;

    await pool.query(
      `INSERT INTO content_modules (module_key, name, intro_title, intro_paragraphs, pdfs, videos, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         intro_title = VALUES(intro_title),
         intro_paragraphs = VALUES(intro_paragraphs),
         pdfs = VALUES(pdfs),
         videos = VALUES(videos),
         updated_at = NOW()`,
      [
        moduleId,
        name || '',
        intro_title || '',
        intro_paragraphs ? JSON.stringify(intro_paragraphs) : null,
        pdfs ? JSON.stringify(pdfs) : null,
        videos ? JSON.stringify(videos) : null,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[content/update]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
