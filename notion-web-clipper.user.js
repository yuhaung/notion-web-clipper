// ==UserScript==
// @name         Notion Web Clipper
// @namespace    https://github.com/yuhaung/notion-web-clipper
// @version      1.0
// @description  悬停高亮 + 单击选取，将网页内容（文字、图片、视频）剪藏到 Notion 数据库，支持知乎/Twitter 深度优化。
// @author       yuhaung
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.notion.com
// @connect      *
// @license      MIT
// @supportURL   https://github.com/yuhaung/notion-web-clipper/issues
// @updateURL    https://raw.githubusercontent.com/yuhaung/notion-web-clipper/main/notion-web-clipper.user.js
// @downloadURL  https://raw.githubusercontent.com/yuhaung/notion-web-clipper/main/notion-web-clipper.user.js
// ==/UserScript==

(function () {
    'use strict';

    // 防重复
    const oldHost = document.getElementById('nc-host');
    if (oldHost) oldHost.remove();

    const host = document.createElement('div');
    host.id = 'nc-host';
    host.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });

    // ==================== 样式 ====================
    const style = document.createElement('style');
    style.textContent = `
        :host { all: initial; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: sans-serif; }
        .nc-clipper-btn {
            position: fixed;
            width: 50px; height: 50px; border-radius: 50%;
            background: #2383e2; color: #fff;
            border: 2px solid #fff; cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-size: 24px; display: flex;
            align-items: center; justify-content: center;
            transition: left 0.25s ease, top 0.25s ease, opacity 0.2s ease;
            user-select: none; touch-action: none;
            opacity: 1;
            left: auto; right: 20px; top: auto; bottom: 20px;
        }
        .nc-clipper-btn:hover { background: #1b6ec2; }
        .nc-clipper-btn.nc-hidden-edge { opacity: 0.5; }
        .nc-select-tip {
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.85); color: #fff;
            padding: 10px 20px; border-radius: 24px;
            font-size: 14px; pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            display: none;
        }
        .nc-highlight-overlay {
            position: fixed; top: 0; left: 0; width: 0; height: 0;
            border: 3px solid #2383e2; background: rgba(35, 131, 226, 0.08);
            pointer-events: none; display: none;
        }
        .nc-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); display: none;
            align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .nc-modal {
            background: white; padding: 24px; border-radius: 12px;
            width: 550px; max-width: 90vw; max-height: 85vh; overflow-y: auto;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            display: flex; flex-direction: column; gap: 12px;
        }
        .nc-modal h2 { margin: 0; font-size: 18px; color: #333; }
        .nc-modal label { font-size: 13px; color: #555; font-weight: 600; margin-top: 4px; }
        .nc-modal input, .nc-modal textarea {
            width: 100%; padding: 10px; border: 1px solid #ddd;
            border-radius: 6px; font-size: 14px;
        }
        .nc-modal textarea {
            height: 200px; resize: vertical;
            font-family: monospace; font-size: 13px; line-height: 1.5;
        }
        .nc-btn-row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
        .nc-btn {
            padding: 9px 18px; border: none; border-radius: 6px;
            cursor: pointer; font-weight: 600; font-size: 14px;
        }
        .nc-btn-primary { background: #2383e2; color: #fff; }
        .nc-btn-primary:hover { background: #1b6ec2; }
        .nc-btn-primary:disabled { background: #a0c4e8; cursor: not-allowed; }
        .nc-btn-secondary { background: #f0f0f0; color: #333; }
        .nc-btn-secondary:hover { background: #e0e0e0; }
        .nc-help-text { font-size: 12px; color: #888; margin-top: -6px; line-height: 1.4; }
        .nc-token-wrapper { position: relative; display: flex; align-items: center; }
        .nc-token-wrapper input { flex: 1; padding-right: 40px; }
        .nc-toggle-vis { 
            position: absolute; right: 8px; background: none; border: none; 
            cursor: pointer; font-size: 16px; color: #666; padding: 4px; 
        }
        .nc-preview-box {
            border: 1px solid #eee; border-radius: 8px;
            padding: 12px; margin-top: 8px;
            max-height: 250px; overflow-y: auto;
            background: #fafafa; font-size: 13px; line-height: 1.6;
        }
        .nc-preview-box img { max-width: 100%; max-height: 150px; display: block; margin: 8px 0; border-radius: 4px; }
        .nc-preview-box p { margin: 4px 0; color: #333; white-space: pre-wrap; }
        .nc-preview-box h1, .nc-preview-box h2, .nc-preview-box h3 { margin: 8px 0 4px; color: #111; }
        .nc-preview-box h1 { font-size: 1.4em; }
        .nc-preview-box h2 { font-size: 1.2em; }
        .nc-preview-box h3 { font-size: 1.1em; }
        .nc-preview-box li { margin-left: 1.5em; list-style: disc; }
        .nc-preview-box blockquote { border-left: 3px solid #2383e2; padding-left: 10px; color: #555; margin: 8px 0; }
        .nc-preview-box pre { background: #f0f0f0; padding: 8px; border-radius: 4px; white-space: pre-wrap; font-family: monospace; }
        .nc-video-preview, .nc-embed-preview {
            color: #2383e2; font-weight: 600; margin: 8px 0;
            background: #eef4fb; padding: 6px 10px; border-radius: 4px;
        }
        .nc-success-message {
            font-size: 15px; color: #2d7d46; font-weight: 600; text-align: center; margin: 8px 0;
        }
    `;
    shadow.appendChild(style);

    // ==================== UI 构建 ====================
    const uiContainer = document.createElement('div');
    uiContainer.innerHTML = `
        <button class="nc-clipper-btn" title="左键选取 / 右键设置">✂️</button>
        <div class="nc-select-tip">🔍 悬停高亮元素，单击提取内容 (Esc取消)</div>
        <div class="nc-highlight-overlay"></div>

        <div class="nc-overlay" id="nc-settings-overlay">
            <div class="nc-modal">
                <h2>⚙️ Notion 配置</h2>
                <label>Integration Token</label>
                <div class="nc-token-wrapper">
                    <input type="text" id="nc-token" placeholder="secret_... 或 ntn_..." autocomplete="off" data-lpignore="true" data-form-type="other" data-bwignore="true">
                    <button class="nc-toggle-vis" id="nc-token-toggle" title="显示/隐藏">👁️</button>
                </div>
                <label>Database ID</label>
                <input type="text" id="nc-db-id" placeholder="32位字符" autocomplete="off">
                <div class="nc-help-text">⚠️ 必须在 Notion 数据库右上角 ... -> Connections 中添加你的 Integration。</div>
                <label>标签属性名 (可选)</label>
                <input type="text" id="nc-tags-prop" placeholder="默认为 Tags，没有可留空" autocomplete="off">
                <div class="nc-btn-row">
                    <button class="nc-btn nc-btn-secondary" id="nc-settings-close">关闭</button>
                    <button class="nc-btn nc-btn-primary" id="nc-settings-save">保存设置</button>
                </div>
            </div>
        </div>

        <div class="nc-overlay" id="nc-confirm-overlay">
            <div class="nc-modal">
                <h2>✂️ 确认发送</h2>
                <label>页面标题</label>
                <input type="text" id="nc-title" autocomplete="off">
                <label>内容预览 (图文视频混合)</label>
                <div class="nc-preview-box" id="nc-preview"></div>
                <label>标签 (逗号分隔，可选)</label>
                <input type="text" id="nc-tags" placeholder="例如: 阅读, 技术" autocomplete="off">
                <div class="nc-btn-row">
                    <button class="nc-btn nc-btn-secondary" id="nc-confirm-cancel">取消</button>
                    <button class="nc-btn nc-btn-primary" id="nc-confirm-send">发送</button>
                </div>
            </div>
        </div>

        <div class="nc-overlay" id="nc-success-overlay">
            <div class="nc-modal" style="text-align: center; gap: 16px;">
                <h2>✅ 成功发送到 Notion！</h2>
                <p class="nc-success-message">页面已创建，点击下方按钮打开</p>
                <div class="nc-btn-row" style="justify-content: center;">
                    <button class="nc-btn nc-btn-primary" id="nc-success-open">打开</button>
                    <button class="nc-btn nc-btn-secondary" id="nc-success-close">关闭</button>
                </div>
            </div>
        </div>
    `;
    shadow.appendChild(uiContainer);

    // ==================== DOM 引用 ====================
    const btn = shadow.querySelector('.nc-clipper-btn');
    const selectTip = shadow.querySelector('.nc-select-tip');
    const highlightOverlay = shadow.querySelector('.nc-highlight-overlay');
    const settingsOverlay = shadow.querySelector('#nc-settings-overlay');
    const confirmOverlay = shadow.querySelector('#nc-confirm-overlay');
    const successOverlay = shadow.querySelector('#nc-success-overlay');
    const previewBox = shadow.querySelector('#nc-preview');
    const tokenInput = shadow.querySelector('#nc-token');
    const dbIdInput = shadow.querySelector('#nc-db-id');
    const tagsPropInput = shadow.querySelector('#nc-tags-prop');
    const titleInput = shadow.querySelector('#nc-title');
    const tagsInput = shadow.querySelector('#nc-tags');
    const sendBtn = shadow.querySelector('#nc-confirm-send');
    const successOpenBtn = shadow.querySelector('#nc-success-open');
    const successCloseBtn = shadow.querySelector('#nc-success-close');
    const tokenToggle = shadow.querySelector('#nc-token-toggle');

    // ==================== 状态变量 ====================
    let isSelecting = false;
    let isConfirmOpen = false;
    let currentNotionBlocks = [];
    let highlightedEl = null;
    let lastCreatedPageId = null;
    let tokenVisible = false;

    // 拖拽/贴边相关
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let initialLeft = 0, initialTop = 0;
    let lastDragDist = 0;
    let isHidden = false;
    let hiddenEdge = '';

    const BTN_SIZE = 50;
    const VISIBLE_PART = 25;
    const SNAP_THRESHOLD = 30;
    const KEY_LEFT = 'nc_btn_left';
    const KEY_TOP = 'nc_btn_top';
    const KEY_HIDDEN = 'nc_btn_hidden';
    const KEY_EDGE = 'nc_btn_edge';

    function isOurUI(el) { return el === host; }

    // Token 显示切换
    tokenToggle.addEventListener('click', () => {
        tokenVisible = !tokenVisible;
        tokenInput.type = tokenVisible ? 'text' : 'password';
        tokenToggle.textContent = tokenVisible ? '🙈' : '👁️';
    });

    // ==================== 坐标与位置函数 ====================
    function clampFullPos(left, top) {
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        left = Math.max(0, Math.min(left, winW - BTN_SIZE));
        top = Math.max(0, Math.min(top, winH - BTN_SIZE));
        return { left, top };
    }

    function getFullPosFromHidden(edge, hiddenLeft, hiddenTop) {
        const winW = window.innerWidth, winH = window.innerHeight;
        let left = hiddenLeft, top = hiddenTop;
        if (edge === 'left') left = 0;
        else if (edge === 'right') left = winW - BTN_SIZE;
        else if (edge === 'top') top = 0;
        else if (edge === 'bottom') top = winH - BTN_SIZE;
        return clampFullPos(left, top);
    }

    function getHiddenPos(edge, fullLeft, fullTop) {
        const winW = window.innerWidth, winH = window.innerHeight;
        let left = fullLeft, top = fullTop;
        if (edge === 'left') left = -BTN_SIZE + VISIBLE_PART;
        else if (edge === 'right') left = winW - VISIBLE_PART;
        else if (edge === 'top') top = -BTN_SIZE + VISIBLE_PART;
        else if (edge === 'bottom') top = winH - VISIBLE_PART;
        return { left, top };
    }

    function applyPosition(left, top) {
        const { left: clampedLeft, top: clampedTop } = clampFullPos(left, top);
        btn.style.left = clampedLeft + 'px';
        btn.style.top = clampedTop + 'px';
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
    }

    function setFullVisible() {
        btn.classList.remove('nc-hidden-edge');
        isHidden = false;
        hiddenEdge = '';
    }

    function setHidden(edge) {
        btn.classList.add('nc-hidden-edge');
        isHidden = true;
        hiddenEdge = edge;
    }

    function savePosition() {
        let fullLeft, fullTop;
        if (isHidden) {
            const rect = btn.getBoundingClientRect();
            const pos = getFullPosFromHidden(hiddenEdge, rect.left, rect.top);
            fullLeft = pos.left;
            fullTop = pos.top;
        } else {
            const rect = btn.getBoundingClientRect();
            fullLeft = rect.left;
            fullTop = rect.top;
        }
        const clamped = clampFullPos(fullLeft, fullTop);
        GM_setValue(KEY_LEFT, clamped.left);
        GM_setValue(KEY_TOP, clamped.top);
        GM_setValue(KEY_HIDDEN, isHidden);
        GM_setValue(KEY_EDGE, hiddenEdge);
    }

    function loadPosition() {
        const savedLeft = GM_getValue(KEY_LEFT, null);
        const savedTop = GM_getValue(KEY_TOP, null);
        const savedHidden = GM_getValue(KEY_HIDDEN, false);
        const savedEdge = GM_getValue(KEY_EDGE, '');

        if (savedLeft !== null && savedTop !== null) {
            const clamped = clampFullPos(savedLeft, savedTop);
            if (savedHidden && savedEdge) {
                const hiddenPos = getHiddenPos(savedEdge, clamped.left, clamped.top);
                applyPosition(hiddenPos.left, hiddenPos.top);
                setHidden(savedEdge);
            } else {
                applyPosition(clamped.left, clamped.top);
                setFullVisible();
            }
        }
    }

    function snapToEdge(left, top) {
        const winW = window.innerWidth, winH = window.innerHeight;
        let edge = '';
        if (left < SNAP_THRESHOLD) edge = 'left';
        else if (left + BTN_SIZE > winW - SNAP_THRESHOLD) edge = 'right';
        else if (top < SNAP_THRESHOLD) edge = 'top';
        else if (top + BTN_SIZE > winH - SNAP_THRESHOLD) edge = 'bottom';

        if (edge) {
            const hiddenPos = getHiddenPos(edge, left, top);
            applyPosition(hiddenPos.left, hiddenPos.top);
            setHidden(edge);
        } else {
            applyPosition(left, top);
            setFullVisible();
        }
        savePosition();
    }

    // ==================== 按钮拖拽事件 ====================
    btn.addEventListener('mouseenter', () => {
        if (isDragging) return;
        if (isHidden) {
            const rect = btn.getBoundingClientRect();
            const fullPos = getFullPosFromHidden(hiddenEdge, rect.left, rect.top);
            applyPosition(fullPos.left, fullPos.top);
            setFullVisible();
        }
    });

    btn.addEventListener('mouseleave', () => {
        if (isDragging) return;
        if (!isHidden) {
            const rect = btn.getBoundingClientRect();
            snapToEdge(rect.left, rect.top);
        }
    });

    btn.addEventListener('mousedown', (e) => {
        if (e.button === 2) return;
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        btn.style.transition = 'none';
        if (isHidden) {
            const rect = btn.getBoundingClientRect();
            const fullPos = getFullPosFromHidden(hiddenEdge, rect.left, rect.top);
            applyPosition(fullPos.left, fullPos.top);
            setFullVisible();
        }
        const rect = btn.getBoundingClientRect();
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        initialLeft = rect.left;
        initialTop = rect.top;
        document.addEventListener('mousemove', onDragMove, true);
        document.addEventListener('mouseup', onDragEnd, true);
    });

    function onDragMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;
        const winW = window.innerWidth, winH = window.innerHeight;
        newLeft = Math.max(-BTN_SIZE + 8, Math.min(newLeft, winW - 8));
        newTop = Math.max(-BTN_SIZE + 8, Math.min(newTop, winH - 8));
        applyPosition(newLeft, newTop);
    }

    function onDragEnd(e) {
        if (!isDragging) return;
        document.removeEventListener('mousemove', onDragMove, true);
        document.removeEventListener('mouseup', onDragEnd, true);
        isDragging = false;
        btn.style.transition = 'left 0.25s ease, top 0.25s ease, opacity 0.2s ease';
        const rect = btn.getBoundingClientRect();
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        lastDragDist = Math.sqrt(dx*dx + dy*dy);
        snapToEdge(rect.left, rect.top);
    }

    btn.addEventListener('click', (e) => {
        if (lastDragDist > 4) {
            e.preventDefault();
            e.stopPropagation();
            lastDragDist = 0;
            return;
        }
        if (isHidden) {
            e.preventDefault();
            e.stopPropagation();
            const rect = btn.getBoundingClientRect();
            const fullPos = getFullPosFromHidden(hiddenEdge, rect.left, rect.top);
            applyPosition(fullPos.left, fullPos.top);
            setFullVisible();
            savePosition();
            lastDragDist = 0;
            return;
        }
        e.stopPropagation();
        triggerClipper();
        lastDragDist = 0;
    });

    btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        openSettings();
    });

    window.addEventListener('resize', () => {
        if (isHidden) {
            const savedLeft = GM_getValue(KEY_LEFT, null);
            const savedTop = GM_getValue(KEY_TOP, null);
            if (savedLeft !== null && savedTop !== null) {
                const clamped = clampFullPos(savedLeft, savedTop);
                const pos = getHiddenPos(hiddenEdge, clamped.left, clamped.top);
                applyPosition(pos.left, pos.top);
            }
        } else {
            const rect = btn.getBoundingClientRect();
            const clamped = clampFullPos(rect.left, rect.top);
            applyPosition(clamped.left, clamped.top);
        }
    });

    // ==================== 媒体辅助 ====================
    function getRealImageURL(img) {
        if (!img) return null;
        if (img.src && !img.src.startsWith('data:') && !img.src.includes('placeholder')) {
            let url = img.src;
            if (url.startsWith('//')) url = 'https:' + url;
            return url;
        }
        const candidates = [
            img.getAttribute('data-gif'),
            img.getAttribute('data-animated'),
            img.getAttribute('data-original'),
            img.getAttribute('data-actualsrc'),
            img.getAttribute('data-src')
        ];
        for (let url of candidates) {
            if (url && !url.startsWith('data:') && !url.includes('placeholder')) {
                if (url.startsWith('//')) url = 'https:' + url;
                return url;
            }
        }
        return null;
    }

    function isAvatar(img) {
        if (!img) return true;
        const src = img.src || img.getAttribute('data-src') || '';
        if (/\.(gif|webp)($|\?|&)/i.test(src)) return false;
        const rect = img.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width <= 80 || rect.height <= 80)) return true;
        const classNames = ['avatar', 'icon', 'emoji', 'face'];
        if (img.className && classNames.some(c => img.className.toLowerCase().includes(c))) return true;
        let parent = img.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
            if (parent.className && classNames.some(c => parent.className.toLowerCase().includes(c))) return true;
            parent = parent.parentElement;
        }
        if (/avatar|emoji|icon/i.test(src)) return true;
        if (/_(is|xs|s)\.(jpg|jpeg|png|webp)/i.test(src)) return true;
        return false;
    }

    function isZhihuMemberImage(img) {
        if (!isZhihu) return false;
        const className = (img.className || '').toLowerCase();
        if (/member|vip|盐选|pay|lock/.test(className)) return true;
        const src = (img.src || img.getAttribute('data-src') || '').toLowerCase();
        const alt = (img.alt || '').toLowerCase();
        const title = (img.title || '').toLowerCase();
        if (/member|vip|盐选|pay|lock/.test(src + alt + title)) return true;
        let parent = img.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
            const parentClass = (parent.className || '').toLowerCase();
            if (/member|vip|pay|lock|盐选/.test(parentClass)) return true;
            parent = parent.parentElement;
        }
        return false;
    }

    function getVideoURL(videoEl) {
        if (!videoEl) return null;
        if (videoEl.src && !videoEl.src.startsWith('blob:')) return videoEl.src;
        const sources = videoEl.querySelectorAll('source');
        for (const src of sources) if (src.src) return src.src;
        return null;
    }

    function getIframeEmbedURL(iframe) {
        return iframe && iframe.src ? iframe.src : null;
    }

    function getGifPlayerMediaURL(container) {
        const video = container.querySelector('video');
        if (video) {
            const url = getVideoURL(video);
            if (url) return { type: 'video', url };
        }
        const img = container.querySelector('img');
        if (img) {
            const gifSrc = img.getAttribute('data-gif');
            if (gifSrc) return { type: 'image', url: gifSrc };
            const src = getRealImageURL(img);
            if (src && /\.(gif|webp)($|\?|&)/i.test(src)) return { type: 'image', url: src };
            if (src) return { type: 'image', url: src };
        }
        return null;
    }

    function getPageMainImage() {
        let meta = document.querySelector('meta[property="og:image"]');
        if (meta && meta.content) return meta.content;
        meta = document.querySelector('meta[name="twitter:image"]');
        if (meta && meta.content) return meta.content;
        return '';
    }

    function getPageIcon() {
        const links = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
        for (const link of links) {
            if (link.href) return link.href;
        }
        return window.location.origin + '/favicon.ico';
    }

    // ==================== 构建块 ====================
    function buildTextBlock(text) {
        const safeText = text.length > 1990 ? text.substring(0, 1990) + '...' : text;
        return { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: safeText } }] } };
    }
    function buildHeadingBlock(level, text) {
        const type = `heading_${level}`;
        return { object: "block", type, [type]: { rich_text: [{ type: "text", text: { content: text } }] } };
    }
    function buildBulletBlock(text) {
        return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: text } }] } };
    }
    function buildNumberedBlock(text) {
        return { object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: [{ type: "text", text: { content: text } }] } };
    }
    function buildQuoteBlock(text) {
        return { object: "block", type: "quote", quote: { rich_text: [{ type: "text", text: { content: text } }] } };
    }
    function buildCodeBlock(text, language) {
        const code = { object: "block", type: "code", code: { rich_text: [{ type: "text", text: { content: text } }] } };
        if (language) code.code.language = language;
        return code;
    }
    function buildImageBlock(url) {
        return { object: "block", type: "image", image: { type: "external", external: { url } } };
    }
    function buildVideoBlock(url) {
        return { object: "block", type: "video", video: { type: "external", external: { url } } };
    }
    function buildEmbedBlock(url) {
        return { object: "block", type: "embed", embed: { url } };
    }

    // ==================== 知乎清理 ====================
    function cleanZhihuElement(clone) {
        clone.querySelectorAll('.ContentItem-actions, .AnswerItem-actions, .Post-actions, .VoteButtons, .ArticleHeaderActions, .Post-Author, .ContentItem-more, .RichContent-actions, .ContentItem-time, .ContentItem-arrowIcon, .ContentItem-extra, .ContentItem-status, .Reward, .Post-Subtitle, .CornerButtons, .QuestionAnswer-actions, .QuestionAnswer-authorInfo, .QuestionAnswer-meta, .ArticleHeader-info, .FollowButton, .AnswerItem-extra, .AnswerItem-status, .AnswerItem-authorInfo, .AnswerItem-meta, .ContentItem-arrowIcon').forEach(el => el.remove());
        clone.querySelectorAll('.ContentItem-actions, .Post-Author, .Post-Header, .ArticleHeader, .QuestionHeader, .QuestionButtonGroup, .Question-mainColumn .Question-sideColumn, .Question-main .Question-sideColumn, .Question-sideColumn, .QuestionButtonGroup, .Question-actions, .Question-follow, .Question-status').forEach(el => el.remove());
        clone.querySelectorAll('.ContentItem-actions, .Post-bottom, .Article-actions, .Question-related, .Question-answerItem--status, .ContentItem-arrowIcon, .ContentItem-time, .CornerButtons, .Voters, .QuestionAnswer-actions, .RichContent-cover, .RichContent-cover-inner, .Post-bottom, .Article-actions, .Question-related, .Question-sideColumn, .QuestionButtonGroup, .Question-answerItem--status, .ContentItem-arrowIcon, .ContentItem-time, .CornerButtons, .Voters, .ContentItem-more, .ContentItem-extra').forEach(el => el.remove());
        clone.querySelectorAll('.ContentItem-actions, .Post-actions, .QuestionAnswer-actions, .ContentItem-arrowIcon, .ContentItem-time, .CornerButtons, .Question-answerItem--status, .Question-answerItem--arrow, .Question-answerItem--divider, .Question-answerItem--extra, .ContentItem-actions, .ContentItem-extra, .ContentItem-more').forEach(el => el.remove());
        clone.querySelectorAll('img').forEach(img => {
            if (isAvatar(img) || isZhihuMemberImage(img)) img.remove();
        });
        return clone;
    }

    // ==================== 内容解析 ====================
    function parseFragmentToBlocks(fragment) {
        const blocks = [];
        let currentText = '';
        const flushText = (trim = true) => {
            let text = trim ? currentText.trim() : currentText;
            text = text.replace(/\n{3,}/g, '\n\n');
            if (text) blocks.push(buildTextBlock(text));
            currentText = '';
        };
        const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                currentText += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toUpperCase();
                if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'NOSCRIPT') return;

                if (node.classList && node.classList.contains('GifPlayer')) {
                    flushText();
                    const media = getGifPlayerMediaURL(node);
                    if (media) {
                        if (media.type === 'video') blocks.push(buildVideoBlock(media.url));
                        else blocks.push(buildImageBlock(media.url));
                    } else {
                        node.childNodes.forEach(walk);
                    }
                    return;
                }

                if (['SPAN', 'A', 'EM', 'STRONG', 'B', 'I', 'U', 'CODE', 'MARK', 'SMALL', 'SUB', 'SUP'].includes(tag)) {
                    node.childNodes.forEach(walk);
                    return;
                }
                if (tag === 'BR') { currentText += '\n'; return; }
                if (tag === 'IMG') {
                    if (!isAvatar(node) && !isZhihuMemberImage(node)) {
                        flushText();
                        const url = getRealImageURL(node);
                        if (url) blocks.push(buildImageBlock(url));
                    }
                    return;
                }
                if (tag === 'VIDEO') {
                    flushText();
                    const url = getVideoURL(node);
                    if (url) blocks.push(buildVideoBlock(url));
                    return;
                }
                if (tag === 'IFRAME') {
                    flushText();
                    const url = getIframeEmbedURL(node);
                    if (url) blocks.push(buildEmbedBlock(url));
                    return;
                }
                if (/^H[1-6]$/.test(tag)) {
                    flushText(false);
                    const headingText = node.textContent.trim();
                    if (headingText) blocks.push(buildHeadingBlock(parseInt(tag[1]), headingText));
                    currentText = '';
                    return;
                }
                if (tag === 'LI') {
                    flushText(false);
                    const text = node.textContent.trim();
                    if (text) {
                        const parentTag = node.parentElement ? node.parentElement.tagName.toUpperCase() : '';
                        blocks.push(parentTag === 'OL' ? buildNumberedBlock(text) : buildBulletBlock(text));
                    }
                    currentText = '';
                    return;
                }
                if (tag === 'BLOCKQUOTE') {
                    flushText(false);
                    const text = node.textContent.trim();
                    if (text) blocks.push(buildQuoteBlock(text));
                    currentText = '';
                    return;
                }
                if (tag === 'PRE' || (tag === 'DIV' && node.querySelector('pre'))) {
                    flushText(false);
                    const pre = tag === 'PRE' ? node : node.querySelector('pre');
                    if (pre) {
                        const codeText = pre.textContent || '';
                        const language = pre.getAttribute('data-language') || '';
                        blocks.push(buildCodeBlock(codeText, language));
                    }
                    currentText = '';
                    return;
                }
                if (tag === 'FIGURE') {
                    flushText(false);
                    node.childNodes.forEach(walk);
                    return;
                }
                if (['P', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'MAIN', 'UL', 'OL', 'DL', 'TABLE', 'FORM', 'FIELDSET'].includes(tag)) {
                    currentText += '\n';
                    node.childNodes.forEach(walk);
                    currentText += '\n';
                } else {
                    node.childNodes.forEach(walk);
                }
            }
        };
        fragment.childNodes.forEach(walk);
        flushText(false);
        return blocks.filter(b => {
            if (b.type === 'paragraph' && b.paragraph.rich_text[0].text.content.trim() === '') return false;
            return true;
        });
    }

    // ==================== 提取块（加入 Twitter 全对话处理） ====================
    function extractTwitterConversationBlocks() {
        if (!isTwitterStatus) return null;
        const mainContainer = document.querySelector('main[role="main"]') || 
                             document.querySelector('div[data-testid="primaryColumn"]') || 
                             document.body;
        const tweets = mainContainer.querySelectorAll('article[data-testid="tweet"]');
        if (tweets.length < 2) return null; // 只有一条推文则继续正常提取单条

        const allBlocks = [];
        for (let i = 0; i < tweets.length; i++) {
            const clone = tweets[i].cloneNode(true);
            const fragment = document.createDocumentFragment();
            fragment.appendChild(clone);
            const tweetBlocks = parseFragmentToBlocks(fragment);
            if (tweetBlocks.length > 0) {
                if (i > 0) allBlocks.push(buildQuoteBlock('---'));
                allBlocks.push(...tweetBlocks);
            }
        }
        return allBlocks.length > 0 ? allBlocks : null;
    }

    function extractBlocksFromElement(el) {
        // 先尝试提取整个 Twitter 对话
        const twitterConv = extractTwitterConversationBlocks();
        if (twitterConv) return twitterConv;

        // 单独媒体
        if (el.tagName === 'IMG') {
            if (!isAvatar(el) && !isZhihuMemberImage(el)) {
                const url = getRealImageURL(el);
                return url ? [buildImageBlock(url)] : [];
            }
            return [];
        }
        if (el.tagName === 'VIDEO') {
            const url = getVideoURL(el);
            return url ? [buildVideoBlock(url)] : [];
        }
        if (el.tagName === 'IFRAME') {
            const url = getIframeEmbedURL(el);
            return url ? [buildEmbedBlock(url)] : [];
        }
        if (el.classList && el.classList.contains('GifPlayer')) {
            const media = getGifPlayerMediaURL(el);
            if (media) {
                return [media.type === 'video' ? buildVideoBlock(media.url) : buildImageBlock(media.url)];
            }
        }

        const clone = el.cloneNode(true);
        if (isZhihu) cleanZhihuElement(clone);
        const fragment = document.createDocumentFragment();
        fragment.appendChild(clone);
        return parseFragmentToBlocks(fragment);
    }

    // ==================== 平台判断与目标查找 ====================
    const isZhihu = window.location.hostname.includes('zhihu.com');
    const isTwitter = window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com');
    const isTwitterStatus = isTwitter && window.location.pathname.includes('/status/');

    function findBestTarget(element) {
        if (!element || element === document.body || element === document.documentElement) return null;
        if (isOurUI(element)) return null;

        if (element.tagName === 'IMG') return (!isAvatar(element) && !isZhihuMemberImage(element) && getRealImageURL(element)) ? element : null;
        if (element.tagName === 'VIDEO' && getVideoURL(element)) return element;
        if (element.tagName === 'IFRAME' && getIframeEmbedURL(element)) return element;
        if (element.classList && element.classList.contains('GifPlayer')) return element;

        if (isZhihu) {
            const answerSelectors = [
                '.AnswerItem', '.PostIndex-answerItem', '.List-item',
                '.QuestionAnswer-content', '[itemprop="suggestedAnswer"]', '.ContentItem', '.Card',
                '.RichContent', '.RichContent-inner'
            ];
            for (const sel of answerSelectors) {
                const card = element.closest(sel);
                if (card) {
                    const rect = card.getBoundingClientRect();
                    if (rect.width > 50 && rect.height > 100) return card;
                }
            }
        }

        if (isTwitter) {
            // 如果有详情页，优先返回单条推文（实际提取时仍然会获取全部对话）
            const tweet = element.closest('article[data-testid="tweet"]');
            if (tweet) return tweet;
        }

        const blockTags = ['P', 'DIV', 'SECTION', 'ARTICLE', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'CODE', 'TABLE', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER'];
        let current = element;
        while (current && current !== document.body && current !== document.documentElement) {
            if (blockTags.includes(current.tagName)) {
                const rect = current.getBoundingClientRect();
                if (rect.width > 20 && rect.height > 20) return current;
            }
            current = current.parentElement;
        }
        return element.closest('p, div, li, blockquote') || null;
    }

    // ==================== 事件处理 ====================
    function handleMouseMove(e) {
        if (!isSelecting) return;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        if (!target || isOurUI(target)) { removeHighlight(); return; }
        const best = findBestTarget(target);
        if (best) {
            highlightedEl = best;
            const rect = best.getBoundingClientRect();
            highlightOverlay.style.display = 'block';
            highlightOverlay.style.top = rect.top + 'px';
            highlightOverlay.style.left = rect.left + 'px';
            highlightOverlay.style.width = rect.width + 'px';
            highlightOverlay.style.height = rect.height + 'px';
        } else { removeHighlight(); }
    }

    function handleClick(e) {
        if (!isSelecting) return;
        if (isOurUI(e.target)) return;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        if (!target || isOurUI(target)) return;
        const best = findBestTarget(target);
        if (!best) return;
        const blocks = extractBlocksFromElement(best);
        if (blocks.length === 0) { alert('所选元素未提取到有效内容。'); return; }
        stopSelectMode();
        currentNotionBlocks = blocks;
        showConfirmModal(document.title);
        e.preventDefault();
        e.stopPropagation();
    }

    function handleEsc(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (isSelecting) stopSelectMode();
            if (isConfirmOpen) { confirmOverlay.style.display = 'none'; isConfirmOpen = false; }
            if (successOverlay.style.display === 'flex') successOverlay.style.display = 'none';
        }
    }

    function removeHighlight() { highlightOverlay.style.display = 'none'; highlightedEl = null; }

    function startSelectMode() {
        if (isSelecting) stopSelectMode();
        isSelecting = true;
        selectTip.style.display = 'block';
        document.addEventListener('mousemove', handleMouseMove, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', handleEsc, true);
    }

    function stopSelectMode() {
        if (!isSelecting) return;
        isSelecting = false;
        selectTip.style.display = 'none';
        removeHighlight();
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleEsc, true);
    }

    // ==================== 弹窗 ====================
    function renderBlockToPreview(block, container) {
        if (block.type === 'paragraph') {
            const p = document.createElement('p'); p.textContent = block.paragraph.rich_text[0].text.content; container.appendChild(p);
        } else if (block.type.startsWith('heading')) {
            const level = block.type.split('_')[1];
            const h = document.createElement(`h${level}`); h.textContent = block[block.type].rich_text[0].text.content; container.appendChild(h);
        } else if (block.type === 'bulleted_list_item') {
            const li = document.createElement('li'); li.textContent = block.bulleted_list_item.rich_text[0].text.content; container.appendChild(li);
        } else if (block.type === 'numbered_list_item') {
            const li = document.createElement('li'); li.textContent = block.numbered_list_item.rich_text[0].text.content; container.appendChild(li);
        } else if (block.type === 'quote') {
            const bq = document.createElement('blockquote'); bq.textContent = block.quote.rich_text[0].text.content; container.appendChild(bq);
        } else if (block.type === 'code') {
            const pre = document.createElement('pre'); pre.textContent = block.code.rich_text[0].text.content; container.appendChild(pre);
        } else if (block.type === 'image') {
            const img = document.createElement('img'); img.src = block.image.external.url; img.onerror = () => img.style.display = 'none'; container.appendChild(img);
        } else if (block.type === 'video') {
            const div = document.createElement('div'); div.className = 'nc-video-preview'; div.textContent = `🎬 视频: ${block.video.external.url}`; container.appendChild(div);
        } else if (block.type === 'embed') {
            const div = document.createElement('div'); div.className = 'nc-embed-preview'; div.textContent = `📺 嵌入: ${block.embed.url}`; container.appendChild(div);
        }
    }

    function showConfirmModal(title) {
        titleInput.value = title;
        tagsInput.value = '';
        previewBox.innerHTML = '';
        currentNotionBlocks.forEach(block => renderBlockToPreview(block, previewBox));
        confirmOverlay.style.display = 'flex';
        isConfirmOpen = true;
    }

    function openSettings() {
        tokenInput.value = GM_getValue('notion_token', '');
        dbIdInput.value = GM_getValue('notion_db_id', '');
        tagsPropInput.value = GM_getValue('notion_tags_prop', 'Tags');
        tokenInput.type = 'password';
        tokenVisible = false;
        tokenToggle.textContent = '👁️';
        settingsOverlay.style.display = 'flex';
    }

    function triggerClipper() {
        if (!GM_getValue('notion_token') || !GM_getValue('notion_db_id')) {
            alert('请先右键点击 ✂️ 按钮进行 Notion 配置！');
            openSettings();
            return;
        }
        startSelectMode();
    }

    function showSuccessModal(pageId) {
        lastCreatedPageId = pageId;
        successOverlay.style.display = 'flex';
    }

    // ==================== Notion API ====================
    function notionRequest(method, url, data) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method, url,
                headers: {
                    'Authorization': `Bearer ${GM_getValue('notion_token')}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                data: data ? JSON.stringify(data) : null,
                onload: res => res.status >= 200 && res.status < 300 ? resolve(JSON.parse(res.responseText)) : reject(new Error(`API ${res.status}: ${res.responseText}`)),
                onerror: () => reject(new Error('网络请求失败'))
            });
        });
    }

    async function appendBlocks(pageId, blocks) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
            const batch = blocks.slice(i, i + BATCH_SIZE);
            await notionRequest('PATCH', `https://api.notion.com/v1/blocks/${pageId}/children`, { children: batch });
        }
    }

    async function sendToNotion() {
        sendBtn.disabled = true; sendBtn.innerText = '发送中...';
        const dbId = GM_getValue('notion_db_id').replace(/-/g, '');
        const title = titleInput.value || document.title || 'Untitled';
        const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);
        const tagsPropName = GM_getValue('notion_tags_prop', 'Tags').trim();
        try {
            const dbInfo = await notionRequest('GET', `https://api.notion.com/v1/databases/${dbId}`);
            const dbProps = dbInfo.properties;
            let realTitlePropName = 'Name';
            for (const key in dbProps) {
                if (dbProps[key].type === 'title') { realTitlePropName = key; break; }
            }
            const properties = { [realTitlePropName]: { "title": [{ "text": { "content": title.substring(0, 200) } }] } };
            if (tagsPropName && tags.length > 0 && dbProps[tagsPropName]) {
                const propType = dbProps[tagsPropName].type;
                if (propType === 'select') properties[tagsPropName] = { "select": { "name": tags[0] } };
                else if (propType === 'multi_select') properties[tagsPropName] = { "multi_select": tags.map(t => ({ "name": t })) };
            }
            if (dbProps['URL'] && dbProps['URL'].type === 'url') properties['URL'] = { "url": window.location.href };
            if (dbProps['Content Image'] && dbProps['Content Image'].type === 'url') {
                const mainImg = getPageMainImage();
                if (mainImg) properties['Content Image'] = { "url": mainImg };
            }
            if (dbProps['Icon'] && dbProps['Icon'].type === 'url') {
                const icon = getPageIcon();
                if (icon) properties['Icon'] = { "url": icon };
            }

            const children = currentNotionBlocks;
            const firstBatch = children.length <= 100 ? children : children.slice(0, 100);
            const data = { parent: { database_id: dbId }, properties, children: firstBatch };
            const response = await notionRequest('POST', 'https://api.notion.com/v1/pages', data);
            const pageId = response.id;

            if (children.length > 100) {
                const remaining = children.slice(100);
                await appendBlocks(pageId, remaining);
            }

            confirmOverlay.style.display = 'none'; isConfirmOpen = false;
            showSuccessModal(pageId);
        } catch (error) {
            console.error(error);
            if (error.message.includes('403') || error.message.includes('external')) alert(`❌ 发送失败:\n部分图片或视频可能因网站防盗链被 Notion 拒绝。`);
            else alert(`❌ 发送失败:\n${error.message}`);
        } finally { sendBtn.disabled = false; sendBtn.innerText = '发送'; }
    }

    // ==================== 事件绑定 ====================
    shadow.querySelector('#nc-settings-close').addEventListener('click', () => settingsOverlay.style.display = 'none');
    shadow.querySelector('#nc-settings-save').addEventListener('click', () => {
        const token = tokenInput.value.trim(), dbId = dbIdInput.value.trim().replace(/-/g, '');
        if (!token || !dbId) { alert('Token 和 ID 不能为空'); return; }
        GM_setValue('notion_token', token);
        GM_setValue('notion_db_id', dbId);
        GM_setValue('notion_tags_prop', tagsPropInput.value.trim());
        settingsOverlay.style.display = 'none';
        alert('✅ 保存成功！');
    });
    shadow.querySelector('#nc-confirm-cancel').addEventListener('click', () => { confirmOverlay.style.display = 'none'; isConfirmOpen = false; });
    shadow.querySelector('#nc-confirm-send').addEventListener('click', sendToNotion);
    successOpenBtn.addEventListener('click', () => {
        if (!lastCreatedPageId) return;
        const cleanId = lastCreatedPageId.replace(/-/g, '');
        window.open(`https://www.notion.so/${cleanId}`, '_blank');
    });
    successCloseBtn.addEventListener('click', () => { successOverlay.style.display = 'none'; });
    successOverlay.addEventListener('click', (e) => { if (e.target === successOverlay) successOverlay.style.display = 'none'; });

    // ==================== 初始化 ====================
    loadPosition();
})();
