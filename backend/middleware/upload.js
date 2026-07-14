const multer = require('multer');
const path = require('path');

// 文件过滤
const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('仅支持图片文件'), false);
    }
};

// 使用内存存储，文件 buffer 直接上传到 Supabase Storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
});

module.exports = upload;