const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middleware/auth');
const router = express.Router();

// 获取当前用户信息
router.get('/me', auth, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT id, username, nickname, avatar, phone, wechat, school, role, created_at FROM users WHERE id = ?',
            [req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 更新用户信息
router.put('/me', auth, async (req, res) => {
    const { nickname, phone, wechat, school } = req.body;
    try {
        await pool.execute(
            'UPDATE users SET nickname = ?, phone = ?, wechat = ?, school = ? WHERE id = ?',
            [nickname || '', phone || '', wechat || '', school || '', req.user.id]
        );
        res.json({ success: true, message: '更新成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取用户公开信息
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT id, username, nickname, avatar, school, created_at FROM users WHERE id = ?',
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;