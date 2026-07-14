const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

let cachedToken = null;
let tokenExpireTime = 0;

function getBaiduToken() {
    return new Promise((resolve, reject) => {
        if (cachedToken && Date.now() < tokenExpireTime) {
            return resolve(cachedToken);
        }

        const apiKey = process.env.BAIDU_API_KEY;
        const secretKey = process.env.BAIDU_SECRET_KEY;
        const postData = `grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;

        const req = https.request({
            hostname: 'aip.baidubce.com',
            path: '/oauth/2.0/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.access_token) {
                        cachedToken = result.access_token;
                        tokenExpireTime = Date.now() + (result.expires_in - 60) * 1000;
                        resolve(cachedToken);
                    } else {
                        reject(new Error('获取百度token失败: ' + (result.error_description || '未知错误')));
                    }
                } catch (e) {
                    reject(new Error('解析百度token响应失败'));
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 从本地路径读取图片为 base64
function localImageToBase64(imagePath) {
    try {
        const buffer = fs.readFileSync(imagePath);
        return buffer.toString('base64');
    } catch (e) {
        throw new Error('本地图片读取失败');
    }
}

// 从远程 URL 下载图片为 base64
function remoteImageToBase64(imageUrl) {
    return new Promise((resolve, reject) => {
        const parsed = url.parse(imageUrl);
        const client = parsed.protocol === 'https:' ? https : http;
        const options = {
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: { 'User-Agent': 'Xianyu/1.0' }
        };
        client.get(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // 处理重定向
                return remoteImageToBase64(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error('下载图片失败，状态码: ' + res.statusCode));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.toString('base64'));
            });
        }).on('error', reject);
    });
}

router.post('/recognize', async (req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) {
            return res.status(400).json({ error: '请提供图片地址' });
        }

        // 检查百度API配置
        if (!process.env.BAIDU_API_KEY || !process.env.BAIDU_SECRET_KEY) {
            return res.status(503).json({ error: 'AI识图功能暂未配置，请先设置百度API密钥' });
        }

        // 获取图片 base64：支持本地路径和远程 URL
        let base64Image;
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            // 远程图片（如 Supabase Storage），下载后转 base64
            console.log('   🌐 下载远程图片:', imageUrl.substring(0, 80) + '...');
            base64Image = await remoteImageToBase64(imageUrl);
        } else {
            // 本地图片，读取文件
            let imagePath = imageUrl;
            const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3008}`;
            if (imageUrl.startsWith(baseUrl)) {
                imagePath = path.join(__dirname, '..', imageUrl.replace(baseUrl, ''));
            } else if (imageUrl.startsWith('/uploads/')) {
                imagePath = path.join(__dirname, '..', imageUrl);
            } else {
                imagePath = path.join(__dirname, '..', imageUrl);
            }
            base64Image = localImageToBase64(imagePath);
        }

        const token = await getBaiduToken();
        const postData = 'image=' + encodeURIComponent(base64Image);

        const result = await new Promise((resolve, reject) => {
            const req2 = https.request({
                hostname: 'aip.baidubce.com',
                path: '/rest/2.0/image-classify/v2/advanced_general?access_token=' + token,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, (res2) => {
                let data = '';
                res2.on('data', chunk => data += chunk);
                res2.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('解析识别结果失败'));
                    }
                });
            });
            req2.on('error', reject);
            req2.write(postData);
            req2.end();
        });

        if (result.error_code) {
            throw new Error('百度识别失败: ' + result.error_msg);
        }

        const items = result.result || [];
        if (items.length === 0) {
            return res.json({ title: '', description: '未识别到物品' });
        }

        const top = items[0];
        const title = top.keyword || '';
        const description = items.slice(0, 5)
            .map(item => `${item.keyword}（置信度${Math.round(item.score * 100)}%）`)
            .join('；');

        res.json({ title, description });

    } catch (error) {
        console.error('AI识图失败:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
