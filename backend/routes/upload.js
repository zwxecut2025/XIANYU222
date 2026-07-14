const express = require('express');
const path = require('path');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const { supabase } = require('../config/db');
const router = express.Router();

const BUCKET_NAME = 'product-images';

// 确保 Supabase Storage bucket 存在且公开
async function ensureBucket() {
    try {
        const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
        if (listErr) throw listErr;
        const exists = buckets.some(b => b.name === BUCKET_NAME);
        if (!exists) {
            const { error: createErr } = await supabase.storage.createBucket(BUCKET_NAME, { public: true });
            if (createErr) throw createErr;
            console.log('   📦 已创建 Supabase Storage bucket:', BUCKET_NAME);
        }
    } catch (err) {
        console.error('⚠️  Supabase Storage bucket 初始化失败:', err.message);
        console.error('   请在 Supabase → Storage → New Bucket 手动创建名为 "product-images" 的公开桶');
    }
}
ensureBucket();

// 单张图片上传到 Supabase Storage
router.post('/image', auth, upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '请选择图片' });
    }
    try {
        const ext = path.extname(req.file.originalname) || '.png';
        const filename = 'img-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filename, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: true
            });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filename);
        console.log('   📷 图片已上传:', publicUrl);
        res.json({ success: true, url: publicUrl });
    } catch (err) {
        console.error('上传失败:', err.message);
        res.status(500).json({ error: '图片上传失败，请重试' });
    }
});

// 多张图片上传到 Supabase Storage
router.post('/images', auth, upload.array('images', 9), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: '请选择图片' });
    }
    try {
        const urls = [];
        for (const file of req.files) {
            const ext = path.extname(file.originalname) || '.png';
            const filename = 'img-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
            const { error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(filename, file.buffer, {
                    contentType: file.mimetype,
                    upsert: true
                });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filename);
            urls.push(publicUrl);
            console.log('   📷 图片已上传:', publicUrl);
        }
        res.json({ success: true, urls });
    } catch (err) {
        console.error('批量上传失败:', err.message);
        res.status(500).json({ error: '图片上传失败，请重试' });
    }
});

module.exports = router;