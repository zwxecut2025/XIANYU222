const express = require('express');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const router = express.Router();

router.post('/image', auth, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '请选择图片' });
    }
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3008}`;
    res.json({ success: true, url: `${baseUrl}/uploads/${req.file.filename}` });
});

router.post('/images', auth, upload.array('images', 9), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: '请选择图片' });
    }
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3008}`;
    const urls = req.files.map(file => `${baseUrl}/uploads/${file.filename}`);
    res.json({ success: true, urls });
});

module.exports = router;