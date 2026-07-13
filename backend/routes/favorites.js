const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middleware/auth');
const router = express.Router();

// 获取收藏列表
router.get('/', auth, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT p.*, u.username, u.nickname, u.avatar
             FROM favorites f
             JOIN products p ON f.product_id = p.id
             JOIN users u ON p.user_id = u.id
             WHERE f.user_id = ?
             ORDER BY f.created_at DESC`,
            [req.user.id]
        );
        const products = rows.map(p => ({
            ...p,
            images: p.images ? JSON.parse(p.images) : []
        }));
        res.json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 添加收藏
router.post('/:productId', auth, async (req, res) => {
    try {
        await pool.execute(
            'INSERT INTO favorites (user_id, product_id) VALUES (?, ?)',
            [req.user.id, req.params.productId]
        );
        await pool.execute('UPDATE products SET favorite_count = favorite_count + 1 WHERE id = ?', [req.params.productId]);
        res.json({ success: true, message: '收藏成功' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '已收藏' });
        }
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 取消收藏
router.delete('/:productId', auth, async (req, res) => {
    try {
        await pool.execute(
            'DELETE FROM favorites WHERE user_id = ? AND product_id = ?',
            [req.user.id, req.params.productId]
        );
        await pool.execute('UPDATE products SET favorite_count = GREATEST(favorite_count - 1, 0) WHERE id = ?', [req.params.productId]);
        res.json({ success: true, message: '取消收藏成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 检查是否已收藏
router.get('/check/:productId', auth, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT 1 FROM favorites WHERE user_id = ? AND product_id = ?',
            [req.user.id, req.params.productId]
        );
        res.json({ isFavorite: rows.length > 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;