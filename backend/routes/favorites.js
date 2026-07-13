const express = require('express');
const { supabase, supabaseAdmin } = require('../config/db');
const auth = require('../middleware/auth');
const router = express.Router();

// 获取收藏列表
router.get('/', auth, async (req, res) => {
    try {
        // 先查收藏记录
        const { data: favs, error: favErr } = await supabase
            .from('favorites')
            .select('product_id, products(*, users(username, nickname, avatar))')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (favErr) throw favErr;

        const products = (favs || []).map(f => {
            const p = f.products;
            if (!p) return null;
            return {
                ...p,
                username: p.users?.username,
                nickname: p.users?.nickname,
                avatar: p.users?.avatar,
                images: typeof p.images === 'string' ? (() => { try { return JSON.parse(p.images); } catch { return []; } })() : (p.images || [])
            };
        }).filter(Boolean);

        res.json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 添加收藏
router.post('/:productId', auth, async (req, res) => {
    try {
        const { error } = await supabaseAdmin
            .from('favorites')
            .insert({
                user_id: req.user.id,
                product_id: parseInt(req.params.productId)
            });

        if (error) {
            if (error.code === '23505' || error.message?.includes('unique')) {
                return res.status(400).json({ error: '已收藏' });
            }
            throw error;
        }

        // 更新商品收藏数
        const { data: prod } = await supabase
            .from('products')
            .select('favorite_count')
            .eq('id', req.params.productId)
            .single();

        await supabaseAdmin
            .from('products')
            .update({ favorite_count: (prod?.favorite_count || 0) + 1 })
            .eq('id', req.params.productId);

        res.json({ success: true, message: '收藏成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 取消收藏
router.delete('/:productId', auth, async (req, res) => {
    try {
        const { error } = await supabaseAdmin
            .from('favorites')
            .delete()
            .eq('user_id', req.user.id)
            .eq('product_id', parseInt(req.params.productId));

        if (error) throw error;

        // 更新商品收藏数
        const { data: prod } = await supabase
            .from('products')
            .select('favorite_count')
            .eq('id', req.params.productId)
            .single();

        const newCount = Math.max((prod?.favorite_count || 1) - 1, 0);
        await supabaseAdmin
            .from('products')
            .update({ favorite_count: newCount })
            .eq('id', req.params.productId);

        res.json({ success: true, message: '取消收藏成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 检查是否已收藏
router.get('/check/:productId', auth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('favorites')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('product_id', parseInt(req.params.productId))
            .maybeSingle();

        if (error) throw error;
        res.json({ isFavorite: !!data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;
