const API_BASE = '/api';
const TOKEN_KEY = 'trade_token';
const USER_KEY = 'trade_user';

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser() {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
}

export function isLoggedIn() {
    return !!getToken();
}

async function request(url, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(API_BASE + url, {
        ...options,
        headers,
        credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) {
        const err = new Error(data.error || '请求失败');
        err.status = res.status;
        throw err;
    }
    return data;
}

// 认证
export async function login(username, password) {
    const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });
    if (data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }
    return data;
}

export async function register(username, password, nickname, phone, wechat, school) {
    return request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, nickname, phone, wechat, school })
    });
}

export function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

// 用户
export async function getMe() {
    return request('/users/me');
}

export async function updateMe(data) {
    return request('/users/me', {
        method: 'PUT',
        body: JSON.stringify(data)
    });
}

export async function getUserInfo(userId) {
    return request(`/users/${userId}`);
}

// 商品
export async function getProducts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/products?${query}`);
}

export async function getProductDetail(id) {
    return request(`/products/${id}`);
}

export async function createProduct(data) {
    return request('/products', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

export async function updateProduct(id, data) {
    return request(`/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
}

export async function deleteProduct(id) {
    return request(`/products/${id}`, {
        method: 'DELETE'
    });
}

export async function getUserProducts(userId, status) {
    const query = status ? `?status=${status}` : '';
    return request(`/products/user/${userId}${query}`);
}

// 分类
export async function getCategories() {
    return request('/categories');
}

// 收藏
export async function getFavorites() {
    return request('/favorites');
}

export async function addFavorite(productId) {
    return request(`/favorites/${productId}`, { method: 'POST' });
}

export async function removeFavorite(productId) {
    return request(`/favorites/${productId}`, { method: 'DELETE' });
}

export async function checkFavorite(productId) {
    return request(`/favorites/check/${productId}`);
}

// 上传
export async function uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    const token = getToken();
    const res = await fetch(API_BASE + '/upload/image', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function uploadImages(files) {
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));
    const token = getToken();
    const res = await fetch(API_BASE + '/upload/images', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}
// ========== AI 图片识别 ==========
export async function recognizeImage(imageUrl) {
    return request('/ai/recognize', {
        method: 'POST',
        body: JSON.stringify({ imageUrl })
    });
}

// 图片URL处理：统一将各种路径转为可访问的完整URL
export function getImageUrl(path) {
    if (!path) return '/image/no-image.jpg';
    // data: 和 blob: 直接返回
    if (path.startsWith('data:') || path.startsWith('blob:')) return path;
    // 如果包含 localhost，说明是旧数据残留的绝对路径，提取 path 部分
    if (path.includes('localhost') || path.includes('127.0.0.1')) {
        try {
            const url = new URL(path);
            path = url.pathname;
        } catch (e) {
            // 解析失败就用原值
        }
    }
    // 已经是完整的远程URL（非 localhost），直接返回
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    // 相对路径，拼接当前访问地址
    const baseUrl = window.location.origin;
    return `${baseUrl}${path}`;
}

// ========== 评论 ==========
export async function getComments(productId) {
    return request(`/comments/product/${productId}`);
}

export async function addComment(productId, content) {
    return request('/comments', {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, content })
    });
}

export async function deleteComment(commentId) {
    return request(`/comments/${commentId}`, { method: 'DELETE' });
}

// ========== 私信 ==========
export async function sendMessage(receiverId, productId, content) {
    return request('/messages', {
        method: 'POST',
        body: JSON.stringify({ receiver_id: receiverId, product_id: productId, content })
    });
}

export async function getConversations() {
    return request('/messages/conversations');
}

export async function getMessages(peerId) {
    return request(`/messages/${peerId}`);
}

export async function markAsRead(peerId) {
    return request(`/messages/read/${peerId}`, { method: 'PUT' });
}