const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middleware/auth');
const router = express.Router();

// 获取商品列表
router.get('/', async (req, res) => {
    const { category_id, keyword, status, page = 1, limit = 20, sort = 'new' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    let sql = `
        SELECT p.*, u.username, u.nickname, u.avatar,
               c.name as category_name, c.icon as category_icon
        FROM products p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.status = 'on_sale'
    `;
    const params = [];

    if (category_id) {
        sql += ' AND p.category_id = ?';
        params.push(category_id);
    }
    if (keyword) {
        sql += ' AND (p.title LIKE ? OR p.description LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (status) {
        sql += ' AND p.status = ?';
        params.push(status);
    }

    // 排序
    if (sort === 'new') {
        sql += ' ORDER BY p.created_at DESC';
    } else if (sort === 'price_asc') {
        sql += ' ORDER BY p.price ASC';
    } else if (sort === 'price_desc') {
        sql += ' ORDER BY p.price DESC';
    } else if (sort === 'hot') {
        sql += ' ORDER BY p.view_count DESC';
    }

    // 获取总数 - 使用 query
    let countSql = 'SELECT COUNT(*) as total FROM products p WHERE p.status = "on_sale"';
    const countParams = [];

    if (category_id) {
        countSql += ' AND p.category_id = ?';
        countParams.push(category_id);
    }
    if (keyword) {
        countSql += ' AND (p.title LIKE ? OR p.description LIKE ?)';
        countParams.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (status) {
        countSql += ' AND p.status = ?';
        countParams.push(status);
    }

    const [countResult] = await pool.query(countSql, countParams);
    const total = countResult[0]?.total || 0;

    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const [rows] = await pool.query(sql, params);

    const products = rows.map(p => {
        const images = p.images ? JSON.parse(p.images) : [];
        return {
            ...p,
            images,
            cover: images.length > 0 ? images[0] : null
        };
    });

    res.json({
        data: products,
        pagination: {
            page: parseInt(page),
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
        }
    });
});

// 获取商品详情
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT p.*, u.username, u.nickname, u.avatar, u.phone as user_phone, u.wechat as user_wechat,
                    c.name as category_name, c.icon as category_icon
             FROM products p
             LEFT JOIN users u ON p.user_id = u.id
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id = ?`,
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: '商品不存在' });
        }
        const product = rows[0];
        product.images = product.images ? JSON.parse(product.images) : [];

        await pool.query('UPDATE products SET view_count = view_count + 1 WHERE id = ?', [req.params.id]);

        res.json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 发布商品
router.post('/', auth, async (req, res) => {
    const { title, description, price, category_id, contact_phone, contact_wechat, images } = req.body;
    if (!title || !price) {
        return res.status(400).json({ error: '标题和价格不能为空' });
    }
    try {
        const imagesJson = JSON.stringify(images || []);
        const [result] = await pool.query(
            `INSERT INTO products (title, description, price, category_id, contact_phone, contact_wechat, images, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, description, price, category_id || null, contact_phone || '', contact_wechat || '', imagesJson, req.user.id]
        );
        res.json({ success: true, id: result.insertId, message: '发布成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 编辑商品
router.put('/:id', auth, async (req, res) => {
    const { title, description, price, category_id, contact_phone, contact_wechat, images, status } = req.body;
    if (!title || !price) {
        return res.status(400).json({ error: '标题和价格不能为空' });
    }
    try {
        const [check] = await pool.query('SELECT user_id FROM products WHERE id = ?', [req.params.id]);
        if (check.length === 0) {
            return res.status(404).json({ error: '商品不存在' });
        }
        if (check[0].user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: '无权修改此商品' });
        }

        const imagesJson = images ? JSON.stringify(images) : null;
        await pool.query(
            `UPDATE products SET
                title = ?, description = ?, price = ?, category_id = ?,
                contact_phone = ?, contact_wechat = ?, images = COALESCE(?, images), status = ?
             WHERE id = ?`,
            [title, description, price, category_id || null, contact_phone || '', contact_wechat || '', imagesJson, status || 'on_sale', req.params.id]
        );
        res.json({ success: true, message: '更新成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 删除商品
router.delete('/:id', auth, async (req, res) => {
    try {
        const [check] = await pool.query('SELECT user_id FROM products WHERE id = ?', [req.params.id]);
        if (check.length === 0) {
            return res.status(404).json({ error: '商品不存在' });
        }
        if (check[0].user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: '无权删除此商品' });
        }
        await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: '删除成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取用户发布的商品
router.get('/user/:userId', async (req, res) => {
    const { status } = req.query;
    let sql = 'SELECT * FROM products WHERE user_id = ?';
    const params = [req.params.userId];
    if (status) {
        sql += ' AND status = ?';
        params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    try {
        const [rows] = await pool.query(sql, params);
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

module.exports = router;