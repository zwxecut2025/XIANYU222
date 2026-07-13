const express = require('express');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const path = require('path');

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

function imageToBase64(imagePath) {
    try {
        const buffer = fs.readFileSync(imagePath);
        return buffer.toString('base64');
    } catch (e) {
        throw new Error('图片读取失败');
    }
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

        // 将图片URL转为本地文件路径
        let imagePath = imageUrl;
        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3008}`;
        if (imageUrl.startsWith(baseUrl)) {
            // 本地上传的图片，去掉baseUrl前缀
            imagePath = path.join(__dirname, '..', imageUrl.replace(baseUrl, ''));
        } else if (imageUrl.startsWith('/uploads/')) {
            imagePath = path.join(__dirname, '..', imageUrl);
        } else if (imageUrl.startsWith('http')) {
            return res.status(400).json({ error: '暂不支持外部URL，请使用本地上传的图片' });
        } else {
            imagePath = path.join(__dirname, '..', imageUrl);
        }

        const token = await getBaiduToken();
        const base64Image = imageToBase64(imagePath);

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
