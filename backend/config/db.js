const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('\n❌ 请在 .env 中配置 SUPABASE_URL 和 SUPABASE_ANON_KEY');
    process.exit(1);
}

// 判断是否有真正的 service_role key
const isRealServiceKey =
    supabaseServiceKey &&
    supabaseServiceKey !== supabaseAnonKey &&
    !String(supabaseServiceKey).startsWith('sb_publishable_');

// 后端统一用 service_role key，绕过 RLS 策略
// 如果有真正的 service key 就用它，否则降级用 anon key
const supabase = isRealServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : createClient(supabaseUrl, supabaseAnonKey);

// supabaseAdmin 等同于 supabase（向后兼容）
const supabaseAdmin = supabase;

if (!isRealServiceKey) {
    console.warn('⚠️  未配置有效的 SUPABASE_SERVICE_KEY，读写操作可能受 RLS 限制');
    console.warn('   请在 Supabase → Settings → API → service_role → Reveal 获取');
}

// ---------- 初始化数据库（种子数据） ----------

async function initDatabase() {
    console.log('🔗 正在连接 Supabase（REST API）...');

    // 检查表是否存在
    const { error: checkErr } = await supabase.from('users').select('id').limit(1);
    if (checkErr) {
        console.error('❌ 无法访问数据库，请先在 Supabase SQL Editor 中执行 init.sql');
        console.error('   错误:', checkErr.message);
        throw checkErr;
    }

    // 插入预设分类
    const { data: existingCats } = await supabase.from('categories').select('id').limit(1);
    if (!existingCats || existingCats.length === 0) {
        const categories = [
            { name: '教材教辅', icon: '📚', sort_order: 1 },
            { name: '数码产品', icon: '💻', sort_order: 2 },
            { name: '手机平板', icon: '📱', sort_order: 3 },
            { name: '游戏娱乐', icon: '🎮', sort_order: 4 },
            { name: '服饰鞋包', icon: '👕', sort_order: 5 },
            { name: '出行工具', icon: '🚲', sort_order: 6 },
            { name: '生活用品', icon: '🏠', sort_order: 7 },
            { name: '音乐乐器', icon: '🎵', sort_order: 8 },
            { name: '运动户外', icon: '🏸', sort_order: 9 },
            { name: '其他', icon: '📦', sort_order: 10 }
        ];
        const { error: catErr } = await supabaseAdmin.from('categories').insert(categories);
        if (catErr) {
            console.warn('   ⚠️  分类写入失败 ('.concat(catErr.message, ')，请在 SQL Editor 中执行 init.sql'));
        } else {
            console.log('   📂 已插入 10 个分类');
        }
    }

    // 插入测试用户
    const { data: existingUsers } = await supabase.from('users').select('id').limit(1);
    if (!existingUsers || existingUsers.length === 0) {
        const adminHash = bcrypt.hashSync('123456', 10);
        const sellerHash = bcrypt.hashSync('123456', 10);
        const { error: userErr } = await supabaseAdmin.from('users').insert([
            { username: 'admin', password: adminHash, nickname: '管理员', role: 'admin' },
            { username: 'seller1', password: sellerHash, nickname: '卖家小王', role: 'user' }
        ]);
        if (userErr) {
            console.warn('   ⚠️  用户写入失败 ('.concat(userErr.message, ')，请在 SQL Editor 中执行 init.sql'));
        } else {
            console.log('   👤 测试账号: admin / 123456');
            console.log('   👤 测试账号: seller1 / 123456');
        }
    }

    // 插入示例商品
    const { data: existingProducts } = await supabase.from('products').select('id').limit(1);
    if (!existingProducts || existingProducts.length === 0) {
        function placeholderSVG(color, icon, label) {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
                <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:${color};stop-opacity:0.85"/>
                    <stop offset="100%" style="stop-color:${color};stop-opacity:0.55"/>
                </linearGradient></defs>
                <rect width="400" height="300" rx="16" fill="url(#g)"/>
                <text x="200" y="130" text-anchor="middle" font-size="72">${icon}</text>
                <text x="200" y="210" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#fff" font-weight="bold">${label}</text>
            </svg>`;
            return 'data:image/svg+xml,' + encodeURIComponent(svg);
        }

        const demoProducts = [
            { title: '高等数学第七版（上下册）', description: '考研必备教材，八成新，有少量笔记，不影响使用。买就送配套习题全解！', price: 25, category_id: 1, user_id: 2, images: JSON.stringify([placeholderSVG('#E8A87C', '📚', '教材教辅')]), view_count: 156, favorite_count: 12 },
            { title: 'Apple MacBook Air M2 8+256G', description: '去年教育优惠买的，几乎全新，电池循环30次以内。带原装充电器，送内胆包。', price: 5800, category_id: 2, user_id: 2, images: JSON.stringify([placeholderSVG('#6C8EBF', '💻', '数码产品')]), view_count: 423, favorite_count: 35 },
            { title: 'iPhone 13 128G 星光色', description: '自用一年，换新机出了。一直贴膜带壳，屏幕完美，边框轻微使用痕迹。全套包装配件齐全。', price: 2800, category_id: 3, user_id: 2, images: JSON.stringify([placeholderSVG('#B8A9C9', '📱', '手机平板')]), view_count: 289, favorite_count: 18 },
            { title: 'Switch OLED + 塞尔达王国之泪', description: '买来通关了塞尔达就吃灰了，箱说全，Joy-Con无漂移。送三个数字版游戏。', price: 1600, category_id: 4, user_id: 1, images: JSON.stringify([placeholderSVG('#82B74B', '🎮', '游戏娱乐')]), view_count: 512, favorite_count: 47 },
            { title: 'NIKE Air Force 1 小白鞋 42码', description: '双十一冲动消费，只穿过一次发现尺码偏大。正品可提供购买记录，几乎全新。', price: 350, category_id: 5, user_id: 1, images: JSON.stringify([placeholderSVG('#D4A574', '👕', '服饰鞋包')]), view_count: 198, favorite_count: 8 },
            { title: '捷安特ATX 860 山地车', description: '27速禧玛诺变速，前后碟刹，骑行舒适。送车锁和水壶架。校内交易，可现场看车试骑。', price: 1200, category_id: 6, user_id: 2, images: JSON.stringify([placeholderSVG('#5B9AA0', '🚲', '出行工具')]), view_count: 345, favorite_count: 22 },
            { title: '寝室用小冰箱 50L', description: '单门冷藏款，静音省电，功率很小宿舍能用。夏天放饮料水果超爽，毕业出掉。', price: 180, category_id: 7, user_id: 2, images: JSON.stringify([placeholderSVG('#87CEEB', '🏠', '生活用品')]), view_count: 276, favorite_count: 15 },
            { title: '卡西欧PX-S1100电钢琴88键', description: '练琴神器，手感音色都不错。送琴架、踏板和琴罩。因为毕业出，实在带不走了。', price: 2200, category_id: 8, user_id: 1, images: JSON.stringify([placeholderSVG('#9B59B6', '🎵', '音乐乐器')]), view_count: 167, favorite_count: 9 }
        ];

        let productFailCount = 0;
        for (const p of demoProducts) {
            const { error: prodErr } = await supabaseAdmin.from('products').insert({
                title: p.title,
                description: p.description,
                price: p.price,
                category_id: p.category_id,
                status: 'on_sale',
                images: p.images,
                view_count: p.view_count,
                favorite_count: p.favorite_count,
                user_id: p.user_id
            });
            if (prodErr) productFailCount++;
        }
        if (productFailCount > 0) {
            console.warn('   ⚠️  '.concat(productFailCount, ' 条商品写入失败，请在 SQL Editor 中执行 init.sql'));
        } else {
            console.log('   🛒 已插入 '.concat(demoProducts.length, ' 条示例商品'));
        }
    }

    // 创建评论和私信表（如果不存在）
    await ensureTables();

    console.log('✅ 数据库初始化完成（Supabase REST API）');

    // 检查并创建评论表和私信表
    await ensureTables();
}

// ---------- 自动建表（评论 & 私信） ----------
async function ensureTables() {
    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
        // 没有直连数据库的配置，尝试通过 REST API 检查
        const { error: cErr } = await supabase.from('comments').select('id').limit(1);
        if (cErr) {
            console.warn('⚠️  comments/messages 表未创建，评论和私信功能将不可用');
            console.warn('   请在 Supabase SQL Editor 中执行 init.sql，或配置 DATABASE_URL 环境变量');
        }
        return;
    }

    try {
        const pool = new Pool({
            connectionString: DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_comments_product ON comments(product_id);
            CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
            ALTER TABLE comments DISABLE ROW LEVEL SECURITY;

            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_messages_users ON messages(sender_id, receiver_id);
            CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, is_read);
            ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
        `);
        console.log('   📋 comments / messages 表已就绪');
        await pool.end();
    } catch (err) {
        console.warn('⚠️  自动建表失败:', err.message);
        console.warn('   请在 Supabase SQL Editor 中执行 init.sql');
    }
}

// 图片路径标准化：
// - data: URI → 直接返回
// - Supabase Storage 完整 URL（https://...supabase.co/...） → 直接返回
// - 本地 /uploads/ 路径 → 检查文件是否存在，不存在则过滤掉
const path = require('path');
const fs = require('fs');

function getUploadsDir() {
    return path.join(__dirname, '..', 'uploads');
}

function normalizeImages(imagesJson) {
    const images = imagesJson ? (typeof imagesJson === 'string' ? (() => { try { return JSON.parse(imagesJson); } catch { return []; } })() : imagesJson) : [];
    const uploadsDir = getUploadsDir();
    return images.map(img => {
        if (!img || img.startsWith('data:')) return img;      // data URI（SVG占位图）
        // Supabase Storage 完整 URL，直接保留
        if (img.startsWith('http://') || img.startsWith('https://')) return img;
        // 本地 /uploads/ 相对路径，检查文件是否存在
        if (img.startsWith('/')) {
            const filename = img.replace('/uploads/', '');
            const filePath = path.join(uploadsDir, filename);
            if (!fs.existsSync(filePath)) {
                console.warn('[normalizeImages] 文件不存在，已过滤:', filename);
                return null;
            }
            return img;
        }
        return img;
    }).filter(img => img !== null);  // 移除不存在的文件
}

// 工具函数：展平 supabase 关系查询结果
function flattenProduct(p) {
    const images = normalizeImages(p.images);
    return {
        ...p,
        username: p.users?.username,
        nickname: p.users?.nickname,
        avatar: p.users?.avatar,
        user_phone: p.users?.phone,
        user_wechat: p.users?.wechat,
        category_name: p.categories?.name,
        category_icon: p.categories?.icon,
        images,
        cover: images.length > 0 ? images[0] : null
    };
}

// 通过 Supabase 管理 API 执行建表 SQL
async function ensureTables() {
    // 先检查表是否已存在
    const { error: checkErr } = await supabase.from('comments').select('id').limit(1);
    if (!checkErr) return; // 表已存在

    // 表不存在，给出清晰指引
    const sql = `
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_product ON comments(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, is_read);
`;
    const dashboardUrl = 'https://supabase.com/dashboard/project/qqmjustfvwpybwpuxboo/sql/new';
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  ⚠️  需要初始化评论和私信功能                          ║');
    console.log('║                                                      ║');
    console.log('║  1. 打开 Supabase 控制台：                            ║');
    console.log('║     ' + dashboardUrl);
    console.log('║                                                      ║');
    console.log('║  2. 粘贴以下 SQL 并执行：                              ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    sql.trim().split('\n').forEach(line => {
        console.log('║  ' + line);
    });
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
}

module.exports = { supabase, supabaseAdmin, initDatabase, flattenProduct };
