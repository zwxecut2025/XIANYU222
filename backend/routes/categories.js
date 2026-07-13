const express = require('express');
const { pool } = require('../config/db');
const router = express.Router();

// 获取所有分类
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM categories ORDER BY sort_order ASC'
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;