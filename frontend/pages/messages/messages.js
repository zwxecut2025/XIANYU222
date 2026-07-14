import { getConversations, getMessagesWith, sendMessage, getCurrentUser, isLoggedIn } from '../../utils/api.js';
import { escapeHtml } from '../../utils/escape.js';

const user = getCurrentUser();
let activePartnerId = null;
let activePartnerName = '';
let pollingTimer = null;

// 检查登录
if (!isLoggedIn()) {
    document.getElementById('conv-items').innerHTML = '<div class="empty-conv">请先<a href="../index/index.html">登录</a></div>';
} else {
    loadConversations();
}

// 加载会话列表
async function loadConversations() {
    try {
        const res = await getConversations();
        const convs = res.data || [];
        const convItems = document.getElementById('conv-items');

        if (convs.length === 0) {
            convItems.innerHTML = '<div class="empty-conv">暂无私信<br><small>在商品详情页点击"私信卖家"开始聊天</small></div>';
        } else {
            convItems.innerHTML = convs.map(c => `
                <div class="conv-item" data-user-id="${c.partner.id}" data-user-name="${escapeHtml(c.partner.nickname || c.partner.username)}">
                    <div class="conv-avatar">${(c.partner.nickname || c.partner.username || '?')[0]}</div>
                    <div class="conv-info">
                        <div class="conv-name">${escapeHtml(c.partner.nickname || c.partner.username)}</div>
                        <div class="conv-preview">${escapeHtml(c.last_message || '')}</div>
                    </div>
                    ${c.unread > 0 ? `<span class="conv-unread">${c.unread}</span>` : `<span class="conv-time">${timeAgo(c.last_time)}</span>`}
                </div>
            `).join('');

            // 绑定点击
            convItems.querySelectorAll('.conv-item').forEach(item => {
                item.addEventListener('click', () => {
                    const uid = item.dataset.userId;
                    const uname = item.dataset.userName;
                    openChat(parseInt(uid), uname);
                    // 高亮
                    convItems.querySelectorAll('.conv-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    // 清除未读标记
                    const badge = item.querySelector('.conv-unread');
                    if (badge) badge.remove();
                });
            });
        }

        // 检查 URL 参数：是否从商品详情页跳转过来
        const urlParams = new URLSearchParams(window.location.search);
        const targetUserId = urlParams.get('user');
        const targetUserName = urlParams.get('name');
        if (targetUserId && targetUserName) {
            openChat(parseInt(targetUserId), decodeURIComponent(targetUserName));
            const item = convItems.querySelector(`[data-user-id="${targetUserId}"]`);
            if (item) item.classList.add('active');
        }
    } catch (err) {
        document.getElementById('conv-items').innerHTML = `<div class="empty-conv">加载失败: ${err.message}</div>`;
    }
}

// 打开聊天
function openChat(partnerId, partnerName) {
    activePartnerId = partnerId;
    activePartnerName = partnerName;

    document.getElementById('chat-placeholder').style.display = 'none';
    document.getElementById('chat-header').style.display = 'block';
    document.getElementById('chat-messages').style.display = 'flex';
    document.getElementById('chat-input-area').style.display = 'flex';
    document.getElementById('chat-header').textContent = '✉️ ' + partnerName;

    loadMessages();

    // 清除旧轮询
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = setInterval(loadMessages, 3000);
}

// 加载消息
async function loadMessages() {
    if (!activePartnerId) return;
    try {
        const res = await getMessagesWith(activePartnerId);
        const messages = res.data || [];
        const container = document.getElementById('chat-messages');

        container.innerHTML = messages.map(m => {
            const isMine = m.sender_id === user.id;
            return `
                <div class="msg-item ${isMine ? 'mine' : 'other'}">
                    <div class="msg-bubble">${escapeHtml(m.content)}</div>
                    <div class="msg-time">${timeAgo(m.created_at)}</div>
                </div>
            `;
        }).join('');

        // 滚动到底部
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error('加载消息失败:', err);
    }
}

// 发送消息
document.getElementById('msg-send').addEventListener('click', async () => {
    const input = document.getElementById('msg-input');
    const content = input.value.trim();
    if (!content) return;
    if (!activePartnerId) return alert('请先选择聊天对象');

    try {
        await sendMessage(activePartnerId, content);
        input.value = '';
        await loadMessages();
        await loadConversations();
    } catch (err) {
        alert('发送失败: ' + err.message);
    }
});

// 回车发送
document.getElementById('msg-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('msg-send').click();
    }
});

// 页面关闭时清除轮询
window.addEventListener('beforeunload', () => {
    if (pollingTimer) clearInterval(pollingTimer);
});

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
