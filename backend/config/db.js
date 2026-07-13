const path = require('path');
const fs = require('fs');
require('dotenv').config();

let SQL = null;
let db = null;
const DB_PATH = path.join(__dirname, '..', 'data', 'campus_trade.db');

async function loadSqlJs() {
    if (!SQL) {
        const initSqlJs = require('sql.js');
        SQL = await initSqlJs();
    }
    return SQL;
}

function saveDb() {
    if (db) {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    }
}

// 将MySQL语法转为SQLite兼容语法
function translateSQL(sql) {
    let result = sql;
    result = result.replace(/AUTO_INCREMENT/gi, 'AUTOINCREMENT');
    result = result.replace(/ENUM\s*\([^)]+\)/gi, 'TEXT');
    result = result.replace(/BOOL\b/gi, 'INTEGER');
    result = result.replace(/BOOLEAN\b/gi, 'INTEGER');
    result = result.replace(/ON UPDATE CURRENT_TIMESTAMP/gi, '');
    result = result.replace(/INT AUTOINCREMENT/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    result = result.replace(/ON DUPLICATE KEY/gi, 'ON CONFLICT');
    result = result.replace(/INSERT IGNORE/gi, 'INSERT OR IGNORE');
    result = result.replace(/NOW\(\)/gi, "datetime('now','localtime')");
    result = result.replace(/CURRENT_TIMESTAMP(?!\s*\()/gi, "CURRENT_TIMESTAMP");
    result = result.replace(/GREATEST\s*\(/gi, 'MAX(');
    result = result.replace(/COALESCE\s*\(/gi, 'COALESCE('); // COALESCE is same in both
    return result;
}

// 将MySQL ? 占位符适配sql.js的 $n 格式
function convertParams(sql, params) {
    if (!params || params.length === 0) return { sql, params: [] };
    let idx = 0;
    const newParams = [];
    const newSql = sql.replace(/\?/g, () => {
        const p = params[idx];
        if (p === true) { const v = 1; idx++; newParams.push(v); return '?'; }
        if (p === false) { const v = 0; idx++; newParams.push(v); return '?'; }
        idx++;
        newParams.push(p);
        return '?';
    });
    return { sql: newSql, params: newParams };
}

// 模拟MySQL connection对象
class Connection {
    constructor(sdb) {
        this.sdb = sdb;
    }

    execute(sql, params) {
        try {
            const translated = translateSQL(sql);
            const { sql: finalSql, params: finalParams } = convertParams(translated, params || []);

            if (/^\s*SELECT/i.test(finalSql)) {
                const stmt = this.sdb.prepare(finalSql);
                if (finalParams.length > 0) stmt.bind(finalParams);

                const rows = [];
                while (stmt.step()) {
                    rows.push(stmt.getAsObject());
                }
                stmt.free();
                return Promise.resolve([rows]);
            } else {
                this.sdb.run(finalSql, finalParams);
                const lastIdResult = this.sdb.exec("SELECT last_insert_rowid()");
                const insertId = lastIdResult[0]?.values?.[0]?.[0] || 0;
                const affectedRows = this.sdb.getRowsModified();
                return Promise.resolve([{ insertId, affectedRows }]);
            }
        } catch (err) {
            // SQLite constraint violation → MySQL duplicate entry error
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
                const dupErr = new Error('Duplicate entry');
                dupErr.code = 'ER_DUP_ENTRY';
                return Promise.reject(dupErr);
            }
            return Promise.reject(err);
        }
    }

    release() {
        saveDb();
    }
}

const pool = {
    async getConnection() {
        if (!db) await initDatabase();
        return new Connection(db);
    },

    async query(sql, params) {
        const conn = await this.getConnection();
        try {
            return await conn.execute(sql, params);
        } finally {
            conn.release();
        }
    },

    async execute(sql, params) {
        return this.query(sql, params);
    }
};

async function initDatabase() {
    await loadSqlJs();

    // 尝试从文件加载已有数据库
    if (fs.existsSync(DB_PATH)) {
        try {
            const fileBuffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(fileBuffer);
            console.log('✅ 从已有数据库文件加载');
        } catch (e) {
            console.log('⚠️ 数据库文件损坏，创建新数据库');
            db = new SQL.Database();
        }
    } else {
        db = new SQL.Database();
    }

    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA journal_mode = WAL');

    // 创建表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nickname TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        wechat TEXT DEFAULT '',
        school TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'user',
        is_banned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        icon TEXT DEFAULT '📦',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL DEFAULT 0,
        category_id INTEGER,
        status TEXT DEFAULT 'on_sale',
        images TEXT,
        contact_phone TEXT DEFAULT '',
        contact_wechat TEXT DEFAULT '',
        view_count INTEGER DEFAULT 0,
        favorite_count INTEGER DEFAULT 0,
        user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE(user_id, product_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS product_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )`);

    // 插入预设分类
    const catCount = db.exec("SELECT COUNT(*) as count FROM categories");
    const count = catCount[0]?.values?.[0]?.[0] || 0;
    if (count === 0) {
        const categories = [
            ['📚 教材教辅', '📚', 1],
            ['💻 数码产品', '💻', 2],
            ['📱 手机平板', '📱', 3],
            ['🎮 游戏娱乐', '🎮', 4],
            ['👕 服饰鞋包', '👕', 5],
            ['🚲 出行工具', '🚲', 6],
            ['🏠 生活用品', '🏠', 7],
            ['🎵 音乐乐器', '🎵', 8],
            ['🏸 运动户外', '🏸', 9],
            ['其他', '📦', 10]
        ];
        const stmt = db.prepare('INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)');
        for (const cat of categories) {
            stmt.run(cat);
        }
        stmt.free();
    }

    // 插入测试用户
    const userCount = db.exec("SELECT COUNT(*) as count FROM users");
    const uCount = userCount[0]?.values?.[0]?.[0] || 0;
    if (uCount === 0) {
        const bcrypt = require('bcryptjs');
        const adminHash = bcrypt.hashSync('123456', 10);
        const sellerHash = bcrypt.hashSync('123456', 10);

        db.run("INSERT INTO users (username, password, nickname, role) VALUES (?, ?, ?, ?)",
            ['admin', adminHash, '管理员', 'admin']);
        db.run("INSERT INTO users (username, password, nickname, role) VALUES (?, ?, ?, ?)",
            ['seller1', sellerHash, '卖家小王', 'user']);

        console.log('   📝 测试账号: admin / 123456');
        console.log('   📝 测试账号: seller1 / 123456');
    }

    // 生成占位图SVG data URI
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

    // 插入示例商品
    const productCount = db.exec("SELECT COUNT(*) as count FROM products");
    const pCount = productCount[0]?.values?.[0]?.[0] || 0;
    if (pCount === 0) {
        const demoProducts = [
            { title: '高等数学第七版（上下册）', description: '考研必备教材，八成新，有少量笔记，不影响使用。买就送配套习题全解！', price: 25, category_id: 1, user_id: 2, img: placeholderSVG('#E8A87C', '📚', '教材教辅'), view_count: 156, favorite_count: 12 },
            { title: 'Apple MacBook Air M2 8+256G', description: '去年教育优惠买的，几乎全新，电池循环30次以内。带原装充电器，送内胆包。', price: 5800, category_id: 2, user_id: 2, img: placeholderSVG('#6C8EBF', '💻', '数码产品'), view_count: 423, favorite_count: 35 },
            { title: 'iPhone 13 128G 星光色', description: '自用一年，换新机出了。一直贴膜带壳，屏幕完美，边框轻微使用痕迹。全套包装配件齐全。', price: 2800, category_id: 3, user_id: 2, img: placeholderSVG('#B8A9C9', '📱', '手机平板'), view_count: 289, favorite_count: 18 },
            { title: 'Switch OLED + 塞尔达王国之泪', description: '买来通关了塞尔达就吃灰了，箱说全，Joy-Con无漂移。送三个数字版游戏。', price: 1600, category_id: 4, user_id: 1, img: placeholderSVG('#82B74B', '🎮', '游戏娱乐'), view_count: 512, favorite_count: 47 },
            { title: 'NIKE Air Force 1 小白鞋 42码', description: '双十一冲动消费，只穿过一次发现尺码偏大。正品可提供购买记录，几乎全新。', price: 350, category_id: 5, user_id: 1, img: placeholderSVG('#D4A574', '👕', '服饰鞋包'), view_count: 198, favorite_count: 8 },
            { title: '捷安特ATX 860 山地车', description: '27速禧玛诺变速，前后碟刹，骑行舒适。送车锁和水壶架。校内交易，可现场看车试骑。', price: 1200, category_id: 6, user_id: 2, img: placeholderSVG('#5B9AA0', '🚲', '出行工具'), view_count: 345, favorite_count: 22 },
            { title: '寝室用小冰箱 50L', description: '单门冷藏款，静音省电，功率很小宿舍能用。夏天放饮料水果超爽，毕业出掉。', price: 180, category_id: 7, user_id: 2, img: placeholderSVG('#87CEEB', '🏠', '生活用品'), view_count: 276, favorite_count: 15 },
            { title: '卡西欧PX-S1100电钢琴88键', description: '练琴神器，手感音色都不错。送琴架、踏板和琴罩。因为毕业出，实在带不走了。', price: 2200, category_id: 8, user_id: 1, img: placeholderSVG('#9B59B6', '🎵', '音乐乐器'), view_count: 167, favorite_count: 9 }
        ];

        const insertStmt = db.prepare(
            'INSERT INTO products (title, description, price, category_id, status, images, view_count, favorite_count, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now","localtime"))'
        );

        for (const p of demoProducts) {
            insertStmt.run([p.title, p.description, p.price, p.category_id, 'on_sale', JSON.stringify([p.img]), p.view_count, p.favorite_count, p.user_id]);
        }
        insertStmt.free();
        console.log(`   🛒 已插入 ${demoProducts.length} 条示例商品`);
    }

    saveDb();
    console.log('✅ 数据库初始化完成（SQLite）');
    console.log('   📁 数据库文件:', DB_PATH);
}

process.on('exit', () => saveDb());
process.on('SIGINT', () => { saveDb(); process.exit(0); });

module.exports = { pool, initDatabase };
