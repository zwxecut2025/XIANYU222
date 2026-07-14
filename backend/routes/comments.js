const express = require('express');
const auth = require('../middleware/auth');
const { supabase } = require('../config/db');
const router = express.Router();

// 获取某商品的评论列表（含用户昵称）
router.get('/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const { data, error } = await supabase
            .from('comments')
            .select('id, content, created_at, user_id, users ( username, nickname, avatar )')
            .eq('product_id', productId)
            .order('created_at', { ascending: false });

        if (error) {
            if (error.message && error.message.includes('does not exist')) {
                return res.json({ data: [] });
            }
            throw error;
        }

        const comments = (data || []).map(c => ({
            id: c.id,
            content: c.content,
            created_at: c.created_at,
            user_id: c.user_id,
            username: c.users?.username,
            nickname: c.users?.nickname,
            avatar: c.users?.avatar
        }));

        res.json({ data: comments });
    } catch (err) {
        console.error('获取评论失败:', err.message);
        res.status(500).json({ error: '获取评论失败' });
    }
});

// 发表评论（需登录）
router.post('/', auth, async (req, res) => {
    try {
        const { product_id, content } = req.body;
        if (!product_id || !content || !content.trim()) {
            return res.status(400).json({ error: '请填写评论内容' });
        }

        const { data, error } = await supabase
            .from('comments')
            .insert({
                product_id,
                user_id: req.user.id,
                content: content.trim()
            })
            .select('id, content, created_at')
            .single();

        if (error) {
            if (error.message && error.message.includes('does not exist')) {
                return res.status(503).json({ error: '评论功能未初始化，请在 Supabase SQL Editor 中执行 init.sql' });
            }
            throw error;
        }

        res.json({
            success: true,
            comment: {
                id: data.id,
                content: data.content,
                created_at: data.created_at,
                user_id: req.user.id,
                username: req.user.username,
                nickname: req.user.nickname || req.user.username
            }
        });
    } catch (err) {
        console.error('发表评论失败:', err.message);
        res.status(500).json({ error: '评论发表失败' });
    }
});

// 删除评论（仅评论发布者可删）
router.delete('/:id', auth, async (req, res) => {
    try {
        const { data: comment, error: findErr } = await supabase
            .from('comments')
            .select('user_id')
            .eq('id', req.params.id)
            .single();

        if (findErr || !comment) {
            return res.status(404).json({ error: '评论不存在' });
        }
        if (comment.user_id !== req.user.id) {
            return res.status(403).json({ error: '无权删除此评论' });
        }

        const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('删除评论失败:', err.message);
        res.status(500).json({ error: '删除失败' });
    }
});

module.exports = router;
