const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'campus_trade',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initDatabase() {
    const connection = await pool.getConnection();
    try {
        // 用户表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                nickname VARCHAR(50) DEFAULT '',
                avatar VARCHAR(255) DEFAULT '',
                phone VARCHAR(20) DEFAULT '',
                wechat VARCHAR(50) DEFAULT '',
                school VARCHAR(100) DEFAULT '',
                role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
                is_banned BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // 分类表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                icon VARCHAR(50) DEFAULT '📦',
                sort_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // 商品表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                price DECIMAL(10,2) NOT NULL DEFAULT 0,
                category_id INT,
                status ENUM('on_sale', 'sold', 'off_shelf') DEFAULT 'on_sale',
                images TEXT,
                contact_phone VARCHAR(20) DEFAULT '',
                contact_wechat VARCHAR(50) DEFAULT '',
                view_count INT DEFAULT 0,
                favorite_count INT DEFAULT 0,
                user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
            )
        `);
        // 收藏表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS favorites (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_favorite (user_id, product_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);
        // 商品图片表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS product_images (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                image_url VARCHAR(255) NOT NULL,
                sort_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);
        // 插入预设分类
        const [rows] = await connection.execute('SELECT COUNT(*) as count FROM categories');
        if (rows[0].count === 0) {
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
            for (const cat of categories) {
                await connection.execute('INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)', cat);
            }
        }
        console.log('✅ 数据库表初始化完成');
    } catch (err) {
        console.error('数据库初始化失败:', err);
    } finally {
        connection.release();
    }
}

module.exports = { pool, initDatabase };