import { getProducts, getCategories, login, register, logout, isLoggedIn, getCurrentUser, getToken } from '../../utils/api.js';
import { escapeHtml } from '../../utils/escape.js';

class App {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 20;
        this.totalPages = 1;
        this.currentCategory = '';
        this.currentKeyword = '';
        this.categories = [];
        this.cacheDOM();
        this.bindEvents();
        this.loadCategories();
        this.loadProducts();
        this.updateAuthUI();
    }

    cacheDOM() {
        this.container = document.getElementById('products-container');
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
        this.searchCategory = document.getElementById('search-category');
        this.categoryNav = document.getElementById('category-nav');
        this.paginationContainer = document.getElementById('pagination-container');
        this.authButtons = document.getElementById('auth-buttons');
        this.userInfo = document.getElementById('user-info');
        this.usernameDisplay = document.getElementById('username-display');
        this.userAvatar = document.getElementById('user-avatar');
        this.loginBtn = document.getElementById('login-btn');
        this.registerBtn = document.getElementById('register-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.loginModal = document.getElementById('login-modal');
        this.registerModal = document.getElementById('register-modal');
        this.loginForm = {
            username: document.getElementById('login-username'),
            password: document.getElementById('login-password'),
            error: document.getElementById('login-error'),
            usernameError: document.getElementById('login-username-error'),
            passwordError: document.getElementById('login-password-error'),
            doLogin: document.getElementById('do-login'),
            toRegister: document.getElementById('to-register')
        };
        this.registerForm = {
            username: document.getElementById('reg-username'),
            password: document.getElementById('reg-password'),
            repassword: document.getElementById('reg-repassword'),
            nickname: document.getElementById('reg-nickname'),
            error: document.getElementById('reg-error'),
            usernameError: document.getElementById('reg-username-error'),
            passwordError: document.getElementById('reg-password-error'),
            repasswordError: document.getElementById('reg-repassword-error'),
            doRegister: document.getElementById('do-register'),
            toLogin: document.getElementById('to-login')
        };
    }

    bindEvents() {
        this.searchBtn?.addEventListener('click', () => this.search());
        this.searchInput?.addEventListener('keypress', (e) => e.key === 'Enter' && this.search());
        this.searchCategory?.addEventListener('change', () => this.search());

        this.loginBtn?.addEventListener('click', () => this.openModal('login'));
        this.registerBtn?.addEventListener('click', () => this.openModal('register'));

        [this.loginModal, this.registerModal].forEach(modal => {
            modal?.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('close-btn')) {
                    this.closeModal(modal);
                }
            });
        });

        this.loginForm.toRegister?.addEventListener('click', () => {
            this.closeModal(this.loginModal);
            this.openModal('register');
        });
        this.registerForm.toLogin?.addEventListener('click', () => {
            this.closeModal(this.registerModal);
            this.openModal('login');
        });

        this.loginForm.doLogin?.addEventListener('click', () => this.handleLogin());
        this.registerForm.doRegister?.addEventListener('click', () => this.handleRegister());
        this.logoutBtn?.addEventListener('click', () => this.handleLogout());

        document.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (card) {
                const id = card.dataset.id;
                window.location.href = `../detail/detail.html?id=${id}`;
            }
        });
    }

    openModal(type) {
        const modal = type === 'login' ? this.loginModal : this.registerModal;
        if (modal) modal.style.display = 'flex';
    }

    closeModal(modal) {
        if (modal) modal.style.display = 'none';
    }

    async loadCategories() {
        try {
            this.categories = await getCategories();
            const options = this.categories.map(c =>
                `<option value="${c.id}">${c.name}</option>`
            ).join('');
            this.searchCategory.innerHTML = `<option value="">全部分类</option>${options}`;
            this.categoryNav.innerHTML = `
                <span class="category-item active" data-id="">🏷️ 全部</span>
                ${this.categories.map(c =>
                    `<span class="category-item" data-id="${c.id}">${c.name}</span>`
                ).join('')}
            `;
        } catch (err) {
            console.error('加载分类失败，使用硬编码分类', err);
        }
        // 事件委托绑定——无论API成功还是失败，点击都生效
        this.bindCategoryClick();
    }

    async loadProducts() {
        try {
            const params = {
                page: this.currentPage,
                limit: this.pageSize,
                category_id: this.currentCategory || '',
                keyword: this.currentKeyword || ''
            };
            const data = await getProducts(params);
            this.renderProducts(data.data);
            this.renderPagination(data.pagination);
        } catch (err) {
            this.container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>加载失败</h3><p>${err.message}</p></div>`;
        }
    }

    // 分类点击：使用事件委托，API加载和本地硬编码都能用
    bindCategoryClick() {
        var nav = this.categoryNav;
        if (!nav) return;
        var self = this;
        nav.onclick = function(e) {
            var item = e.target.closest('.category-item');
            if (!item) return;
            e.preventDefault();
            // 切换高亮
            var allItems = nav.querySelectorAll('.category-item');
            for (var i = 0; i < allItems.length; i++) {
                allItems[i].classList.remove('active');
            }
            item.classList.add('active');
            // 获取分类ID：优先 data-id，回退文本匹配
            var dataId = item.getAttribute('data-id');
            if (dataId !== null && dataId !== undefined) {
                self.currentCategory = dataId;
            } else {
                // 从文本提取纯中文（去掉emoji和空格）
                var text = item.textContent.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{2000}-\u{206F}]|\s/gu, '').trim();
                var catMap = {
                    '全部': '',
                    '教材教辅': '1', '数码产品': '2', '手机平板': '3',
                    '游戏娱乐': '4', '服饰鞋包': '5', '出行工具': '6',
                    '生活用品': '7', '音乐乐器': '8', '运动户外': '9', '其他': '10'
                };
                self.currentCategory = catMap[text] !== undefined ? catMap[text] : '';
            }
            if (self.searchCategory) self.searchCategory.value = self.currentCategory;
            self.currentPage = 1;
            self.loadProducts();
        };
    }

    renderProducts(products) {
        if (!products || products.length === 0) {
            this.container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📭</div>
                    <h3>暂无商品</h3>
                    <p>发布你闲置的物品吧！</p>
                </div>
            `;
            return;
        }
        this.container.innerHTML = products.map(p => {
            const cover = p.cover || '/image/no-image.jpg';
            const statusMap = { 'on_sale': '', 'sold': '已售出', 'off_shelf': '已下架' };
            const statusClass = p.status === 'sold' ? 'sold' : '';
            return `
                <div class="product-card" data-id="${p.id}">
                    <div class="product-image-wrap">
                        <img src="${cover}" alt="${escapeHtml(p.title)}" onerror="this.src='/image/no-image.jpg'">
                        ${p.status !== 'on_sale' ? `<span class="product-status ${statusClass}">${statusMap[p.status]}</span>` : ''}
                    </div>
                    <div class="product-info">
                        <div class="product-title">${escapeHtml(p.title)}</div>
                        <div class="product-price">¥${p.price} <small>${p.category_name || ''}</small></div>
                        <div class="product-meta">
                            <span class="user">
                                <span class="avatar">${escapeHtml((p.nickname || p.username || 'U')[0])}</span>
                                ${escapeHtml(p.nickname || p.username || '匿名')}
                            </span>
                            <span>👁 ${p.view_count || 0}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderPagination(pagination) {
        if (!pagination || pagination.totalPages <= 1) {
            this.paginationContainer.innerHTML = '';
            return;
        }
        this.totalPages = pagination.totalPages;
        let html = '<div class="pagination">';
        if (this.currentPage > 1) {
            html += `<button class="page-btn" data-page="${this.currentPage - 1}">上一页</button>`;
        }
        for (let i = 1; i <= this.totalPages; i++) {
            if (i === this.currentPage) {
                html += `<button class="page-btn active" disabled>${i}</button>`;
            } else if (i <= 3 || i > this.totalPages - 2 || Math.abs(i - this.currentPage) <= 1) {
                html += `<button class="page-btn" data-page="${i}">${i}</button>`;
            } else if (i === 4 || i === this.totalPages - 3) {
                html += `<span class="page-dots">…</span>`;
            }
        }
        if (this.currentPage < this.totalPages) {
            html += `<button class="page-btn" data-page="${this.currentPage + 1}">下一页</button>`;
        }
        html += '</div>';
        this.paginationContainer.innerHTML = html;
        this.paginationContainer.querySelectorAll('.page-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentPage = parseInt(btn.dataset.page);
                this.loadProducts();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    }

    search() {
        this.currentKeyword = this.searchInput.value.trim();
        this.currentCategory = this.searchCategory.value;
        this.currentPage = 1;
        // 高亮分类导航
        this.categoryNav.querySelectorAll('.category-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === this.currentCategory);
        });
        this.loadProducts();
    }

    updateAuthUI() {
        const user = getCurrentUser();
        if (user) {
            this.authButtons.style.display = 'none';
            this.userInfo.style.display = 'flex';
            this.usernameDisplay.textContent = user.nickname || user.username;
            this.userAvatar.textContent = (user.nickname || user.username || 'U')[0].toUpperCase();
        } else {
            this.authButtons.style.display = 'flex';
            this.userInfo.style.display = 'none';
        }
    }

    async handleLogin() {
        const username = this.loginForm.username.value.trim();
        const password = this.loginForm.password.value.trim();
        if (!username || !password) {
            alert('请填写完整信息');
            return;
        }
        try {
            await login(username, password);
            this.closeModal(this.loginModal);
            this.updateAuthUI();
            this.loadProducts();
        } catch (err) {
            this.loginForm.error.textContent = err.message;
            this.loginForm.error.style.display = 'block';
        }
    }

    async handleRegister() {
        const username = this.registerForm.username.value.trim();
        const password = this.registerForm.password.value.trim();
        const repassword = this.registerForm.repassword.value.trim();
        const nickname = this.registerForm.nickname.value.trim();
        if (!username || !password) {
            alert('请填写完整信息');
            return;
        }
        if (password !== repassword) {
            alert('两次密码不一致');
            return;
        }
        try {
            await register(username, password, nickname);
            alert('注册成功，请登录');
            this.closeModal(this.registerModal);
            this.openModal('login');
            this.loginForm.username.value = username;
        } catch (err) {
            this.registerForm.error.textContent = err.message;
            this.registerForm.error.style.display = 'block';
        }
    }

    handleLogout() {
        if (confirm('确定要退出吗？')) {
            logout();
            this.updateAuthUI();
            this.loadProducts();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});