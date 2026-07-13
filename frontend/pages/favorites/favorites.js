import { getFavorites, removeFavorite, getCurrentUser } from '../../utils/api.js';
import { escapeHtml } from '../../utils/escape.js';

const container = document.getElementById('favorites-list');

// 主入口
if (!getCurrentUser()) {
    container.innerHTML = '<div class="empty-state" style="text-align:center;padding:80px 20px;"><div class="icon" style="font-size:4rem;">🔐</div><h3>请先登录</h3><p style="color:var(--text-light);">登录后即可查看收藏</p><p style="margin-top:16px;"><a href="../index/index.html" style="display:inline-block;background:var(--primary-color);color:#fff;padding:10px 32px;border-radius:8px;text-decoration:none;">← 返回首页登录</a></p></div>';
} else {
    loadFavorites();
}

async function loadFavorites() {
    try {
        const products = await getFavorites();
        if (products.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="icon">💔</div><h3>还没有收藏</h3><p>去逛逛喜欢的物品吧</p></div>`;
            return;
        }
        container.innerHTML = products.map(p => `
            <div class="profile-product-card" data-id="${p.id}">
                <img src="${p.images && p.images.length > 0 ? p.images[0] : '/image/no-image.jpg'}" onerror="this.src='/image/no-image.jpg'">
                <div class="info">
                    <div class="title" onclick="location.href='../detail/detail.html?id=${p.id}'">${escapeHtml(p.title)}</div>
                    <div class="price">¥${p.price}</div>
                    <button class="btn btn-danger" style="padding:4px 12px;font-size:0.8rem;margin-top:6px;" data-id="${p.id}">取消收藏</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.btn-danger').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                if (confirm('确定取消收藏吗？')) {
                    await removeFavorite(id);
                    loadFavorites();
                }
            });
        });

        container.querySelectorAll('.profile-product-card .title').forEach(el => {
            el.addEventListener('click', () => {
                const card = el.closest('.profile-product-card');
                location.href = `../detail/detail.html?id=${card.dataset.id}`;
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>加载失败</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
}
