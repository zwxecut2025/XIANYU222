const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase, supabaseAdmin } = require('../config/db');
require('dotenv').config();
const router = express.Router();

// 注册
router.post('/register', async (req, res) => {
    const { username, password, nickname, phone, wechat, school } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return res.status(400).json({ error: '用户名只能包含字母、数字、下划线，长度3-20位' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { error } = await supabaseAdmin.from('users').insert({
            username,
            password: hashedPassword,
            nickname: nickname || username,
            phone: phone || '',
            wechat: wechat || '',
            school: school || ''
        });
        if (error) {
            if (error.code === '23505' || error.message?.includes('unique')) {
                return res.status(400).json({ error: '用户名已存在' });
            }
            throw error;
        }
        res.json({ success: true, message: '注册成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 登录
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username);

        if (error || !users || users.length === 0) {
            return res.status(401).json({ error: '用户不存在或密码错误' });
        }
        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ error: '用户不存在或密码错误' });
        }
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                nickname: user.nickname,
                avatar: user.avatar,
                phone: user.phone,
                wechat: user.wechat,
                school: user.school,
                role: user.role
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;
