import { getProductDetail, addFavorite, removeFavorite, checkFavorite, deleteProduct, getCurrentUser } from '../../utils/api.js';
import { escapeHtml } from '../../utils/escape.js';

const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');
const container = document.getElementById('detail-main');
const user = getCurrentUser();

async function loadDetail() {
    try {
        const product = await getProductDetail(productId);
        const isOwner = user && user.id === product.user_id;
        const favCheck = user ? await checkFavorite(productId) : { isFavorite: false };
        let isFavorite = favCheck.isFavorite;

        const images = product.images || [];
        const cover = images.length > 0 ? images[0] : '/image/no-image.jpg';

        const statusMap = {
            'on_sale': '在售',
            'sold': '已售出',
            'off_shelf': '已下架'
        };
        const statusColor = {
            'on_sale': '#52c41a',
            'sold': '#ff4d4f',
            'off_shelf': '#888'
        };

        const canEdit = isOwner && product.status === 'on_sale';

        container.innerHTML = `
            <div class="detail-images">
                <img src="${cover}" class="main-img" id="main-img" onerror="this.src='/image/no-image.jpg'">
                <div class="thumbnails">
                    ${images.map(img => `
                        <img src="${img}" onclick="document.getElementById('main-img').src='${img}'" 
                             onerror="this.src='/image/no-image.jpg'">
                    `).join('')}
                </div>
            </div>
            <div class="detail-info">
                <div class="title">${escapeHtml(product.title)}</div>
                <div class="price">¥${product.price}</div>
                <div class="meta">
                    <span>📂 ${product.category_name || '未分类'}</span>
                    <span style="margin-left:16px;">👁 ${product.view_count || 0}次浏览</span>
                    <span style="margin-left:16px;">💖 ${product.favorite_count || 0}人收藏</span>
                    <span style="margin-left:16px;color:${statusColor[product.status] || '#888'}">
                        ${statusMap[product.status] || '未知'}
                    </span>
                </div>
                <div class="meta">
                    👤 ${escapeHtml(product.nickname || product.username || '匿名用户')}
                    <span style="margin-left:16px;">📅 ${new Date(product.created_at).toLocaleDateString()}</span>
                </div>
                ${product.description ? `<div class="description">${escapeHtml(product.description)}</div>` : ''}
                <div class="contact">
                    <div><span class="label">☎️ 联系方式</span></div>
                    ${product.contact_phone ? `<div>电话：${escapeHtml(product.contact_phone)}</div>` : ''}
                    ${product.contact_wechat ? `<div>微信：${escapeHtml(product.contact_wechat)}</div>` : ''}
                    ${!product.contact_phone && !product.contact_wechat ? '<div style="color:var(--text-light)">暂无联系方式</div>' : ''}
                </div>
                <div class="detail-actions">
                    ${isOwner ? `
                        <button class="btn btn-outline" onclick="location.href='../publish/publish.html?id=${product.id}'">✏️ 编辑</button>
                        <button class="btn btn-danger" id="delete-btn">🗑️ 删除</button>
                    ` : ''}
                    ${user && !isOwner && product.status === 'on_sale' ? `
                        <button class="btn btn-primary" id="favorite-btn">${isFavorite ? '💖 已收藏' : '🤍 收藏'}</button>
                        <a href="tel:${product.contact_phone || ''}" class="btn btn-success" style="text-decoration:none;">☎️ 联系卖家</a>
                    ` : ''}
                    ${!user ? `<p style="color:var(--text-light);font-size:0.9rem;">请登录后联系卖家或收藏</p>` : ''}
                </div>
            </div>
        `;

        // 收藏按钮
        const favBtn = document.getElementById('favorite-btn');
        if (favBtn) {
            favBtn.addEventListener('click', async () => {
                try {
                    if (isFavorite) {
                        await removeFavorite(productId);
                        isFavorite = false;
                        favBtn.textContent = '🤍 收藏';
                        document.querySelector('.meta span:last-child').textContent = `💖 ${(product.favorite_count || 0)}人收藏`;
                    } else {
                        await addFavorite(productId);
                        isFavorite = true;
                        favBtn.textContent = '💖 已收藏';
                        const countSpan = document.querySelector('.meta span:last-child');
                        const match = countSpan.textContent.match(/(\d+)/);
                        const count = match ? parseInt(match[1]) + 1 : (product.favorite_count || 0) + 1;
                        countSpan.textContent = `💖 ${count}人收藏`;
                    }
                } catch (err) {
                    alert(err.message);
                }
            });
        }

        // 删除按钮
        const delBtn = document.getElementById('delete-btn');
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                if (confirm('确定要删除此商品吗？')) {
                    await deleteProduct(productId);
                    alert('删除成功');
                    location.href = '../index/index.html';
                }
            });
        }
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>加载失败</h3><p>${err.message}</p></div>`;
    }
}

loadDetail();