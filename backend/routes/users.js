const express = require('express');
const { supabase, supabaseAdmin } = require('../config/db');
const auth = require('../middleware/auth');
const router = express.Router();

// 获取当前用户信息
router.get('/me', auth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, username, nickname, avatar, phone, wechat, school, role, created_at')
            .eq('id', req.user.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: '用户不存在' });
        }
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 更新用户信息
router.put('/me', auth, async (req, res) => {
    const { nickname, phone, wechat, school } = req.body;
    try {
        const { error } = await supabaseAdmin
            .from('users')
            .update({
                nickname: nickname || '',
                phone: phone || '',
                wechat: wechat || '',
                school: school || ''
            })
            .eq('id', req.user.id);

        if (error) throw error;
        res.json({ success: true, message: '更新成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取用户公开信息
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, username, nickname, avatar, school, created_at')
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: '用户不存在' });
        }
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;
