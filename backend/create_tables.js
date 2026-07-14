// 临时脚本：在 Supabase 中创建 comments 和 messages 表
// 运行完后可删除
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function createTables() {
    // 方法：使用 supabase-js 的 rpc 执行 SQL
    // 首先尝试通过 REST API 直接查询测试连接
    const { error: testErr } = await supabase.from('users').select('id').limit(1);
    if (testErr) {
        console.error('连接失败:', testErr.message);
        process.exit(1);
    }
    console.log('✅ Supabase 连接正常');

    // 使用 pg 原生查询方式创建表
    // Supabase 的 REST API 不直接支持 DDL，但提供了管理 API
    // 最可靠的方式是提示用户手动在 SQL Editor 执行 init.sql
    
    // 先尝试用 supabase.rpc 调用
    const createSQL = `
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
`;

    console.log('请在 Supabase SQL Editor 中执行以下 SQL（或执行 init.sql）：');
    console.log('---');
    console.log(createSQL);
    console.log('---');
    
    // 尝试通过 Management API 执行（需要 project ref）
    // 注意：management API 通常需要不同的认证方式
    // 直接使用 HTTP POST 到 REST SQL endpoint
    const fetch = (await import('node-fetch')).default;
    const mgmtUrl = process.env.SUPABASE_URL.replace('.supabase.co', '.supabase.co') + '/rest/v1/';
    
    // 尝试 pg-meta 方式（如果可用的话）
    // 实际上 Supabase 有一个内部 SQL 执行端点
    try {
        const res = await fetch('https://api.supabase.com/v1/projects/qqmjustfvwpybwpuxboo/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
            },
            body: JSON.stringify({ query: createSQL })
        });
        console.log('Management API status:', res.status);
        const text = await res.text();
        console.log('Response:', text.substring(0, 200));
    } catch (e) {
        console.log('Management API 不可用，请手动执行 SQL:', e.message);
    }
}

createTables().catch(console.error);
