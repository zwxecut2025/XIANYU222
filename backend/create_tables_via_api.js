// 通过 Supabase Management API 创建 comments 和 messages 表
const https = require('https');
require('dotenv').config();

const sql = [
  "CREATE TABLE IF NOT EXISTS comments (",
  "    id SERIAL PRIMARY KEY,",
  "    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,",
  "    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
  "    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,",
  "    content TEXT NOT NULL,",
  "    created_at TIMESTAMPTZ DEFAULT NOW()",
  ");",
  "ALTER TABLE comments DISABLE ROW LEVEL SECURITY;",
  "CREATE INDEX IF NOT EXISTS idx_comments_product ON comments(product_id);",
  "CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);",
  "",
  "CREATE TABLE IF NOT EXISTS messages (",
  "    id SERIAL PRIMARY KEY,",
  "    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
  "    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
  "    content TEXT NOT NULL,",
  "    is_read INTEGER DEFAULT 0,",
  "    created_at TIMESTAMPTZ DEFAULT NOW()",
  ");",
  "ALTER TABLE messages DISABLE ROW LEVEL SECURITY;",
  "CREATE INDEX IF NOT EXISTS idx_messages_users ON messages(sender_id, receiver_id);",
  "CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, is_read);"
].join('\n');

const projectRef = process.env.SUPABASE_URL?.match(/https:\/\/(.+)\.supabase\.co/)?.[1] || 'qqmjustfvwpybwpuxboo';
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!serviceKey) {
    console.error('❌ 缺少 SUPABASE_SERVICE_KEY');
    process.exit(1);
}

console.log('🔧 尝试通过 Management API 执行 SQL...');
console.log('   Project:', projectRef);

const data = JSON.stringify({ query: sql });

const options = {
    hostname: 'api.supabase.com',
    path: `/v1/projects/${projectRef}/database/query`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        try {
            const json = JSON.parse(body);
            console.log('Response:', JSON.stringify(json, null, 2).substring(0, 1000));
        } catch {
            console.log('Body:', body.substring(0, 500));
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('\n✅ 建表成功！');
        } else {
            console.log('\n❌ 建表失败，请手动在 Supabase SQL Editor 中执行 init.sql');
            console.log('   链接: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
        }
    });
});

req.on('error', (e) => {
    console.error('Error:', e.message);
    console.log('\n❌ API 调用失败，请手动建表');
});

req.write(data);
req.end();
