import { getProductDetail, addFavorite, removeFavorite, checkFavorite, deleteProduct, getCurrentUser, getImageUrl, getComments, addComment, deleteComment } from '../../utils/api.js';
import { escapeHtml } from '../../utils/escape.js';

const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');
const container = document.getElementById('detail-main');
const user = getCurrentUser();

let currentProduct = null;

async function loadDetail() {
    try {
        const product = await getProductDetail(productId);
        currentProduct = product;
        const isOwner = user && user.id === product.user_id;
        const favCheck = user ? await checkFavorite(productId) : { isFavorite: false };
        let isFavorite = favCheck.isFavorite;

        const images = (product.images || []).map(function(img) { return getImageUrl(img); });
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

        container.innerHTML = `
            <div class="detail-images">
                <img src="${cover}" class="main-img" id="main-img" onerror="this.src='/image/no-image.jpg'" alt="${escapeHtml(product.title)}">
                <div class="thumbnails">
                    ${images.map(img => `
                        <img src="${img}" onclick="document.getElementById('main-img').src='${img}'" 
                             onerror="this.src='/image/no-image.jpg'" alt="">
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
                        <button class="btn" id="dm-btn" style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;">💬 私信卖家</button>
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
                    } else {
                        await addFavorite(productId);
                        isFavorite = true;
                        favBtn.textContent = '💖 已收藏';
                    }
                } catch (err) {
                    alert(err.message);
                }
            });
        }

        // 私信按钮
        const dmBtn = document.getElementById('dm-btn');
        if (dmBtn) {
            dmBtn.addEventListener('click', () => {
                const sellerName = product.nickname || product.username || '';
                location.href = `../messages/messages.html?user=${product.user_id}&product=${productId}&title=${encodeURIComponent(product.title)}&name=${encodeURIComponent(sellerName)}`;
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

// ====== 评论功能 ======
async function loadComments() {
    const listEl = document.getElementById('comment-list');
    const inputBox = document.getElementById('comment-input-box');
    const loginHint = document.getElementById('comment-login-hint');

    // 显示/隐藏输入框
    if (user) {
        inputBox.style.display = 'block';
        loginHint.style.display = 'none';
    } else {
        inputBox.style.display = 'none';
        loginHint.style.display = 'block';
    }

    try {
        const res = await getComments(productId);
        const comments = res.data || [];

        if (comments.length === 0) {
            listEl.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:20px;">暂无评论，快来发表第一条评论吧~</p>';
            return;
        }

        listEl.innerHTML = comments.map(c => {
            const initial = (c.nickname || c.username || '?')[0].toUpperCase();
            const isMine = user && user.id === c.user_id;
            return `
            <div class="comment-item" data-id="${c.id}">
                <div class="comment-avatar">${initial}</div>
                <div class="comment-body">
                    <div class="comment-header">
                        <span class="comment-author">${escapeHtml(c.nickname || c.username || '用户')}</span>
                        <span class="comment-meta">
                            <span class="comment-time">${new Date(c.created_at).toLocaleString()}</span>
                            ${isMine ? '<button class="comment-delete-btn" data-del="'+c.id+'">🗑️</button>' : ''}
                        </span>
                    </div>
                    <div class="comment-text">${escapeHtml(c.content)}</div>
                </div>
            </div>`;
        }).join('');

        // 删除评论事件
        listEl.querySelectorAll('.comment-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('确定删除这条评论吗？')) return;
                try {
                    await deleteComment(btn.dataset.del);
                    loadComments();
                } catch (err) {
                    alert('删除失败：' + err.message);
                }
            });
        });
    } catch (err) {
        listEl.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:20px;">评论加载失败</p>';
    }
}

// 发表评论
document.getElementById('comment-submit-btn').addEventListener('click', async () => {
    const input = document.getElementById('comment-input');
    const content = input.value.trim();
    if (!content) { alert('请输入评论内容'); return; }

    try {
        await addComment(productId, content);
        input.value = '';
        loadComments();
    } catch (err) {
        alert('评论失败：' + err.message);
    }
});

// 回车提交（Ctrl+Enter）
document.getElementById('comment-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        document.getElementById('comment-submit-btn').click();
    }
});

// 初始化
loadDetail().then(() => loadComments());
