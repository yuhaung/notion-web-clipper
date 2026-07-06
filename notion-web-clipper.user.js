// ==UserScript==
// @name         Notion Web Clipper
// @namespace    https://github.com/yuhaung/notion-web-clipper
// @version      2.1.3
// @description  悬停高亮 + 单击选取，保留超链接、富文本、表格/折叠块，知乎自动提取作者，高清图标，自动标签，Twitter 优化，大图隐藏按钮。修复表格块 cells 必须为数组的问题。
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

    // 防 iframe 重复
    if (window.self !== window.top) return;

    const oldHost = document.getElementById('nc-host');
    if (oldHost) oldHost.remove();

    const host = document.createElement('div');
    host.id = 'nc-host';
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });

    // ==================== 常量 ====================
    const NOTION_TEXT_MAX_LEN = 2000;
    const NOTION_BATCH_SIZE = 100;
    const BTN_SIZE = 50;
    const VISIBLE_PART = 25;
    const SNAP_THRESHOLD = 30;
    const LARGE_IMG_THRESHOLD = 0.8;
    const API_RETRY_MAX = 3;

    const STORAGE_KEYS = {
        TOKEN: 'notion_token',
        DB_ID: 'notion_db_id',
        TAGS_PROP: 'notion_tags_prop',
        BTN_LEFT: 'nc_btn_left',
        BTN_TOP: 'nc_btn_top',
        BTN_HIDDEN: 'nc_btn_hidden',
        BTN_EDGE: 'nc_btn_edge',
    };

    const BLOCK_TAGS = new Set(['P','DIV','SECTION','ARTICLE','LI','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','PRE','TABLE','ASIDE','MAIN','HEADER','FOOTER']);
    const INLINE_TAGS = new Set(['SPAN','A','EM','STRONG','B','I','U','CODE','MARK','SMALL','SUB','SUP','S','DEL']);
    const LEAF_BLOCK_TAGS = new Set(['PRE','TABLE']);
    const SKIP_TAGS = new Set(['STYLE','SCRIPT','NOSCRIPT']);

    const ZHIHU_REMOVE_SELECTORS = [
        '.ContentItem-actions','.Post-actions','.VoteButtons',
        '.ArticleHeaderActions','.ContentItem-more','.RichContent-actions',
        '.ContentItem-time','.ContentItem-arrowIcon','.ContentItem-extra','.ContentItem-status',
        '.Reward','.Post-Subtitle','.CornerButtons','.QuestionAnswer-actions',
        '.QuestionAnswer-meta','.ArticleHeader-info','.FollowButton',
        '.AnswerItem-extra','.AnswerItem-status',
        '.ContentItem-arrowIcon','.Post-Header','.ArticleHeader','.QuestionHeader',
        '.QuestionButtonGroup','.Question-mainColumn .Question-sideColumn','.Question-sideColumn',
        '.Question-actions','.Question-follow','.Question-status','.Post-bottom','.Article-actions',
        '.Question-related','.Question-answerItem--status','.Question-answerItem--arrow',
        '.Question-answerItem--divider','.Question-answerItem--extra','.RichContent-cover',
        '.RichContent-cover-inner','.Voters','.ContentItem-more','.ContentItem-extra'
    ];

    // ==================== 简写 DOM 查询 ====================
    const $ = (sel, base = shadow) => base.querySelector(sel);
    const $$ = (sel, base = shadow) => base.querySelectorAll(sel);

    // ==================== 样式（完整） ====================
    const style = document.createElement('style');
    style.textContent = `
        :host { all:initial; }
        * { box-sizing:border-box; margin:0; padding:0; font-family:sans-serif; }
        .nc-clipper-btn {
            position:fixed; width:50px; height:50px; border-radius:50%;
            background:#2383e2; color:#fff; border:2px solid #fff; cursor:pointer;
            box-shadow:0 4px 12px rgba(0,0,0,0.3); font-size:24px;
            display:flex; align-items:center; justify-content:center;
            transition: left 0.25s ease, top 0.25s ease, opacity 0.2s ease;
            user-select:none; touch-action:none; opacity:1;
            left:auto; right:20px; top:auto; bottom:20px;
        }
        .nc-clipper-btn:hover { background:#1b6ec2; }
        .nc-clipper-btn.nc-hidden-edge { opacity:0.5; }
        .nc-select-tip {
            position:fixed; top:20px; left:50%; transform:translateX(-50%);
            background:rgba(0,0,0,0.85); color:#fff; padding:10px 20px;
            border-radius:24px; font-size:14px; pointer-events:none;
            box-shadow:0 4px 12px rgba(0,0,0,0.2); display:none;
        }
        .nc-highlight-overlay {
            position:fixed; top:0; left:0; width:0; height:0;
            border:3px solid #2383e2; background:rgba(35,131,226,0.08);
            pointer-events:none; display:none;
            transition: all 0.1s ease;
        }
        .nc-overlay {
            position:fixed; top:0; left:0; width:100%; height:100%;
            background:rgba(0,0,0,0.6); display:none;
            align-items:center; justify-content:center;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        }
        .nc-modal {
            background:white; padding:24px; border-radius:12px;
            width:550px; max-width:90vw; max-height:85vh; overflow-y:auto;
            box-shadow:0 10px 25px rgba(0,0,0,0.2);
            display:flex; flex-direction:column; gap:12px;
        }
        .nc-modal h2 { margin:0; font-size:18px; color:#333; }
        .nc-modal label { font-size:13px; color:#555; font-weight:600; margin-top:4px; }
        .nc-modal input, .nc-modal textarea {
            width:100%; padding:10px; border:1px solid #ddd;
            border-radius:6px; font-size:14px;
        }
        .nc-modal textarea {
            height:200px; resize:vertical;
            font-family:monospace; font-size:13px; line-height:1.5;
        }
        .nc-btn-row { display:flex; gap:10px; justify-content:flex-end; margin-top:12px; }
        .nc-btn {
            padding:9px 18px; border:none; border-radius:6px;
            cursor:pointer; font-weight:600; font-size:14px;
        }
        .nc-btn-primary { background:#2383e2; color:#fff; }
        .nc-btn-primary:hover { background:#1b6ec2; }
        .nc-btn-primary:disabled { background:#a0c4e8; cursor:not-allowed; }
        .nc-btn-secondary { background:#f0f0f0; color:#333; }
        .nc-btn-secondary:hover { background:#e0e0e0; }
        .nc-help-text { font-size:12px; color:#888; margin-top:-6px; line-height:1.4; }
        .nc-token-wrapper { position:relative; display:flex; align-items:center; }
        .nc-token-wrapper input { flex:1; padding-right:40px; }
        .nc-toggle-vis {
            position:absolute; right:8px; background:none; border:none;
            cursor:pointer; font-size:16px; color:#666; padding:4px;
        }
        .nc-preview-box {
            border:1px solid #eee; border-radius:8px;
            padding:12px; margin-top:8px;
            max-height:250px; overflow-y:auto;
            background:#fafafa; font-size:13px; line-height:1.6;
            user-select:text; -webkit-user-select:text; outline:none;
        }
        .nc-preview-box img { max-width:100%; max-height:150px; display:block; margin:8px 0; border-radius:4px; }
        .nc-preview-box p { margin:4px 0; color:#333; white-space:pre-wrap; user-select:text; -webkit-user-select:text; }
        .nc-preview-box h1,.nc-preview-box h2,.nc-preview-box h3 { margin:8px 0 4px; color:#111; user-select:text; -webkit-user-select:text; }
        .nc-preview-box h1 { font-size:1.4em; }
        .nc-preview-box h2 { font-size:1.2em; }
        .nc-preview-box h3 { font-size:1.1em; }
        .nc-preview-box li { margin-left:1.5em; list-style:disc; user-select:text; -webkit-user-select:text; }
        .nc-preview-box blockquote { border-left:3px solid #2383e2; padding-left:10px; color:#555; margin:8px 0; user-select:text; -webkit-user-select:text; }
        .nc-preview-box pre { background:#f0f0f0; padding:8px; border-radius:4px; white-space:pre-wrap; font-family:monospace; user-select:text; -webkit-user-select:text; }
        .nc-video-preview,.nc-embed-preview {
            color:#2383e2; font-weight:600; margin:8px 0;
            background:#eef4fb; padding:6px 10px; border-radius:4px;
            user-select:text; -webkit-user-select:text;
        }
        .nc-preview-item {
            position:relative; margin:2px 0;
        }
        .nc-preview-delete {
            position:absolute; top:2px; right:2px;
            width:20px; height:20px;
            background:#ff3b30; color:#fff;
            border:none; border-radius:50%;
            font-size:12px; line-height:20px;
            text-align:center; cursor:pointer;
            opacity:0; transition:opacity 0.15s;
            z-index:2; pointer-events:auto;
        }
        .nc-preview-item:hover .nc-preview-delete { opacity:1; }
        .nc-success-message {
            font-size:15px; color:#2d7d46; font-weight:600; text-align:center; margin:8px 0;
        }
        .nc-toast-container {
            position:fixed; top:20px; right:20px; z-index:2147483647;
            display:flex; flex-direction:column; gap:8px; pointer-events:none;
        }
        .nc-toast {
            padding:12px 20px; border-radius:6px; color:#fff; font-size:14px;
            box-shadow:0 4px 12px rgba(0,0,0,0.15); pointer-events:auto;
            animation: nc-toast-in 0.3s ease;
            display:flex; align-items:center; gap:8px;
            max-width:300px; word-break:break-word;
        }
        .nc-toast-success { background:#2d7d46; }
        .nc-toast-error { background:#d32f2f; }
        @keyframes nc-toast-in {
            from { opacity:0; transform:translateX(50px); }
            to { opacity:1; transform:translateX(0); }
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
                <label>内容预览 (Ctrl+A 全选框内文本，点击 ❌ 删除块)</label>
                <div class="nc-preview-box" id="nc-preview" tabindex="0"></div>
                <label>标签 (逗号分隔，可选)</label>
                <input type="text" id="nc-tags" placeholder="例如: 阅读, 技术" autocomplete="off">
                <div class="nc-btn-row">
                    <button class="nc-btn nc-btn-secondary" id="nc-confirm-cancel">取消</button>
                    <button class="nc-btn nc-btn-primary" id="nc-confirm-send">发送</button>
                </div>
            </div>
        </div>

        <div class="nc-overlay" id="nc-success-overlay">
            <div class="nc-modal" style="text-align:center; gap:16px;">
                <h2>✅ 成功发送到 Notion！</h2>
                <p class="nc-success-message">页面已创建，点击下方按钮打开</p>
                <div class="nc-btn-row" style="justify-content:center;">
                    <button class="nc-btn nc-btn-primary" id="nc-success-open">打开</button>
                    <button class="nc-btn nc-btn-secondary" id="nc-success-close">关闭</button>
                </div>
            </div>
        </div>

        <div class="nc-toast-container" id="nc-toast-container"></div>
    `;
    shadow.appendChild(uiContainer);

    // ==================== DOM 引用 ====================
    const btn = $('.nc-clipper-btn');
    const selectTip = $('.nc-select-tip');
    const highlightOverlay = $('.nc-highlight-overlay');
    const settingsOverlay = $('#nc-settings-overlay');
    const confirmOverlay = $('#nc-confirm-overlay');
    const successOverlay = $('#nc-success-overlay');
    const previewBox = $('#nc-preview');
    const tokenInput = $('#nc-token');
    const dbIdInput = $('#nc-db-id');
    const tagsPropInput = $('#nc-tags-prop');
    const titleInput = $('#nc-title');
    const tagsInput = $('#nc-tags');
    const sendBtn = $('#nc-confirm-send');
    const successOpenBtn = $('#nc-success-open');
    const successCloseBtn = $('#nc-success-close');
    const tokenToggle = $('#nc-token-toggle');
    const toastContainer = $('#nc-toast-container');

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

    // 大图隐藏相关
    let isHiddenForLargeImage = false;

    // 缓存页面图标
    let cachedPageIcon = null;

    function isOurUI(el) { return el === host; }

    // ==================== Toast 通知 ====================
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `nc-toast nc-toast-${type}`;
        const span = document.createElement('span');
        span.textContent = message;
        toast.appendChild(span);
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = 'opacity 0.3s ease';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    const alert = (msg) => showToast(msg, 'error');

    // Token 显示切换
    tokenToggle.addEventListener('click', () => {
        tokenVisible = !tokenVisible;
        tokenInput.type = tokenVisible ? 'text' : 'password';
        tokenToggle.textContent = tokenVisible ? '🙈' : '👁️';
    });

    // ==================== 坐标与位置函数 ====================
    function clampFullPos(left, top) {
        const winW = innerWidth;
        const winH = innerHeight;
        left = Math.max(0, Math.min(left, winW - BTN_SIZE));
        top = Math.max(0, Math.min(top, winH - BTN_SIZE));
        return { left, top };
    }

    function getFullPosFromHidden(edge, hiddenLeft, hiddenTop) {
        const winW = innerWidth, winH = innerHeight;
        let left = hiddenLeft, top = hiddenTop;
        if (edge === 'left') left = 0;
        else if (edge === 'right') left = winW - BTN_SIZE;
        else if (edge === 'top') top = 0;
        else if (edge === 'bottom') top = winH - BTN_SIZE;
        return clampFullPos(left, top);
    }

    function getHiddenPos(edge, fullLeft, fullTop) {
        const winW = innerWidth, winH = innerHeight;
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
        GM_setValue(STORAGE_KEYS.BTN_LEFT, clamped.left);
        GM_setValue(STORAGE_KEYS.BTN_TOP, clamped.top);
        GM_setValue(STORAGE_KEYS.BTN_HIDDEN, isHidden);
        GM_setValue(STORAGE_KEYS.BTN_EDGE, hiddenEdge);
    }

    function loadPosition() {
        const savedLeft = GM_getValue(STORAGE_KEYS.BTN_LEFT, null);
        const savedTop = GM_getValue(STORAGE_KEYS.BTN_TOP, null);
        const savedHidden = GM_getValue(STORAGE_KEYS.BTN_HIDDEN, false);
        const savedEdge = GM_getValue(STORAGE_KEYS.BTN_EDGE, '');

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
        const winW = innerWidth, winH = innerHeight;
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
        if (isDragging || isHiddenForLargeImage) return;
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
        const winW = innerWidth, winH = innerHeight;
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
            const savedLeft = GM_getValue(STORAGE_KEYS.BTN_LEFT, null);
            const savedTop = GM_getValue(STORAGE_KEYS.BTN_TOP, null);
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

    // ==================== 大图检测，自动隐藏按钮 ====================
    function isLargeImage(img) {
        const rect = img.getBoundingClientRect();
        return rect.width >= innerWidth * LARGE_IMG_THRESHOLD || rect.height >= innerHeight * LARGE_IMG_THRESHOLD;
    }

    document.addEventListener('mousemove', function(e) {
        if (isDragging || isSelecting) return;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        if (target && target.tagName === 'IMG' && isLargeImage(target)) {
            if (!isHiddenForLargeImage) {
                isHiddenForLargeImage = true;
                btn.style.display = 'none';
            }
        } else {
            if (isHiddenForLargeImage) {
                isHiddenForLargeImage = false;
                btn.style.display = '';
                if (isHidden) {
                    const savedLeft = GM_getValue(STORAGE_KEYS.BTN_LEFT, null);
                    const savedTop = GM_getValue(STORAGE_KEYS.BTN_TOP, null);
                    if (savedLeft !== null && savedTop !== null) {
                        const pos = getHiddenPos(hiddenEdge, savedLeft, savedTop);
                        applyPosition(pos.left, pos.top);
                        setHidden(hiddenEdge);
                    }
                } else {
                    loadPosition();
                }
            }
        }
    }, true);

    // ==================== 媒体辅助函数 ====================
    function getRealImageURL(img) {
        if (!img) return null;
        if (img.src && !img.src.startsWith('data:') && !img.src.includes('placeholder')) {
            let url = img.src;
            if (url.startsWith('//')) url = 'https:' + url;
            return url;
        }
        const candidates = ['data-gif','data-animated','data-original','data-actualsrc','data-src'];
        for (const attr of candidates) {
            let url = img.getAttribute(attr);
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
        const classNames = ['avatar','icon','emoji','face'];
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
        const src = (img.src || img.getAttribute('data-src') || '').toLowerCase();
        const alt = (img.alt || '').toLowerCase();
        const title = (img.title || '').toLowerCase();
        const combined = [className, src, alt, title].join(' ');
        if (/member|vip|盐选|pay|lock/.test(combined)) return true;
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
        const og = document.querySelector('meta[property="og:image"]');
        if (og?.content) return og.content;
        const tw = document.querySelector('meta[name="twitter:image"]');
        if (tw?.content) return tw.content;
        return '';
    }

    function getPageIcon() {
        if (cachedPageIcon !== null) return cachedPageIcon;
        const icons = document.querySelectorAll('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"], link[rel="mask-icon"], link[rel="icon"], link[rel="shortcut icon"]');
        let bestHref = '';
        let bestSize = 0;

        for (const link of icons) {
            const href = link.href;
            if (!href || href.startsWith('data:')) continue;

            if (link.type === 'image/svg+xml' || href.endsWith('.svg')) {
                cachedPageIcon = href;
                return href;
            }

            const sizes = link.getAttribute('sizes');
            if (sizes) {
                const parts = sizes.trim().split(/\s+/);
                for (const part of parts) {
                    const match = part.match(/^(\d+)x(\d+)$/i);
                    if (match) {
                        const area = parseInt(match[1]) * parseInt(match[2]);
                        if (area > bestSize) {
                            bestSize = area;
                            bestHref = href;
                        }
                    } else if (part.toLowerCase() === 'any') {
                        cachedPageIcon = href;
                        return href;
                    }
                }
            } else {
                if (link.rel === 'apple-touch-icon' || link.rel === 'apple-touch-icon-precomposed') {
                    if (180 * 180 > bestSize) {
                        bestSize = 180 * 180;
                        bestHref = href;
                    }
                } else {
                    if (16 * 16 > bestSize) {
                        bestSize = 16 * 16;
                        bestHref = href;
                    }
                }
            }
        }

        if (bestHref) {
            cachedPageIcon = bestHref;
            return bestHref;
        }

        cachedPageIcon = origin + '/favicon.ico';
        return cachedPageIcon;
    }

    // ==================== 构建块 ====================
    function buildTextBlock(text) {
        const safeText = text.length > NOTION_TEXT_MAX_LEN - 10 ? text.substring(0, NOTION_TEXT_MAX_LEN - 10) + '...' : text;
        return { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: safeText } }] } };
    }

    function buildRichTextBlock(richTextArray) {
        let totalLen = 0;
        const truncated = [];
        for (const item of richTextArray) {
            if (totalLen >= NOTION_TEXT_MAX_LEN) break;
            let content = item.text.content;
            if (totalLen + content.length > NOTION_TEXT_MAX_LEN) {
                content = content.substring(0, NOTION_TEXT_MAX_LEN - totalLen) + '...';
            }
            totalLen += content.length;
            const element = {
                type: "text",
                text: {
                    content: content,
                    link: item.text.link || undefined
                }
            };
            if (item.annotations) element.annotations = item.annotations;
            truncated.push(element);
        }
        return { object: "block", type: "paragraph", paragraph: { rich_text: truncated } };
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
        const lang = language || 'plain text';
        return { object: "block", type: "code", code: { rich_text: [{ type: "text", text: { content: text } }], language: lang } };
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

    // 🔧 修复：强制 cells 为数组，并限制列数
    function buildTableBlock(rows, hasHeader) {
        const safeRows = rows.filter(r => Array.isArray(r));
        const tableRows = safeRows.map(row => {
            const cells = row.slice(0, 5).map(cell => [{ type: "text", text: { content: String(cell || '') } }]);
            return { type: "table_row", table_row: { cells } };
        });
        return {
            object: "block",
            type: "table",
            table: {
                table_width: Math.min(safeRows[0]?.length || 1, 5),
                has_column_header: hasHeader,
                children: tableRows
            }
        };
    }

    function buildToggleBlock(summary, children) {
        return { object: "block", type: "toggle", toggle: { rich_text: [{ type: "text", text: { content: summary } }], children: children } };
    }

    // ==================== 知乎清理（保留作者信息） ====================
    function cleanZhihuElement(clone) {
        clone.querySelectorAll(ZHIHU_REMOVE_SELECTORS.join(',')).forEach(el => el.remove());
        clone.querySelectorAll('img').forEach(img => {
            if (isAvatar(img) || isZhihuMemberImage(img)) img.remove();
        });
        return clone;
    }

    function getZhihuAuthorName(element) {
        const authorSelectors = [
            '.UserLink', '.AuthorInfo-name', '.AnswerItem-authorInfo .UserLink',
            '.ContentItem-authorInfo .UserLink', '.Post-Author .UserLink',
            '.AuthorInfo .UserLink', '.AnswerItem-authorInfo a[href*="/people/"]',
            '.ContentItem-authorInfo a[href*="/people/"]'
        ];
        for (const sel of authorSelectors) {
            const el = element.querySelector(sel) || element.closest('.AnswerItem')?.querySelector(sel);
            if (el) {
                return el.textContent.trim().replace(/\s+/g, ' ');
            }
        }
        return null;
    }

    // ==================== 内容解析 ====================
    function parseFragmentToBlocks(fragment) {
        const blocks = [];
        let currentFragments = []; // { text, link, annotations }

        const flushFragments = () => {
            if (currentFragments.length === 0) return;
            const nonEmpty = currentFragments.filter(f => f.text.trim() !== '');
            if (nonEmpty.length === 0) { currentFragments = []; return; }
            const hasLink = nonEmpty.some(f => f.link);
            const hasFormat = nonEmpty.some(f => f.annotations);
            if (hasLink || hasFormat) {
                const richTexts = [];
                let tempText = '';
                for (const frag of nonEmpty) {
                    if (!frag.link && !frag.annotations) {
                        tempText += frag.text;
                    } else {
                        if (tempText) { richTexts.push({ text: { content: tempText } }); tempText = ''; }
                        const element = { text: { content: frag.text } };
                        if (frag.link) element.text.link = { url: frag.link };
                        if (frag.annotations) element.annotations = frag.annotations;
                        richTexts.push(element);
                    }
                }
                if (tempText) richTexts.push({ text: { content: tempText } });
                blocks.push(buildRichTextBlock(richTexts));
            } else {
                const fullText = nonEmpty.map(f => f.text).join('');
                blocks.push(buildTextBlock(fullText));
            }
            currentFragments = [];
        };

        function getInnerText(node) {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent;
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toUpperCase();
                if (tag === 'IMG' || tag === 'VIDEO' || tag === 'IFRAME') return '';
                return Array.from(node.childNodes).map(getInnerText).join('');
            }
            return '';
        }

        function getAnnotations(tag) {
            const annot = {};
            if (tag === 'B' || tag === 'STRONG') annot.bold = true;
            if (tag === 'I' || tag === 'EM') annot.italic = true;
            if (tag === 'U' || tag === 'INS') annot.underline = true;
            if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') annot.strikethrough = true;
            if (tag === 'CODE') annot.code = true;
            return Object.keys(annot).length > 0 ? annot : null;
        }

        const walk = (node, parentAnnotations) => {
            if (node.nodeType === Node.TEXT_NODE) {
                currentFragments.push({ text: node.textContent, link: null, annotations: parentAnnotations });
                return;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toUpperCase();
                if (SKIP_TAGS.has(tag)) return;

                if (node.classList?.contains('GifPlayer')) {
                    flushFragments();
                    const media = getGifPlayerMediaURL(node);
                    if (media) {
                        if (media.type === 'video') blocks.push(buildVideoBlock(media.url));
                        else blocks.push(buildImageBlock(media.url));
                    } else {
                        node.childNodes.forEach(c => walk(c, parentAnnotations));
                    }
                    return;
                }

                // 表格增强
                if (tag === 'TABLE') {
                    flushFragments();
                    const rows = [];
                    let hasHeader = false;
                    const trs = node.querySelectorAll('tr');
                    trs.forEach((tr, idx) => {
                        const cells = [];
                        tr.querySelectorAll('td, th').forEach(cell => cells.push(getInnerText(cell).trim()));
                        if (idx === 0 && tr.querySelector('th')) hasHeader = true;
                        if (cells.length > 0) rows.push(cells);
                    });
                    if (rows.length > 0) blocks.push(buildTableBlock(rows, hasHeader));
                    return;
                }

                if (tag === 'DETAILS') {
                    flushFragments();
                    const summary = node.querySelector('summary');
                    const summaryText = summary ? getInnerText(summary).trim() : '展开';
                    const children = [];
                    Array.from(node.childNodes).forEach(c => {
                        if (c === summary) return;
                        const fragment = document.createDocumentFragment();
                        fragment.appendChild(c.cloneNode(true));
                        const childBlocks = parseFragmentToBlocks(fragment);
                        children.push(...childBlocks);
                    });
                    blocks.push(buildToggleBlock(summaryText, children));
                    return;
                }

                if (tag === 'A') {
                    const href = node.href || '';
                    const linkText = getInnerText(node);
                    if (linkText && href) {
                        currentFragments.push({ text: linkText, link: href, annotations: parentAnnotations });
                    } else if (linkText) {
                        currentFragments.push({ text: linkText, link: null, annotations: parentAnnotations });
                    }
                    return;
                }

                if (INLINE_TAGS.has(tag)) {
                    const newAnnot = getAnnotations(tag) || parentAnnotations;
                    node.childNodes.forEach(c => walk(c, newAnnot));
                    return;
                }

                if (tag === 'BR') {
                    currentFragments.push({ text: '\n', link: null, annotations: parentAnnotations });
                    return;
                }

                if (tag === 'IMG') {
                    if (!isAvatar(node) && !isZhihuMemberImage(node)) {
                        flushFragments();
                        const url = getRealImageURL(node);
                        if (url) blocks.push(buildImageBlock(url));
                    }
                    return;
                }
                if (tag === 'VIDEO') {
                    flushFragments();
                    const url = getVideoURL(node);
                    if (url) blocks.push(buildVideoBlock(url));
                    return;
                }
                if (tag === 'IFRAME') {
                    flushFragments();
                    const url = getIframeEmbedURL(node);
                    if (url) blocks.push(buildEmbedBlock(url));
                    return;
                }

                if (/^H[1-6]$/.test(tag)) {
                    flushFragments();
                    const headingText = getInnerText(node).trim();
                    if (headingText) blocks.push(buildHeadingBlock(parseInt(tag[1]), headingText));
                    return;
                }
                if (tag === 'LI') {
                    flushFragments();
                    const text = getInnerText(node).trim();
                    if (text) {
                        const parentTag = node.parentElement?.tagName.toUpperCase() || '';
                        blocks.push(parentTag === 'OL' ? buildNumberedBlock(text) : buildBulletBlock(text));
                    }
                    return;
                }
                if (tag === 'BLOCKQUOTE') {
                    flushFragments();
                    const text = getInnerText(node).trim();
                    if (text) blocks.push(buildQuoteBlock(text));
                    return;
                }
                // 代码块解析（仅匹配纯代码容器，避免把含代码的回答整体当成代码块）
                if (tag === 'PRE') {
                    flushFragments();
                    const codeText = node.textContent || '';
                    const language = node.getAttribute('data-language') || 'plain text';
                    blocks.push(buildCodeBlock(codeText, language));
                    return;
                }
                if (tag === 'DIV' && node.querySelector('pre') && !node.querySelector('p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, details, article, section')) {
                    flushFragments();
                    const pre = node.querySelector('pre');
                    if (pre) {
                        const codeText = pre.textContent || '';
                        const language = pre.getAttribute('data-language') || 'plain text';
                        blocks.push(buildCodeBlock(codeText, language));
                    }
                    return;
                }
                if (tag === 'FIGURE') {
                    flushFragments();
                    node.childNodes.forEach(c => walk(c, parentAnnotations));
                    return;
                }

                if (BLOCK_TAGS.has(tag)) {
                    flushFragments();
                    node.childNodes.forEach(c => walk(c, parentAnnotations));
                    flushFragments();
                } else {
                    node.childNodes.forEach(c => walk(c, parentAnnotations));
                }
            }
        };

        fragment.childNodes.forEach(c => walk(c, null));
        flushFragments();

        return blocks.filter(b => {
            if (b.type === 'paragraph') {
                const content = b.paragraph?.rich_text?.map(t => t.text?.content || '').join('').trim();
                return content !== '';
            }
            return true;
        });
    }

    // ==================== Twitter 对话提取 ====================
    function extractTwitterConversationBlocks() {
        if (!isTwitterStatus) return null;
        const mainContainer = document.querySelector('main[role="main"]') || document.querySelector('div[data-testid="primaryColumn"]') || document.body;
        const tweets = mainContainer.querySelectorAll('article[data-testid="tweet"]');
        if (tweets.length < 2) return null;
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
        const twitterConv = extractTwitterConversationBlocks();
        if (twitterConv) return twitterConv;

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
        if (el.classList?.contains('GifPlayer')) {
            const media = getGifPlayerMediaURL(el);
            if (media) {
                return [media.type === 'video' ? buildVideoBlock(media.url) : buildImageBlock(media.url)];
            }
        }
        const clone = el.cloneNode(true);
        if (isZhihu) cleanZhihuElement(clone);
        const fragment = document.createDocumentFragment();
        fragment.appendChild(clone);
        let blocks = parseFragmentToBlocks(fragment);
        if (isZhihu) {
            const author = getZhihuAuthorName(el);
            if (author) {
                blocks = [buildTextBlock(`作者：${author}`), ...blocks];
            }
        }
        return blocks;
    }

    // ==================== 平台判断与目标查找 ====================
    const isZhihu = location.hostname.includes('zhihu.com');
    const isTwitter = location.hostname.includes('x.com') || location.hostname.includes('twitter.com');
    const isTwitterStatus = isTwitter && location.pathname.includes('/status/');

    function findBestTarget(element) {
        if (!element || element === document.body || element === document.documentElement) return null;
        if (isOurUI(element)) return null;

        if (element.tagName === 'IMG') return (!isAvatar(element) && !isZhihuMemberImage(element) && getRealImageURL(element)) ? element : null;
        if (element.tagName === 'VIDEO' && getVideoURL(element)) return element;
        if (element.tagName === 'IFRAME' && getIframeEmbedURL(element)) return element;
        if (element.classList?.contains('GifPlayer')) return element;

        if (isZhihu) {
            const answerSelectors = ['.AnswerItem','.PostIndex-answerItem','.List-item','.QuestionAnswer-content','[itemprop="suggestedAnswer"]','.ContentItem','.Card','.RichContent','.RichContent-inner','.Answer','.Post-RichTextContainer','[itemprop="text"]','.RichText','article'];
            for (const sel of answerSelectors) {
                const card = element.closest(sel);
                if (card) {
                    const rect = card.getBoundingClientRect();
                    if (rect.width > 50 && rect.height > 100) return card;
                }
            }
        }

        if (isTwitter) {
            const tweet = element.closest('article[data-testid="tweet"]');
            if (tweet) return tweet;
        }

        const blockTags = ['P','DIV','SECTION','ARTICLE','LI','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','PRE','TABLE','ASIDE','MAIN','HEADER','FOOTER'];
        let current = element;
        let leafBlock = null;
        while (current && current !== document.body && current !== document.documentElement) {
            const tag = current.tagName;
            if (blockTags.includes(tag)) {
                const rect = current.getBoundingClientRect();
                if (rect.width > 20 && rect.height > 20) {
                    if (LEAF_BLOCK_TAGS.has(tag)) {
                        leafBlock = current;
                    } else {
                        return current;
                    }
                }
            }
            current = current.parentElement;
        }
        return leafBlock || element.closest('p, div, li, blockquote') || null;
    }

    // ==================== 事件处理 ====================
    let rafId = null;
    function handleMouseMove(e) {
        if (!isSelecting) return;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
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
        });
    }

    function handleClick(e) {
        if (!isSelecting) return;
        if (isOurUI(e.target)) return;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        if (!target || isOurUI(target)) return;
        const best = findBestTarget(target);
        if (!best) return;
        const blocks = extractBlocksFromElement(best);
        if (blocks.length === 0) { showToast('所选元素未提取到有效内容', 'error'); return; }
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
        }
    }

    function onConfirmKeydown(e) {
        if (!isConfirmOpen) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeConfirmModal();
            return;
        }
        if (e.ctrlKey && e.key === 'a') {
            const active = shadow.activeElement || document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            previewBox.focus();
            const range = document.createRange();
            range.selectNodeContents(previewBox);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    function closeConfirmModal() {
        confirmOverlay.style.display = 'none';
        isConfirmOpen = false;
        document.removeEventListener('keydown', onConfirmKeydown, true);
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
        if (rafId) cancelAnimationFrame(rafId);
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleEsc, true);
    }

    // ==================== 预览渲染（安全） ====================
    function renderBlockToPreview(block, container, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'nc-preview-item';
        wrapper.dataset.index = index;

        const delBtn = document.createElement('button');
        delBtn.className = 'nc-preview-delete';
        delBtn.textContent = '❌';
        delBtn.title = '删除此块';
        wrapper.appendChild(delBtn);

        let content;
        if (block.type === 'paragraph') {
            const p = document.createElement('p');
            if (block.paragraph?.rich_text?.length) {
                for (const rt of block.paragraph.rich_text) {
                    if (rt.text?.link) {
                        const a = document.createElement('a');
                        a.href = rt.text.link.url;
                        a.textContent = rt.text.content;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        p.appendChild(a);
                    } else {
                        const textNode = document.createTextNode(rt.text?.content || '');
                        p.appendChild(textNode);
                    }
                }
            }
            content = p;
        } else if (block.type.startsWith('heading')) {
            const level = block.type.split('_')[1];
            const h = document.createElement(`h${level}`);
            h.textContent = block[block.type]?.rich_text?.[0]?.text?.content || '';
            content = h;
        } else if (block.type === 'bulleted_list_item') {
            const li = document.createElement('li');
            li.textContent = block.bulleted_list_item?.rich_text?.[0]?.text?.content || '';
            content = li;
        } else if (block.type === 'numbered_list_item') {
            const li = document.createElement('li');
            li.textContent = block.numbered_list_item?.rich_text?.[0]?.text?.content || '';
            content = li;
        } else if (block.type === 'quote') {
            const bq = document.createElement('blockquote');
            bq.textContent = block.quote?.rich_text?.[0]?.text?.content || '';
            content = bq;
        } else if (block.type === 'code') {
            const pre = document.createElement('pre');
            pre.textContent = block.code?.rich_text?.[0]?.text?.content || '';
            content = pre;
        } else if (block.type === 'image') {
            const img = document.createElement('img');
            img.src = block.image?.external?.url || '';
            img.onerror = () => img.style.display = 'none';
            content = img;
        } else if (block.type === 'video') {
            const div = document.createElement('div');
            div.className = 'nc-video-preview';
            div.textContent = `🎬 视频: ${block.video?.external?.url || ''}`;
            content = div;
        } else if (block.type === 'embed') {
            const div = document.createElement('div');
            div.className = 'nc-embed-preview';
            div.textContent = `📺 嵌入: ${block.embed?.url || ''}`;
            content = div;
        } else if (block.type === 'table') {
            const table = document.createElement('table');
            table.style.borderCollapse = 'collapse';
            table.style.width = '100%';
            if (block.table?.children) {
                block.table.children.forEach(row => {
                    const tr = document.createElement('tr');
                    row.table_row?.cells?.forEach(cellArr => {
                        const td = document.createElement('td');
                        const text = Array.isArray(cellArr)
                            ? cellArr.map(rt => rt.text?.content || '').join('')
                            : (cellArr?.text?.content || '');
                        td.textContent = text;
                        td.style.border = '1px solid #ccc';
                        td.style.padding = '4px';
                        tr.appendChild(td);
                    });
                    table.appendChild(tr);
                });
            }
            content = table;
        } else if (block.type === 'toggle') {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = block.toggle?.rich_text?.[0]?.text?.content || '';
            details.appendChild(summary);
            if (block.toggle?.children) {
                block.toggle.children.forEach(child => {
                    const childDiv = document.createElement('div');
                    childDiv.style.marginLeft = '1em';
                    renderBlockToPreview(child, childDiv, -1);
                    details.appendChild(childDiv);
                });
            }
            content = details;
        }
        if (content) wrapper.appendChild(content);
        container.appendChild(wrapper);
    }

    function refreshPreview() {
        previewBox.innerHTML = '';
        if (currentNotionBlocks.length === 0) {
            previewBox.textContent = '无内容';
            return;
        }
        currentNotionBlocks.forEach((block, idx) => renderBlockToPreview(block, previewBox, idx));
    }

    previewBox.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.nc-preview-delete');
        if (!deleteBtn) return;
        e.preventDefault();
        e.stopPropagation();
        const item = deleteBtn.closest('.nc-preview-item');
        if (!item) return;
        const index = parseInt(item.dataset.index, 10);
        if (!isNaN(index) && index >= 0 && index < currentNotionBlocks.length) {
            currentNotionBlocks.splice(index, 1);
            refreshPreview();
        }
    });

    function showConfirmModal(title) {
        titleInput.value = title;
        tagsInput.value = '';
        refreshPreview();
        confirmOverlay.style.display = 'flex';
        isConfirmOpen = true;
        document.addEventListener('keydown', onConfirmKeydown, true);
    }

    function openSettings() {
        tokenInput.value = GM_getValue(STORAGE_KEYS.TOKEN, '');
        dbIdInput.value = GM_getValue(STORAGE_KEYS.DB_ID, '');
        tagsPropInput.value = GM_getValue(STORAGE_KEYS.TAGS_PROP, 'Tags');
        tokenInput.type = 'password';
        tokenVisible = false;
        tokenToggle.textContent = '👁️';
        settingsOverlay.style.display = 'flex';
    }

    function triggerClipper() {
        if (!GM_getValue(STORAGE_KEYS.TOKEN) || !GM_getValue(STORAGE_KEYS.DB_ID)) {
            showToast('请先右键点击 ✂️ 按钮进行 Notion 配置！', 'error');
            openSettings();
            return;
        }
        startSelectMode();
    }

    function showSuccessModal(pageId) {
        lastCreatedPageId = pageId;
        successOverlay.style.display = 'flex';
    }

    // ==================== Notion API（带重试） ====================
    async function notionRequest(method, url, data, retries = API_RETRY_MAX) {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method, url,
                        headers: {
                            'Authorization': `Bearer ${GM_getValue(STORAGE_KEYS.TOKEN)}`,
                            'Content-Type': 'application/json',
                            'Notion-Version': '2022-06-28'
                        },
                        data: data ? JSON.stringify(data) : null,
                        onload: (res) => {
                            if (res.status >= 200 && res.status < 300) {
                                resolve(JSON.parse(res.responseText));
                            } else {
                                const msg = (() => {
                                    try { const err = JSON.parse(res.responseText); return err.message || JSON.stringify(err).substring(0, 200); } catch { return res.responseText?.substring(0, 200) || 'Unknown error'; }
                                })();
                                const error = new Error(`API ${res.status}: ${msg}`);
                                error.status = res.status;
                                error.retryAfter = parseInt(res.responseHeaders?.match(/Retry-After: (\d+)/i)?.[1] || 0);
                                reject(error);
                            }
                        },
                        onerror: () => reject(new Error('Network error'))
                    });
                });
                return response;
            } catch (err) {
                if (attempt < retries - 1 && (err.status === 429 || err.status >= 500)) {
                    const delay = Math.max(err.retryAfter * 1000 || 1000 * Math.pow(2, attempt), 1000);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                throw err;
            }
        }
    }

    async function appendBlocks(pageId, blocks) {
        for (let i = 0; i < blocks.length; i += NOTION_BATCH_SIZE) {
            const batch = blocks.slice(i, i + NOTION_BATCH_SIZE);
            await notionRequest('PATCH', `https://api.notion.com/v1/blocks/${pageId}/children`, { children: batch });
        }
    }

    async function sendToNotion() {
        sendBtn.disabled = true; sendBtn.innerText = '发送中...';
        const dbId = GM_getValue(STORAGE_KEYS.DB_ID).replace(/-/g, '');
        const title = titleInput.value || document.title || 'Untitled';
        const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);
        const tagsPropName = GM_getValue(STORAGE_KEYS.TAGS_PROP, 'Tags').trim();
        try {
            const dbInfo = await notionRequest('GET', `https://api.notion.com/v1/databases/${dbId}`);
            let dbProps = dbInfo.properties;

            if (tagsPropName && tags.length > 0 && !dbProps[tagsPropName]) {
                try {
                    await notionRequest('PATCH', `https://api.notion.com/v1/databases/${dbId}`, {
                        properties: { [tagsPropName]: { type: 'multi_select', multi_select: {} } }
                    });
                    dbProps[tagsPropName] = { type: 'multi_select' };
                } catch (e) { console.warn('自动创建标签失败', e); }
            }

            let titleProp = 'Name';
            for (const key in dbProps) if (dbProps[key].type === 'title') { titleProp = key; break; }
            const properties = { [titleProp]: { title: [{ text: { content: title.substring(0, 200) } }] } };
            if (tagsPropName && tags.length > 0 && dbProps[tagsPropName]) {
                const type = dbProps[tagsPropName].type;
                if (type === 'select') properties[tagsPropName] = { select: { name: tags[0] } };
                else if (type === 'multi_select') properties[tagsPropName] = { multi_select: tags.map(t => ({ name: t })) };
            }
            if (dbProps['URL']?.type === 'url') properties['URL'] = { url: location.href };
            if (dbProps['Content Image']?.type === 'url') {
                const img = getPageMainImage();
                if (img) properties['Content Image'] = { url: img };
            }
            if (dbProps['Icon']?.type === 'url') {
                const icon = getPageIcon();
                if (icon) properties['Icon'] = { url: icon };
            }

            const children = currentNotionBlocks;
            const firstBatch = children.length <= NOTION_BATCH_SIZE ? children : children.slice(0, NOTION_BATCH_SIZE);
            const data = { parent: { database_id: dbId }, properties, children: firstBatch };

            const iconUrl = getPageIcon();
            if (iconUrl) data.icon = { type: 'external', external: { url: iconUrl } };

            const response = await notionRequest('POST', 'https://api.notion.com/v1/pages', data);
            const pageId = response.id;

            if (children.length > NOTION_BATCH_SIZE) {
                await appendBlocks(pageId, children.slice(NOTION_BATCH_SIZE));
            }

            closeConfirmModal();
            showSuccessModal(pageId);
        } catch (error) {
            console.error(error);
            const msg = error.message?.substring(0, 200) || '未知错误';
            showToast(`❌ 发送失败: ${msg}`, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerText = '发送';
        }
    }

    // ==================== 事件绑定 ====================
    $('#nc-settings-close').addEventListener('click', () => settingsOverlay.style.display = 'none');
    $('#nc-settings-save').addEventListener('click', () => {
        const token = tokenInput.value.trim(), dbId = dbIdInput.value.trim().replace(/-/g, '');
        if (!token || !dbId) { showToast('Token 和 ID 不能为空', 'error'); return; }
        GM_setValue(STORAGE_KEYS.TOKEN, token);
        GM_setValue(STORAGE_KEYS.DB_ID, dbId);
        GM_setValue(STORAGE_KEYS.TAGS_PROP, tagsPropInput.value.trim());
        settingsOverlay.style.display = 'none';
        showToast('✅ 保存成功！');
    });
    $('#nc-confirm-cancel').addEventListener('click', closeConfirmModal);
    $('#nc-confirm-send').addEventListener('click', sendToNotion);
    successOpenBtn.addEventListener('click', () => {
        if (!lastCreatedPageId) return;
        window.open(`https://www.notion.so/${lastCreatedPageId.replace(/-/g, '')}`, '_blank');
    });
    successCloseBtn.addEventListener('click', () => successOverlay.style.display = 'none');
    successOverlay.addEventListener('click', (e) => { if (e.target === successOverlay) successOverlay.style.display = 'none'; });

    // ==================== 初始化 ====================
    loadPosition();
})();
