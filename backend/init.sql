-- 复制以下全部内容，粘贴到 Supabase SQL Editor 中执行
-- 路径：https://supabase.com/dashboard/project/qqmjustfvwpybwpuxboo → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nickname TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    wechat TEXT DEFAULT '',
    school TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    is_banned INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    icon TEXT DEFAULT '📦',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL DEFAULT 0,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'on_sale',
    images TEXT,
    contact_phone TEXT DEFAULT '',
    contact_wechat TEXT DEFAULT '',
    view_count INTEGER DEFAULT 0,
    favorite_count INTEGER DEFAULT 0,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

-- 禁用 RLS（校园交易平台无需严格行级安全，简化权限管理）
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'products_updated_at') THEN
        CREATE TRIGGER products_updated_at
            BEFORE UPDATE ON products
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

-- ========== 种子数据 ==========

-- 插入分类标签（你看到的标签页）
INSERT INTO categories (name, icon, sort_order) VALUES
    ('教材教辅', '📚', 1),
    ('数码产品', '💻', 2),
    ('手机平板', '📱', 3),
    ('游戏娱乐', '🎮', 4),
    ('服饰鞋包', '👕', 5),
    ('出行工具', '🚲', 6),
    ('生活用品', '🏠', 7),
    ('音乐乐器', '🎵', 8),
    ('运动户外', '🏸', 9),
    ('其他', '📦', 10)
ON CONFLICT (name) DO UPDATE SET icon = EXCLUDED.icon;

-- 启用 pgcrypto 扩展（用于密码哈希）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 插入测试用户（密码: 123456）
INSERT INTO users (username, password, nickname, role) VALUES
    ('admin', crypt('123456', gen_salt('bf')), '管理员', 'admin'),
    ('seller1', crypt('123456', gen_salt('bf')), '卖家小王', 'user')
ON CONFLICT (username) DO NOTHING;
