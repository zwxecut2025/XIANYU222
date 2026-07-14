const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { supabase, initDatabase } = require('./config/db');
const rateLimit = require('express-rate-limit');

const requiredEnvVars = ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('\n❌ 缺少必要的环境变量:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    process.exit(1);
}
console.log('✅ 环境变量检查通过');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const productsRoutes = require('./routes/products');
const categoriesRoutes = require('./routes/categories');
const favoritesRoutes = require('./routes/favorites');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');
const aiRoutes = require('./routes/ai');
const commentsRoutes = require('./routes/comments');
const messagesRoutes = require('./routes/messages');

const app = express();
app.set('trust proxy', 1);

// 静态文件服务（前端页面）
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5500', 'http://localhost:3008', 'https://*.cpolar.cn'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// /uploads 静态文件，404 时返回默认占位图
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));
app.use('/uploads', (req, res, next) => {
    // 静态文件没匹配到，返回默认占位图（data URI SVG）
    const noImageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <rect width="400" height="300" rx="12" fill="#f0f0f0"/>
        <text x="200" y="140" text-anchor="middle" font-size="64">🖼️</text>
        <text x="200" y="200" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#999">图片已丢失</text>
    </svg>`;
    res.set('Content-Type', 'image/svg+xml');
    res.send(noImageSvg);
});

// 初始化数据库
initDatabase().then(() => console.log('数据库初始化完成')).catch(err => console.error('数据库初始化失败', err));

// 限流
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: '登录尝试过多，请15分钟后再试' }
});
// 对 /api/auth/login 单独应用限流
app.use('/api/auth/login', loginLimiter);

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/messages', messagesRoutes);

const PORT = process.env.PORT || 3008;
app.listen(PORT, () => {
    console.log(`🚀 服务器运行在端口 ${PORT}`);
    console.log(`   Supabase: ${process.env.SUPABASE_URL}`);
});

// favicon 占位
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

app.get('/', (req, res) => {
    res.redirect('/pages/index/index.html');
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('正在关闭服务器...');
    process.exit(0);
});
