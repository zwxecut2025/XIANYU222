const express = require('express');
const auth = require('../middleware/auth');
const { supabase, supabaseAdmin } = require('../config/db');
const router = express.Router();

// GET /api/messages/conversations - 获取会话列表
// 返回与当前用户有过私信的所有用户及最后一条消息
router.get('/conversations', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // 获取我发送或收到的所有消息，按会话分组
        const { data: sent, error: sentErr } = await supabaseAdmin
            .from('messages')
            .select('receiver_id, content, created_at')
            .eq('sender_id', userId)
            .order('created_at', { ascending: false });

        if (sentErr) throw sentErr;

        const { data: received, error: recvErr } = await supabaseAdmin
            .from('messages')
            .select('sender_id, content, created_at')
            .eq('receiver_id', userId)
            .order('created_at', { ascending: false });

        if (recvErr) throw recvErr;

        // 构建每个对话对象的最新消息
        const convMap = new Map();
        for (const msg of [...(sent || []), ...(received || [])]) {
            const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
            const existing = convMap.get(partnerId);
            if (!existing || new Date(msg.created_at) > new Date(existing.created_at)) {
                convMap.set(partnerId, {
                    partner_id: partnerId,
                    last_message: msg.content,
                    last_time: msg.created_at
                });
            }
        }

        // 计算未读数
        const { data: unreadData, error: unreadErr } = await supabaseAdmin
            .from('messages')
            .select('sender_id')
            .eq('receiver_id', userId)
            .eq('is_read', 0);

        if (unreadErr) throw unreadErr;

        const unreadMap = {};
        (unreadData || []).forEach(m => {
            unreadMap[m.sender_id] = (unreadMap[m.sender_id] || 0) + 1;
        });

        // 获取伙伴用户信息
        const conversations = [];
        for (const [partnerId, conv] of convMap) {
            const { data: partner } = await supabaseAdmin
                .from('users')
                .select('id, username, nickname, avatar')
                .eq('id', partnerId)
                .single();

            conversations.push({
                partner: partner ? {
                    id: partner.id,
                    username: partner.username,
                    nickname: partner.nickname || partner.username,
                    avatar: partner.avatar
                } : { id: partnerId, username: '未知用户', nickname: '未知用户', avatar: '' },
                last_message: conv.last_message,
                last_time: conv.last_time,
                unread: unreadMap[partnerId] || 0
            });
        }

        // 按最后消息时间倒序
        conversations.sort((a, b) => new Date(b.last_time) - new Date(a.last_time));

        res.json({ success: true, data: conversations });
    } catch (err) {
        console.error('获取会话列表失败:', err.message);
        res.status(500).json({ error: '获取会话列表失败' });
    }
});

// GET /api/messages/unread-count - 获取未读消息总数
router.get('/unread-count', auth, async (req, res) => {
    try {
        const { count, error } = await supabaseAdmin
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('receiver_id', req.user.id)
            .eq('is_read', 0);

        if (error) throw error;

        res.json({ success: true, count: count || 0 });
    } catch (err) {
        console.error('获取未读数失败:', err.message);
        res.status(500).json({ error: '获取未读数失败' });
    }
});

// GET /api/messages/with/:userId - 获取与某用户的私信记录
router.get('/with/:userId', auth, async (req, res) => {
    try {
        const myId = req.user.id;
        const partnerId = parseInt(req.params.userId);
        const { page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // 获取两人之间的所有消息
        const { data: messages, error, count } = await supabaseAdmin
            .from('messages')
            .select('*', { count: 'exact' })
            .or(`and(sender_id.eq.${myId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${myId})`)
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (error) throw error;

        // 标记对方发来的未读消息为已读
        await supabaseAdmin
            .from('messages')
            .update({ is_read: 1 })
            .eq('sender_id', partnerId)
            .eq('receiver_id', myId)
            .eq('is_read', 0);

        res.json({
            success: true,
            data: (messages || []).reverse(),
            total: count || 0,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (err) {
        console.error('获取私信失败:', err.message);
        res.status(500).json({ error: '获取私信失败' });
    }
});

// POST /api/messages/send - 发送私信
// body: { receiver_id, content }
router.post('/send', auth, async (req, res) => {
    try {
        const { receiver_id, content } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: '消息内容不能为空' });
        }
        if (content.length > 2000) {
            return res.status(400).json({ error: '消息内容不能超过2000字' });
        }
        if (!receiver_id) {
            return res.status(400).json({ error: '请指定接收者' });
        }
        if (parseInt(receiver_id) === req.user.id) {
            return res.status(400).json({ error: '不能给自己发私信' });
        }

        // 检查接收者是否存在
        const { data: receiver, error: recvErr } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('id', receiver_id)
            .single();

        if (recvErr || !receiver) {
            return res.status(404).json({ error: '接收者不存在' });
        }

        const { data: message, error: sendErr } = await supabaseAdmin
            .from('messages')
            .insert({
                sender_id: req.user.id,
                receiver_id: parseInt(receiver_id),
                content: content.trim(),
                is_read: 0
            })
            .select('*')
            .single();

        if (sendErr) throw sendErr;

        res.status(201).json({ success: true, data: message });
    } catch (err) {
        console.error('发送私信失败:', err.message);
        res.status(500).json({ error: '发送失败，请重试' });
    }
});

module.exports = router;
