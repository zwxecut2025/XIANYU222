const express = require('express');
const { supabase } = require('../config/db');
const router = express.Router();

// 获取所有分类
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;
