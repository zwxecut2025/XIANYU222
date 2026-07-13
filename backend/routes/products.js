const express = require('express');
const { supabase, supabaseAdmin, flattenProduct } = require('../config/db');
const auth = require('../middleware/auth');
const router = express.Router();

// 获取商品列表
router.get('/', async (req, res) => {
    const { category_id, keyword, status, page = 1, limit = 20, sort = 'new' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    try {
        // 构建基础查询
        let query = supabase
            .from('products')
            .select('*, users(username, nickname, avatar), categories(name, icon)', { count: 'exact' })
            .eq('status', status || 'on_sale');

        if (category_id) {
            query = query.eq('category_id', parseInt(category_id));
        }
        if (keyword) {
            query = query.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%`);
        }

        // 排序
        const orderMap = {
            'new': ['created_at', { ascending: false }],
            'price_asc': ['price', { ascending: true }],
            'price_desc': ['price', { ascending: false }],
            'hot': ['view_count', { ascending: false }]
        };
        const [orderCol, orderOpts] = orderMap[sort] || orderMap['new'];

        // 分页
        query = query.order(orderCol, orderOpts).range(from, to);

        const { data, error, count } = await query;

        if (error) throw error;

        const products = (data || []).map(flattenProduct);

        res.json({
            data: products,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limitNum)
            }
        });
    } catch (err) {
        console.error('商品列表查询失败:', err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取用户发布的商品（必须在 /:id 之前，避免 /user/xxx 被 /:id 拦截）
router.get('/user/:userId', async (req, res) => {
    const { status } = req.query;
    try {
        let query = supabase
            .from('products')
            .select('*, users(username, nickname, avatar), categories(name, icon)')
            .eq('user_id', req.params.userId)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) throw error;

        const products = (data || []).map(flattenProduct);

        res.json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取商品详情
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*, users(username, nickname, avatar, phone, wechat), categories(name, icon)')
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: '商品不存在' });
        }

        // 浏览次数 +1
        await supabaseAdmin
            .from('products')
            .update({ view_count: (data.view_count || 0) + 1 })
            .eq('id', req.params.id);

        res.json(flattenProduct(data));
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
        const { data, error } = await supabaseAdmin
            .from('products')
            .insert({
                title,
                description,
                price,
                category_id: category_id || null,
                contact_phone: contact_phone || '',
                contact_wechat: contact_wechat || '',
                images: imagesJson,
                user_id: req.user.id,
                status: 'on_sale'
            })
            .select('id')
            .single();

        if (error) throw error;
        res.json({ success: true, id: data.id, message: '发布成功' });
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
        // 检查权限
        const { data: check } = await supabase
            .from('products')
            .select('user_id')
            .eq('id', req.params.id)
            .single();

        if (!check) {
            return res.status(404).json({ error: '商品不存在' });
        }
        if (check.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: '无权修改此商品' });
        }

        const updateData = {
            title,
            description,
            price,
            category_id: category_id || null,
            contact_phone: contact_phone || '',
            contact_wechat: contact_wechat || '',
            status: status || 'on_sale'
        };
        // 只在有 images 时更新 images
        if (images) {
            updateData.images = JSON.stringify(images);
        }

        const { error } = await supabaseAdmin
            .from('products')
            .update(updateData)
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: '更新成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 删除商品
router.delete('/:id', auth, async (req, res) => {
    try {
        const { data: check } = await supabase
            .from('products')
            .select('user_id')
            .eq('id', req.params.id)
            .single();

        if (!check) {
            return res.status(404).json({ error: '商品不存在' });
        }
        if (check.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: '无权删除此商品' });
        }

        const { error } = await supabaseAdmin
            .from('products')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: '删除成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;
