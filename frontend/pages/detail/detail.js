import { getProductDetail, addFavorite, removeFavorite, checkFavorite, deleteProduct, getCurrentUser, getImageUrl, getComments, addComment, deleteComment } from '../../utils/api.js';
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
                        <button class="btn btn-outline" id="chat-btn" data-seller-id="${product.user_id}" data-seller-name="${escapeHtml(product.nickname || product.username)}">✉️ 私信卖家</button>
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

        // 私信按钮
        const chatBtn = document.getElementById('chat-btn');
        if (chatBtn) {
            chatBtn.addEventListener('click', () => {
                const sellerId = chatBtn.dataset.sellerId;
                const sellerName = chatBtn.dataset.sellerName;
                location.href = `../messages/messages.html?user=${sellerId}&name=${encodeURIComponent(sellerName)}`;
            });
        }
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>加载失败</h3><p>${err.message}</p></div>`;
    }
}

loadDetail();

// ========== 评论区逻辑 ==========
let commentPage = 1;
const commentLimit = 20;
let commentTotal = 0;

function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 2592000) return Math.floor(diff / 86400) + '天前';
    return date.toLocaleDateString();
}

function renderComments(comments) {
    const list = document.getElementById('comments-list');
    if (!comments || comments.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:40px;"><p>暂无评论，快来发表第一条评论吧~</p></div>';
        return;
    }

    list.innerHTML = comments.map(c => `
        <div class="comment-item">
            <div class="comment-avatar">${(c.nickname || c.username || '?')[0]}</div>
            <div class="comment-body">
                <div class="comment-header">
                    <span class="comment-user">${escapeHtml(c.nickname || c.username || '匿名')}</span>
                    <span class="comment-time">${timeAgo(c.created_at)}</span>
                </div>
                <div class="comment-content">${escapeHtml(c.content)}</div>
                <div class="comment-actions">
                    <button class="comment-reply-btn" data-comment-id="${c.id}" data-username="${escapeHtml(c.nickname || c.username || '匿名')}">💬 回复</button>
                    ${(user && user.id === c.user_id) ? `<button class="comment-del-btn" data-comment-id="${c.id}">🗑️</button>` : ''}
                </div>
                ${c.replies && c.replies.length > 0 ? `
                    <div class="comment-replies">
                        ${c.replies.map(r => `
                            <div class="reply-item">
                                <div class="comment-avatar reply-avatar">${(r.nickname || r.username || '?')[0]}</div>
                                <div class="comment-body">
                                    <div class="comment-header">
                                        <span class="comment-user">${escapeHtml(r.nickname || r.username || '匿名')}</span>
                                        <span class="comment-time">${timeAgo(r.created_at)}</span>
                                    </div>
                                    <div class="comment-content">${escapeHtml(r.content)}</div>
                                    <div class="comment-actions">
                                        ${(user && user.id === r.user_id) ? `<button class="comment-del-btn" data-comment-id="${r.id}">🗑️</button>` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');

    // 绑定回复按钮
    list.querySelectorAll('.comment-reply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const commentId = btn.dataset.commentId;
            const username = btn.dataset.username;
            const textarea = document.getElementById('comment-input');
            textarea.value = '';
            textarea.placeholder = `回复 @${username}：`;
            textarea.focus();
            textarea.dataset.replyTo = commentId;
        });
    });

    // 绑定删除按钮
    list.querySelectorAll('.comment-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const commentId = parseInt(btn.dataset.commentId);
            if (!confirm('确定删除这条评论吗？')) return;
            try {
                await deleteComment(commentId);
                loadComments();
            } catch (err) {
                alert('删除失败: ' + err.message);
            }
        });
    });
}

async function loadComments(page = 1) {
    try {
        const res = await getComments(productId, page, commentLimit);
        commentTotal = res.total || 0;
        document.getElementById('comment-count').textContent = commentTotal;
        renderComments(res.data || []);

        // 分页
        const pag = document.getElementById('comment-pagination');
        const totalPages = Math.ceil(commentTotal / commentLimit);
        if (totalPages <= 1) {
            pag.innerHTML = '';
        } else {
            let html = '';
            for (let i = 1; i <= totalPages; i++) {
                html += `<button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
            }
            pag.innerHTML = html;
            pag.querySelectorAll('.page-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const p = parseInt(btn.dataset.page);
                    loadComments(p);
                });
            });
        }
    } catch (err) {
        console.error('加载评论失败:', err);
    }
}

// 发表评论
document.getElementById('comment-submit').addEventListener('click', async () => {
    if (!user) {
        alert('请先登录');
        return;
    }
    const textarea = document.getElementById('comment-input');
    const content = textarea.value.trim();
    if (!content) return alert('请输入评论内容');

    const parentId = textarea.dataset.replyTo || null;
    try {
        await addComment(productId, content, parentId ? parseInt(parentId) : null);
        textarea.value = '';
        textarea.placeholder = '写下你的评论...';
        delete textarea.dataset.replyTo;
        loadComments(1);
    } catch (err) {
        alert('评论失败: ' + err.message);
    }
});

// 回车提交
document.getElementById('comment-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('comment-submit').click();
    }
});

// 登录状态控制
if (user) {
    document.getElementById('comment-form-wrap').style.display = 'block';
    document.getElementById('comment-login-hint').style.display = 'none';
} else {
    document.getElementById('comment-form-wrap').style.display = 'none';
    document.getElementById('comment-login-hint').style.display = 'block';
}

// 初始加载评论
loadComments();