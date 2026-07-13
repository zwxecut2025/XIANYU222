// ========== 我的页面 - 自包含版，零外部依赖 ==========
(function () {
    'use strict';

    var API_BASE = '/api';
    var TOKEN_KEY = 'trade_token';
    var USER_KEY = 'trade_user';
    var container = document.getElementById('profile-container');

    // ---- 工具函数 ----
    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getCurrentUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
    }

    function logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function apiRequest(url, options) {
        var opts = options || {};
        var headers = { 'Content-Type': 'application/json' };
        var token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        if (opts.headers) {
            Object.keys(opts.headers).forEach(function (k) { headers[k] = opts.headers[k]; });
        }
        var res = await fetch(API_BASE + url, {
            method: opts.method || 'GET',
            headers: headers,
            body: opts.body || undefined
        });
        var data = await res.json();
        if (!res.ok) {
            var err = new Error(data.error || '请求失败');
            err.status = res.status;
            throw err;
        }
        return data;
    }

    // ---- 入口 ----
    var user = getCurrentUser();

    // 未登录：立即显示登录引导
    if (!user) {
        container.innerHTML =
            '<div style="text-align:center;padding:80px 20px;">' +
            '<div style="font-size:4rem;">🔐</div>' +
            '<h3 style="margin-top:16px;">请先登录</h3>' +
            '<p style="color:#999;margin:8px 0 20px;">登录后即可查看个人中心</p>' +
            '<a href="../index/index.html" style="display:inline-block;background:#FF6B35;color:#fff;padding:10px 32px;border-radius:8px;text-decoration:none;font-size:1.1rem;">← 返回首页登录</a>' +
            '</div>';
        return;
    }

    // 已登录：加载数据
    var currentUserData = null;
    var currentTab = 'products';

    loadProfile();

    async function loadProfile() {
        try {
            currentUserData = await apiRequest('/users/me');
            var products = await apiRequest('/products/user/' + currentUserData.id);
            var favorites = await apiRequest('/favorites');

            var stats =
                '<div class="profile-stats">' +
                '<div class="stat"><div class="num">' + products.length + '</div><div class="label">发布</div></div>' +
                '<div class="stat"><div class="num">' + favorites.length + '</div><div class="label">收藏</div></div>' +
                '<div class="stat"><div class="num">' + products.filter(function (p) { return p.status === 'on_sale'; }).length + '</div><div class="label">在售</div></div>' +
                '</div>';

            container.innerHTML =
                '<div class="profile-header">' +
                '<div class="profile-avatar">' + (currentUserData.nickname || currentUserData.username || 'U')[0].toUpperCase() + '</div>' +
                '<div>' +
                '<div class="profile-name">' + escapeHtml(currentUserData.nickname || currentUserData.username) + ' <small>@' + escapeHtml(currentUserData.username) + '</small></div>' +
                (currentUserData.school ? '<div style="color:#999;font-size:0.9rem;">🏫 ' + escapeHtml(currentUserData.school) + '</div>' : '') +
                stats +
                '<div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;">' +
                '<button class="btn btn-outline" id="edit-profile-btn">✏️ 编辑资料</button>' +
                '<button class="btn btn-danger" id="logout-btn">🚪 退出登录</button>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div class="profile-tabs">' +
                '<span class="tab active" data-tab="products">📦 我的发布 (' + products.length + ')</span>' +
                '<span class="tab" data-tab="favorites">❤️ 我的收藏 (' + favorites.length + ')</span>' +
                '</div>' +
                '<div id="tab-content"></div>';

            // Tab 切换
            container.querySelectorAll('.tab').forEach(function (tab) {
                tab.addEventListener('click', function () {
                    container.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
                    tab.classList.add('active');
                    currentTab = tab.dataset.tab;
                    renderTabContent(currentTab, products, favorites);
                });
            });

            renderTabContent('products', products, favorites);

            // 编辑资料
            var editBtn = document.getElementById('edit-profile-btn');
            if (editBtn) {
                editBtn.addEventListener('click', openEditModal);
            }

            // 退出登录
            var logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', function () {
                    if (confirm('确定要退出登录吗？')) {
                        logout();
                        location.href = '../index/index.html';
                    }
                });
            }

        } catch (err) {
            console.error('加载个人中心失败:', err);
            container.innerHTML =
                '<div style="text-align:center;padding:60px;">' +
                '<div style="font-size:3rem;">⚠️</div>' +
                '<h3>加载失败</h3>' +
                '<p style="color:#999;">' + escapeHtml(err.message || '网络异常，请稍后重试') + '</p>' +
                '<p style="margin-top:16px;">' +
                '<a href="javascript:location.reload()" style="color:#FF6B35;margin-right:16px;">🔄 重试</a>' +
                '<a href="../index/index.html" style="color:#999;">← 返回首页</a>' +
                '</p>' +
                '</div>';
        }
    }

    function renderTabContent(tab, products, favorites) {
        var content = document.getElementById('tab-content');
        if (!content) return;

        if (tab === 'products') {
            if (products.length === 0) {
                content.innerHTML = '<div style="text-align:center;padding:40px;"><div style="font-size:3rem;">📭</div><h3>还没有发布</h3><p><a href="../publish/publish.html" style="color:#FF6B35;">去发布闲置</a></p></div>';
                return;
            }
            content.innerHTML =
                '<div class="profile-products">' +
                products.map(function (p) {
                    return '<div class="profile-product-card" onclick="location.href=\'../detail/detail.html?id=' + p.id + '\'">' +
                        '<img src="' + ((p.images && p.images.length > 0) ? p.images[0] : '/image/no-image.jpg') + '" onerror="this.src=\'/image/no-image.jpg\'">' +
                        '<div class="info">' +
                        '<div class="title">' + escapeHtml(p.title) + '</div>' +
                        '<div class="price">¥' + p.price + '</div>' +
                        '<div class="status">' + (p.status === 'on_sale' ? '🟢 在售' : p.status === 'sold' ? '🔴 已售' : '⚪ 已下架') + '</div>' +
                        '</div>' +
                        '</div>';
                }).join('') +
                '</div>';
        } else {
            if (favorites.length === 0) {
                content.innerHTML = '<div style="text-align:center;padding:40px;"><div style="font-size:3rem;">💔</div><h3>还没有收藏</h3><p>去逛逛喜欢的物品吧</p></div>';
                return;
            }
            content.innerHTML =
                '<div class="profile-products">' +
                favorites.map(function (p) {
                    return '<div class="profile-product-card" onclick="location.href=\'../detail/detail.html?id=' + p.id + '\'">' +
                        '<img src="' + ((p.images && p.images.length > 0) ? p.images[0] : '/image/no-image.jpg') + '" onerror="this.src=\'/image/no-image.jpg\'">' +
                        '<div class="info">' +
                        '<div class="title">' + escapeHtml(p.title) + '</div>' +
                        '<div class="price">¥' + p.price + '</div>' +
                        '<div class="status">❤️ 已收藏</div>' +
                        '</div>' +
                        '</div>';
                }).join('') +
                '</div>';
        }
    }

    function openEditModal() {
        var modal = document.getElementById('edit-modal');
        document.getElementById('edit-nickname').value = currentUserData.nickname || '';
        document.getElementById('edit-phone').value = currentUserData.phone || '';
        document.getElementById('edit-wechat').value = currentUserData.wechat || '';
        document.getElementById('edit-school').value = currentUserData.school || '';
        modal.style.display = 'flex';
    }

    // 编辑资料表单
    var editForm = document.getElementById('edit-profile-form');
    if (editForm) {
        editForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            var data = {
                nickname: document.getElementById('edit-nickname').value.trim(),
                phone: document.getElementById('edit-phone').value.trim(),
                wechat: document.getElementById('edit-wechat').value.trim(),
                school: document.getElementById('edit-school').value.trim()
            };
            try {
                await apiRequest('/users/me', { method: 'PUT', body: JSON.stringify(data) });
                alert('资料更新成功');
                document.getElementById('edit-modal').style.display = 'none';
                loadProfile();
            } catch (err) {
                alert('更新失败：' + err.message);
            }
        });
    }

    // 关闭模态框
    document.querySelectorAll('[data-close]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var modal = btn.closest('.modal-mask');
            if (modal) modal.style.display = 'none';
        });
    });

})();
