import { getCategories, createProduct, getProductDetail, updateProduct, uploadImages, getCurrentUser, recognizeImage, getImageUrl } from '../../utils/api.js';
import { escapeHtml } from '../../utils/escape.js';

const urlParams = new URLSearchParams(window.location.search);
const editId = urlParams.get('id');
const user = getCurrentUser();

if (!user) {
    var container = document.querySelector('.publish-container');
    if (container) {
        container.innerHTML = '<div style="text-align:center;padding:80px 20px;"><div style="font-size:4rem;">🔐</div><h3>请先登录</h3><p style="color:#999;">登录后即可发布商品</p><p style="margin-top:16px;"><a href="../index/index.html" style="display:inline-block;background:#FF6B35;color:#fff;padding:10px 32px;border-radius:8px;text-decoration:none;">← 返回首页登录</a></p></div>';
    }
    throw new Error('NOT_LOGGED_IN');
}

// DOM
const form = document.getElementById('publish-form');
const titleInput = document.getElementById('title');
const categorySelect = document.getElementById('category_id');
const priceInput = document.getElementById('price');
const descriptionInput = document.getElementById('description');
const phoneInput = document.getElementById('contact_phone');
const wechatInput = document.getElementById('contact_wechat');
const submitBtn = document.getElementById('submit-btn');
const formTitle = document.getElementById('form-title');
const editIdInput = document.getElementById('edit-id');
const dropArea = document.getElementById('drop-area');
const imageInput = document.getElementById('image-input');
const previewContainer = document.getElementById('image-preview');
const aiRecognizeBtn = document.getElementById('ai-recognize-btn');
const aiStatus = document.getElementById('ai-status');

let uploadedImages = [];
let categories = [];

// 加载分类
async function loadCategories() {
    try {
        categories = await getCategories();
        categorySelect.innerHTML = categories.map(c =>
            `<option value="${c.id}">${c.name}</option>`
        ).join('');
    } catch (err) {
        console.error('加载分类失败', err);
    }
}

// 加载编辑数据
async function loadEditData() {
    if (!editId) return;
    try {
        const product = await getProductDetail(editId);
        if (product.user_id !== user.id) {
            alert('无权编辑此商品');
            location.href = '../index/index.html';
            return;
        }
        editIdInput.value = product.id;
        titleInput.value = product.title;
        categorySelect.value = product.category_id || '';
        priceInput.value = product.price;
        descriptionInput.value = product.description || '';
        phoneInput.value = product.contact_phone || '';
        wechatInput.value = product.contact_wechat || '';
        uploadedImages = product.images || [];
        renderPreview();
        formTitle.textContent = '✏️ 编辑商品';
        submitBtn.textContent = '💾 保存修改';
    } catch (err) {
        alert('加载数据失败：' + err.message);
    }
}

// 渲染图片预览
function renderPreview() {
    previewContainer.innerHTML = uploadedImages.map((url, index) => `
        <div class="preview-item">
            <img src="${getImageUrl(url)}" onerror="this.src='/image/no-image.jpg'">
            <button class="remove" data-index="${index}">✕</button>
        </div>
    `).join('');
    previewContainer.querySelectorAll('.remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            uploadedImages.splice(idx, 1);
            renderPreview();
        });
    });
}

// 上传图片
async function uploadImagesHandler(files) {
    try {
        const formData = new FormData();
        for (const file of files) {
            if (file.size > 5 * 1024 * 1024) {
                alert(`图片 ${file.name} 超过5MB`);
                return;
            }
            if (!file.type.startsWith('image/')) {
                alert(`图片 ${file.name} 格式不支持`);
                return;
            }
            formData.append('images', file);
        }
        const result = await uploadImages(files);
        uploadedImages = [...uploadedImages, ...result.urls];
        renderPreview();
        imageInput.value = '';
    } catch (err) {
        alert('上传失败：' + err.message);
    }
}

// 拖拽上传
dropArea.addEventListener('click', () => imageInput.click());
dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = 'var(--primary-color)';
    dropArea.style.background = 'var(--primary-light)';
});
dropArea.addEventListener('dragleave', () => {
    dropArea.style.borderColor = '';
    dropArea.style.background = '';
});
dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = '';
    dropArea.style.background = '';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const remaining = 9 - uploadedImages.length;
        const validFiles = Array.from(files).slice(0, remaining);
        if (validFiles.length < files.length) {
            alert(`最多上传9张图片，剩余${remaining}张`);
        }
        uploadImagesHandler(validFiles);
    }
});

imageInput.addEventListener('change', () => {
    if (imageInput.files.length > 0) {
        const remaining = 9 - uploadedImages.length;
        const files = Array.from(imageInput.files).slice(0, remaining);
        if (files.length < imageInput.files.length) {
            alert(`最多上传9张图片，剩余${remaining}张`);
        }
        uploadImagesHandler(files);
    }
});

// AI识图
aiRecognizeBtn.addEventListener('click', async () => {
    if (uploadedImages.length === 0) {
        alert('请先上传图片');
        return;
    }
    try {
        aiRecognizeBtn.disabled = true;
        aiStatus.textContent = '🤖 AI正在识别图片...';
        const firstImage = uploadedImages[0];
        const result = await recognizeImage(firstImage);
        if (result.title) {
            titleInput.value = result.title;
        }
        aiStatus.textContent = '✅ 识别完成！物品名称已自动填入';
        aiStatus.style.color = '#52c41a';
    } catch (err) {
        aiStatus.textContent = '❌ ' + err.message;
        aiStatus.style.color = '#ff4d4f';
    } finally {
        aiRecognizeBtn.disabled = false;
    }
});

// 提交表单
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        title: titleInput.value.trim(),
        category_id: parseInt(categorySelect.value) || null,
        price: parseFloat(priceInput.value) || 0,
        description: descriptionInput.value.trim(),
        contact_phone: phoneInput.value.trim(),
        contact_wechat: wechatInput.value.trim(),
        images: uploadedImages
    };
    if (!data.title) { alert('请输入标题'); return; }
    if (data.price <= 0) { alert('请输入正确的价格'); return; }

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = '提交中...';
        if (editId) {
            data.status = 'on_sale';
            await updateProduct(editId, data);
            alert('修改成功！');
        } else {
            await createProduct(data);
            alert('发布成功！');
        }
        location.href = '../index/index.html';
    } catch (err) {
        alert('操作失败：' + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = editId ? '💾 保存修改' : '📤 发布';
    }
});

// 初始化（包装 try-catch 避免未登录时的报错显示在控制台）
try {
    loadCategories();
    loadEditData();
} catch (e) {
    if (e.message !== 'NOT_LOGGED_IN') throw e;
}