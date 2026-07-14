const express = require('express');
const auth = require('../middleware/auth');
const { supabase, supabaseAdmin } = require('../config/db');
const router = express.Router();

// GET /api/comments/:productId - 获取商品的所有评论（含楼中楼回复）
// 返回树形结构：一级评论包含 replies 数组
router.get('/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // 获取一级评论（parent_id IS NULL）
        const { data: rootComments, error: rootErr, count } = await supabaseAdmin
            .from('comments')
            .select('*, users:user_id(id, username, nickname, avatar)', { count: 'exact' })
            .eq('product_id', productId)
            .is('parent_id', null)
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (rootErr) throw rootErr;

        // 获取所有回复（parent_id IS NOT NULL）
        const { data: allReplies, error: replyErr } = await supabaseAdmin
            .from('comments')
            .select('*, users:user_id(id, username, nickname, avatar)')
            .eq('product_id', productId)
            .not('parent_id', 'is', null)
            .order('created_at', { ascending: true });

        if (replyErr) throw replyErr;

        // 构建回复映射
        const repliesMap = {};
        if (allReplies) {
            allReplies.forEach(reply => {
                const parentId = reply.parent_id;
                if (!repliesMap[parentId]) repliesMap[parentId] = [];
                repliesMap[parentId].push({
                    id: reply.id,
                    content: reply.content,
                    created_at: reply.created_at,
                    user_id: reply.user_id,
                    username: reply.users?.username,
                    nickname: reply.users?.nickname,
                    avatar: reply.users?.avatar,
                    parent_id: reply.parent_id
                });
            });
        }

        // 组装树形结构
        const comments = (rootComments || []).map(c => ({
            id: c.id,
            content: c.content,
            created_at: c.created_at,
            user_id: c.user_id,
            username: c.users?.username,
            nickname: c.users?.nickname,
            avatar: c.users?.avatar,
            replies: repliesMap[c.id] || []
        }));

        res.json({
            success: true,
            data: comments,
            total: count || 0,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (err) {
        console.error('获取评论失败:', err.message);
        res.status(500).json({ error: '获取评论失败' });
    }
});

// POST /api/comments/:productId - 发表评论/回复
// body: { content, parent_id? } - parent_id 为空则为一级评论，否则为回复
router.post('/:productId', auth, async (req, res) => {
    try {
        const { productId } = req.params;
        const { content, parent_id } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: '评论内容不能为空' });
        }
        if (content.length > 1000) {
            return res.status(400).json({ error: '评论内容不能超过1000字' });
        }

        // 如果 parent_id 存在，验证父评论存在且属于同一商品
        if (parent_id) {
            const { data: parent, error: parentErr } = await supabaseAdmin
                .from('comments')
                .select('id, product_id')
                .eq('id', parent_id)
                .single();

            if (parentErr || !parent) {
                return res.status(404).json({ error: '被回复的评论不存在' });
            }
            if (parent.product_id !== parseInt(productId)) {
                return res.status(400).json({ error: '回复的评论不属于该商品' });
            }
        }

        // 检查商品是否存在
        const { data: product, error: prodErr } = await supabaseAdmin
            .from('products')
            .select('id')
            .eq('id', productId)
            .single();

        if (prodErr || !product) {
            return res.status(404).json({ error: '商品不存在' });
        }

        const { data: comment, error: insertErr } = await supabaseAdmin
            .from('comments')
            .insert({
                product_id: parseInt(productId),
                user_id: req.user.id,
                parent_id: parent_id ? parseInt(parent_id) : null,
                content: content.trim()
            })
            .select('*, users:user_id(id, username, nickname, avatar)')
            .single();

        if (insertErr) throw insertErr;

        res.status(201).json({
            success: true,
            data: {
                id: comment.id,
                content: comment.content,
                created_at: comment.created_at,
                user_id: comment.user_id,
                username: comment.users?.username,
                nickname: comment.users?.nickname,
                avatar: comment.users?.avatar,
                parent_id: comment.parent_id
            }
        });
    } catch (err) {
        console.error('发表评论失败:', err.message);
        res.status(500).json({ error: '评论失败，请重试' });
    }
});

// DELETE /api/comments/:id - 删除评论（仅本人或管理员）
router.delete('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: comment, error: findErr } = await supabaseAdmin
            .from('comments')
            .select('id, user_id')
            .eq('id', id)
            .single();

        if (findErr || !comment) {
            return res.status(404).json({ error: '评论不存在' });
        }

        // 仅评论者本人或管理员可删除
        const { data: currentUser } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', req.user.id)
            .single();

        if (comment.user_id !== req.user.id && currentUser?.role !== 'admin') {
            return res.status(403).json({ error: '无权删除此评论' });
        }

        const { error: delErr } = await supabaseAdmin
            .from('comments')
            .delete()
            .eq('id', id);

        if (delErr) throw delErr;

        res.json({ success: true, message: '评论已删除' });
    } catch (err) {
        console.error('删除评论失败:', err.message);
        res.status(500).json({ error: '删除失败' });
    }
});

module.exports = router;
