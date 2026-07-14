const express = require('express');
const auth = require('../middleware/auth');
const { supabase } = require('../config/db');
const router = express.Router();

const TABLE_ERR = '私信功能未初始化，请在 Supabase SQL Editor 中执行 init.sql';

// 发送私信
router.post('/', auth, async (req, res) => {
    try {
        const { receiver_id, product_id, content } = req.body;
        if (!receiver_id || !content || !content.trim()) {
            return res.status(400).json({ error: '请填写消息内容' });
        }

        const { data, error } = await supabase
            .from('messages')
            .insert({
                sender_id: req.user.id,
                receiver_id,
                product_id: product_id || null,
                content: content.trim()
            })
            .select('id, content, created_at')
            .single();

        if (error) {
            if (error.message && error.message.includes('does not exist')) {
                return res.status(503).json({ error: TABLE_ERR });
            }
            throw error;
        }

        res.json({
            success: true,
            message: {
                id: data.id,
                content: data.content,
                created_at: data.created_at,
                sender_id: req.user.id,
                receiver_id
            }
        });
    } catch (err) {
        console.error('发送私信失败:', err.message);
        res.status(500).json({ error: '发送失败' });
    }
});

// 获取对话列表（每个对话显示最新一条消息）
router.get('/conversations', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // 我发出的消息
        const { data: sent, error: err1 } = await supabase
            .from('messages')
            .select('id, content, created_at, is_read, sender_id, receiver_id, product_id, receiver:receiver_id ( username, nickname, avatar ), products ( title )')
            .eq('sender_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (err1) {
            if (err1.message && err1.message.includes('does not exist')) {
                return res.status(503).json({ error: TABLE_ERR });
            }
            throw err1;
        }

        // 我收到的消息
        const { data: received, error: err2 } = await supabase
            .from('messages')
            .select('id, content, created_at, is_read, sender_id, receiver_id, product_id, sender:sender_id ( username, nickname, avatar ), products ( title )')
            .eq('receiver_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (err2) throw err2;

        // 按对话对象合并
        const convMap = {};

        (sent || []).forEach(m => {
            const peerId = m.receiver_id;
            if (!convMap[peerId] || new Date(m.created_at) > new Date(convMap[peerId].created_at)) {
                convMap[peerId] = {
                    peer_id: peerId,
                    peer_name: m.receiver?.nickname || m.receiver?.username || '用户' + peerId,
                    peer_avatar: m.receiver?.avatar || '',
                    product_id: m.product_id,
                    product_title: m.products?.title || '',
                    last_message: m.content,
                    created_at: m.created_at,
                    is_read: m.is_read,
                    direction: 'sent'
                };
            }
        });

        (received || []).forEach(m => {
            const peerId = m.sender_id;
            if (!convMap[peerId] || new Date(m.created_at) > new Date(convMap[peerId].created_at)) {
                convMap[peerId] = {
                    peer_id: peerId,
                    peer_name: m.sender?.nickname || m.sender?.username || '用户' + peerId,
                    peer_avatar: m.sender?.avatar || '',
                    product_id: m.product_id,
                    product_title: m.products?.title || '',
                    last_message: m.content,
                    created_at: m.created_at,
                    is_read: m.is_read,
                    direction: 'received',
                    has_unread: !m.is_read
                };
            }
        });

        // 统计未读数
        const conversations = Object.values(convMap).map(c => {
            const unreadCount = (received || []).filter(
                m => m.sender_id === c.peer_id && !m.is_read
            ).length;
            return { ...c, unread_count: unreadCount };
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json({ data: conversations });
    } catch (err) {
        console.error('获取对话列表失败:', err.message);
        res.status(500).json({ error: '获取对话列表失败' });
    }
});

// 获取与某个用户的完整对话记录
router.get('/:userId', auth, async (req, res) => {
    try {
        const peerId = parseInt(req.params.userId);
        const myId = req.user.id;

        const query = supabase
            .from('messages')
            .select('id, content, created_at, is_read, sender_id, receiver_id')
            .or(`and(sender_id.eq.${myId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${myId})`)
            .order('created_at', { ascending: true })
            .limit(200);

        const { data, error } = await query;

        if (error) {
            if (error.message && error.message.includes('does not exist')) {
                return res.status(503).json({ error: TABLE_ERR });
            }
            throw error;
        }

        res.json({ data: data || [] });
    } catch (err) {
        console.error('获取对话记录失败:', err.message);
        res.status(500).json({ error: '获取对话记录失败' });
    }
});

// 标记来自某用户的消息为已读
router.put('/read/:userId', auth, async (req, res) => {
    try {
        const peerId = parseInt(req.params.userId);
        const myId = req.user.id;

        const { error } = await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('sender_id', peerId)
            .eq('receiver_id', myId)
            .eq('is_read', false);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('标记已读失败:', err.message);
        res.status(500).json({ error: '操作失败' });
    }
});

module.exports = router;
