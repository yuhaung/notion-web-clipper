// ==UserScript==
// @name         Notion Web Clipper
// @namespace    https://github.com/yuhaung/notion-web-clipper
// @version      2.3.0
// @description  悬停高亮 + 单击选取，保留超链接、富文本、表格/折叠块，知乎自动提取作者，高清图标，自动标签，Twitter 优化，大图隐藏按钮。优化版：修复 H4-H6 标题、表格列数不一致、超长文本、非法代码语言导致的 API 报错；网络错误重试；拖拽/点击体验优化。免疫 addEventListener hook 脚本。
// @author       yuhaung
// @match        *://*/*
// @noframes
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

    // 防 iframe 重复（@noframes 之外的运行时兜底）
    if (window.self !== window.top) return;

    // ==================== 初始化 ====================
    function ncInit() {
        const oldHost = document.getElementById('nc-host');
        if (oldHost) oldHost.remove();

        const host = document.createElement('div');
        host.id = 'nc-host';
        host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
        document.body.appendChild(host);
        const shadow = host.attachShadow({ mode: 'closed' });

        // ==================== 常量 ====================
        // ---- Notion API 限制 ----
        const NOTION_TEXT_MAX_LEN = 2000;      // 单个 rich_text content 上限
        const RICH_TEXT_SAFE_LEN = 1990;       // 预留截断标记空间
        const MAX_RICH_TEXT_ITEMS = 100;       // 每个 block 的 rich_text 数组上限
        const NOTION_BATCH_SIZE = 100;         // 每次请求的 children 上限
        const TABLE_MAX_COLS = 5;              // 表格最大列数（设计取舍）
        const TABLE_MAX_ROWS = 100;            // 单个表格块最大行数
        const MAX_TAG_NAME_LEN = 100;          // select/multi_select 选项名上限
        const MAX_URL_LEN = 2000;              // 外部文件/属性 URL 上限
        const MAX_TOGGLE_NEST = 2;             // API 允许的嵌套层级
        const API_RETRY_MAX = 3;
        const API_TIMEOUT = 30000;

        const BTN_SIZE = 50;
        const VISIBLE_PART = 25;
        const SNAP_THRESHOLD = 30;
        const LARGE_IMG_THRESHOLD = 0.8;

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
        // 补齐 INS / STRIKE，使 getAnnotations 中的规则真正生效
        const INLINE_TAGS = new Set(['SPAN','A','EM','STRONG','B','I','U','INS','CODE','MARK','SMALL','SUB','SUP','S','DEL','STRIKE']);
        const LEAF_BLOCK_TAGS = new Set(['PRE','TABLE']);
        const SKIP_TAGS = new Set(['STYLE','SCRIPT','NOSCRIPT']);

        // 去重后的知乎清理选择器
        const ZHIHU_REMOVE_SELECTORS = [...new Set([
            '.ContentItem-actions','.Post-actions','.VoteButtons',
            '.ArticleHeaderActions','.ContentItem-more','.RichContent-actions',
            '.ContentItem-time','.ContentItem-arrowIcon','.ContentItem-extra','.ContentItem-status',
            '.Reward','.Post-Subtitle','.CornerButtons','.QuestionAnswer-actions',
            '.QuestionAnswer-meta','.ArticleHeader-info','.FollowButton',
            '.AnswerItem-extra','.AnswerItem-status',
            '.Post-Header','.ArticleHeader','.QuestionHeader',
            '.QuestionButtonGroup','.Question-mainColumn .Question-sideColumn','.Question-sideColumn',
            '.Question-actions','.Question-follow','.Question-status','.Post-bottom','.Article-actions',
            '.Question-related','.Question-answerItem--status','.Question-answerItem--arrow',
            '.Question-answerItem--divider','.Question-answerItem--extra','.RichContent-cover',
            '.RichContent-cover-inner','.Voters'
        ])];

        // Notion API 合法的代码语言白名单（非法值会导致 400）
        const NOTION_CODE_LANGS = new Set([
            'abap','agda','arduino','ascii art','assembly','bash','basic','bnf','c','c#','c++',
            'clojure','coffeescript','coq','css','dart','dhall','diff','docker','ebnf','elixir',
            'elm','erlang','f#','flow','fortran','gherkin','glsl','go','graphql','groovy',
            'haskell','hcl','html','idris','java','javascript','json','julia','kotlin','latex',
            'less','lisp','livescript','llvm ir','lua','makefile','markdown','markup','matlab',
            'mathematica','mermaid','nix','objective-c','ocaml','pascal','perl','php','plain text',
            'powershell','prolog','protobuf','purescript','python','r','racket','reason','ruby',
            'rust','sass','scala','scheme','scss','shell','smalltalk','solidity','sql','swift',
            'toml','typescript','vb.net','verilog','vhdl','visual basic','webassembly','xml','yaml'
        ]);
        const LANG_ALIAS = {
            js:'javascript', ts:'typescript', py:'python', sh:'shell', zsh:'bash', fish:'shell',
            cpp:'c++', cxx:'c++', csharp:'c#', golang:'go', rs:'rust', rb:'ruby', kt:'kotlin',
            objc:'objective-c', md:'markdown', yml:'yaml', plaintext:'plain text', txt:'plain text',
            text:'plain text', html5:'html', vue:'html', jsx:'javascript', tsx:'typescript',
            'c++20':'c++', shellsession:'shell', console:'shell', ini:'plain text', conf:'plain text'
        };

        // ==================== 简写 DOM 查询 ====================
        const $ = (sel, base = shadow) => base.querySelector(sel);
        const $$ = (sel, base = shadow) => base.querySelectorAll(sel);

        // ==================== 样式 ====================
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
            .nc-select-mask {
                position:fixed; top:0; left:0; width:100%; height:100%;
                z-index:-1; display:none; cursor:crosshair;
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
            .nc-preview-item { position:relative; margin:2px 0; }
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
            <div class="nc-select-mask"></div>
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
        const selectMask = $('.nc-select-mask');
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

        const isOurUI = (el) => el === host;

        // ==================== Document 级事件分发器 ====================
        // "网页限制解除"等脚本会 hook EventTarget.prototype.addEventListener，
        // 将 mousemove/click/contextmenu 的 handler 替换为 returnTrue 使其失效。
        // 使用 on* 属性赋值注册事件，完全绕过 addEventListener hook。
        // 保留页面已有的 on* handler 以避免破坏原站功能。
        const _prevOnMM = document.onmousemove;
        const _prevOnMU = document.onmouseup;
        let _largeImgCheckTs = 0;
        const LARGE_IMG_CHECK_INTERVAL = 200;

        document.onmousemove = function (e) {
            // 页面原有 handler 出错不应影响本脚本逻辑
            try { if (_prevOnMM) _prevOnMM.call(this, e); } catch (_) { /* 忽略页面脚本错误 */ }
            // 拖拽移动（高优先级，无节流）
            if (isDragging) {
                e.preventDefault();
                const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
                let nL = initialLeft + dx, nT = initialTop + dy;
                nL = Math.max(-BTN_SIZE + 8, Math.min(nL, innerWidth - 8));
                nT = Math.max(-BTN_SIZE + 8, Math.min(nT, innerHeight - 8));
                applyPosition(nL, nT);
                return; // 拖拽中跳过大图检测
            }
            // 选取模式高亮（由 handleMouseMove 内部 RAF 节流）
            if (isSelecting) { handleMouseMove(e); return; }
            // 大图检测（200ms 节流）
            const now = Date.now();
            if (now - _largeImgCheckTs < LARGE_IMG_CHECK_INTERVAL) return;
            _largeImgCheckTs = now;
            const _t = document.elementFromPoint(e.clientX, e.clientY);
            if (_t && _t.tagName === 'IMG' && isLargeImage(_t)) {
                if (!isHiddenForLargeImage) { isHiddenForLargeImage = true; btn.style.display = 'none'; }
            } else if (isHiddenForLargeImage) {
                isHiddenForLargeImage = false;
                btn.style.display = '';
                if (isHidden) {
                    const sL = GM_getValue(STORAGE_KEYS.BTN_LEFT, null);
                    const sT = GM_getValue(STORAGE_KEYS.BTN_TOP, null);
                    if (sL !== null && sT !== null) {
                        const p = getHiddenPos(hiddenEdge, sL, sT);
                        applyPosition(p.left, p.top);
                        setHidden(hiddenEdge);
                    }
                } else { loadPosition(); }
            }
        };

        document.onmouseup = function (e) {
            try { if (_prevOnMU) _prevOnMU.call(this, e); } catch (_) { /* 忽略页面脚本错误 */ }
            if (isDragging) onDragEnd(e);
        };

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

        // Token 显示切换
        tokenToggle.addEventListener('click', () => {
            tokenVisible = !tokenVisible;
            tokenInput.type = tokenVisible ? 'text' : 'password';
            tokenToggle.textContent = tokenVisible ? '🙈' : '👁️';
        });

        // ==================== 坐标与位置函数 ====================
        function clampFullPos(left, top) {
            left = Math.max(0, Math.min(left, innerWidth - BTN_SIZE));
            top = Math.max(0, Math.min(top, innerHeight - BTN_SIZE));
            return { left, top };
        }

        function getFullPosFromHidden(edge, hiddenLeft, hiddenTop) {
            let left = hiddenLeft, top = hiddenTop;
            if (edge === 'left') left = 0;
            else if (edge === 'right') left = innerWidth - BTN_SIZE;
            else if (edge === 'top') top = 0;
            else if (edge === 'bottom') top = innerHeight - BTN_SIZE;
            return clampFullPos(left, top);
        }

        function getHiddenPos(edge, fullLeft, fullTop) {
            let left = fullLeft, top = fullTop;
            if (edge === 'left') left = -BTN_SIZE + VISIBLE_PART;
            else if (edge === 'right') left = innerWidth - VISIBLE_PART;
            else if (edge === 'top') top = -BTN_SIZE + VISIBLE_PART;
            else if (edge === 'bottom') top = innerHeight - VISIBLE_PART;
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
            const rect = btn.getBoundingClientRect();
            let fullLeft = rect.left, fullTop = rect.top;
            if (isHidden) {
                const pos = getFullPosFromHidden(hiddenEdge, rect.left, rect.top);
                fullLeft = pos.left;
                fullTop = pos.top;
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

            if (savedLeft === null || savedTop === null) return;
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

        function snapToEdge(left, top) {
            let edge = '';
            if (left < SNAP_THRESHOLD) edge = 'left';
            else if (left + BTN_SIZE > innerWidth - SNAP_THRESHOLD) edge = 'right';
            else if (top < SNAP_THRESHOLD) edge = 'top';
            else if (top + BTN_SIZE > innerHeight - SNAP_THRESHOLD) edge = 'bottom';

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
        });

        function onDragEnd(e) {
            if (!isDragging) return;
            isDragging = false;
            btn.style.transition = 'left 0.25s ease, top 0.25s ease, opacity 0.2s ease';
            const rect = btn.getBoundingClientRect();
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            lastDragDist = Math.sqrt(dx * dx + dy * dy);
            // 优化：位移极小视为单击，不触发贴边吸附（否则边缘按钮要点两次才能剪藏）
            if (lastDragDist <= 4) { savePosition(); return; }
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

        btn.oncontextmenu = function (e) {
            e.preventDefault();
            e.stopPropagation();
            openSettings();
        };

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

        // ==================== URL 工具 ====================
        // 统一规范化：补全协议相对/根相对 URL，过滤非 http(s)
        function normalizeURL(url) {
            if (!url || typeof url !== 'string') return null;
            url = url.trim();
            if (url.startsWith('//')) url = location.protocol + url;
            else if (url.startsWith('/')) url = location.origin + url;
            if (!/^https?:\/\//i.test(url)) return null;
            return url;
        }

        const isValidHttpURL = (url) => !!url && url.length <= MAX_URL_LEN && /^https?:\/\//i.test(url);

        // ==================== 媒体辅助函数 ====================
        function getRealImageURL(img) {
            if (!img) return null;
            const candidates = ['src', 'data-gif', 'data-animated', 'data-original', 'data-actualsrc', 'data-src'];
            for (const attr of candidates) {
                const raw = attr === 'src' ? img.src : img.getAttribute(attr);
                const url = normalizeURL(raw);
                if (url && !url.includes('placeholder')) return url;
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
            const imgClass = typeof img.className === 'string' ? img.className.toLowerCase() : '';
            if (imgClass && classNames.some(c => imgClass.includes(c))) return true;
            let parent = img.parentElement;
            for (let i = 0; i < 3 && parent; i++) {
                const pClass = typeof parent.className === 'string' ? parent.className.toLowerCase() : '';
                if (pClass && classNames.some(c => pClass.includes(c))) return true;
                parent = parent.parentElement;
            }
            if (/avatar|emoji|icon/i.test(src)) return true;
            if (/_(is|xs|s)\.(jpg|jpeg|png|webp)/i.test(src)) return true;
            return false;
        }

        function isZhihuMemberImage(img) {
            if (!isZhihu) return false;
            const className = (typeof img.className === 'string' ? img.className : '').toLowerCase();
            const src = (img.src || img.getAttribute('data-src') || '').toLowerCase();
            const alt = (img.alt || '').toLowerCase();
            const title = (img.title || '').toLowerCase();
            const combined = [className, src, alt, title].join(' ');
            if (/member|vip|盐选|pay|lock/.test(combined)) return true;
            let parent = img.parentElement;
            for (let i = 0; i < 3 && parent; i++) {
                const parentClass = (typeof parent.className === 'string' ? parent.className : '').toLowerCase();
                if (/member|vip|pay|lock|盐选/.test(parentClass)) return true;
                parent = parent.parentElement;
            }
            return false;
        }

        function getVideoURL(videoEl) {
            if (!videoEl) return null;
            const direct = normalizeURL(videoEl.src);
            if (direct) return direct;
            for (const src of videoEl.querySelectorAll('source')) {
                const url = normalizeURL(src.src);
                if (url) return url;
            }
            return null;
        }

        function getIframeEmbedURL(iframe) {
            return iframe ? normalizeURL(iframe.src) : null;
        }

        function getGifPlayerMediaURL(container) {
            const video = container.querySelector('video');
            if (video) {
                const url = getVideoURL(video);
                if (url) return { type: 'video', url };
            }
            const img = container.querySelector('img');
            if (img) {
                const gifSrc = normalizeURL(img.getAttribute('data-gif'));
                if (gifSrc) return { type: 'image', url: gifSrc };
                const src = getRealImageURL(img);
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
                    for (const part of sizes.trim().split(/\s+/)) {
                        const match = part.match(/^(\d+)x(\d+)$/i);
                        if (match) {
                            const area = parseInt(match[1], 10) * parseInt(match[2], 10);
                            if (area > bestSize) { bestSize = area; bestHref = href; }
                        } else if (part.toLowerCase() === 'any') {
                            cachedPageIcon = href;
                            return href;
                        }
                    }
                } else {
                    const assumed = (link.rel === 'apple-touch-icon' || link.rel === 'apple-touch-icon-precomposed') ? 180 * 180 : 16 * 16;
                    if (assumed > bestSize) { bestSize = assumed; bestHref = href; }
                }
            }

            cachedPageIcon = bestHref || location.origin + '/favicon.ico';
            return cachedPageIcon;
        }

        // ==================== 构建块（全部经过 API 限制校验） ====================
        // 将长文本切分为多个 rich_text item，每项 ≤ 安全长度，总数 ≤ 100
        function splitToRichItems(text) {
            const s = String(text ?? '');
            if (!s) return [{ type: 'text', text: { content: '' } }];
            const items = [];
            let i = 0;
            for (; i < s.length && items.length < MAX_RICH_TEXT_ITEMS; i += RICH_TEXT_SAFE_LEN) {
                items.push({ type: 'text', text: { content: s.slice(i, i + RICH_TEXT_SAFE_LEN) } });
            }
            if (i < s.length) {
                // 超出 100 段上限：在末段追加截断标记
                const last = items[items.length - 1].text.content;
                items[items.length - 1].text.content = last.slice(0, -3) + '...';
            }
            return items;
        }

        function buildSimpleBlock(type, text, extra) {
            return { object: 'block', type, [type]: { rich_text: splitToRichItems(text), ...(extra || {}) } };
        }

        const buildTextBlock = (text) => buildSimpleBlock('paragraph', text);

        function buildRichTextBlock(richTextArray) {
            const out = [];
            for (const item of richTextArray.slice(0, MAX_RICH_TEXT_ITEMS)) {
                const content = String(item.text?.content ?? '');
                const element = {
                    type: 'text',
                    text: {
                        // 每项独立截断，追加标记也不会超限
                        content: content.length > RICH_TEXT_SAFE_LEN ? content.slice(0, RICH_TEXT_SAFE_LEN - 3) + '...' : content,
                        link: item.text?.link || undefined
                    }
                };
                if (item.annotations) element.annotations = item.annotations;
                out.push(element);
            }
            return { object: 'block', type: 'paragraph', paragraph: { rich_text: out } };
        }

        function buildHeadingBlock(level, text) {
            // Notion 仅支持 heading_1/2/3，H4-H6 降级为 H3，避免 400 错误
            const l = Math.min(Math.max(level | 0, 1), 3);
            return buildSimpleBlock(`heading_${l}`, text);
        }

        const buildBulletBlock = (text) => buildSimpleBlock('bulleted_list_item', text);
        const buildNumberedBlock = (text) => buildSimpleBlock('numbered_list_item', text);
        const buildQuoteBlock = (text) => buildSimpleBlock('quote', text);

        function normalizeCodeLang(lang) {
            if (!lang) return 'plain text';
            const s = String(lang).toLowerCase().trim();
            if (NOTION_CODE_LANGS.has(s)) return s;
            return LANG_ALIAS[s] || 'plain text';
        }

        const buildCodeBlock = (text, language) => buildSimpleBlock('code', text, { language: normalizeCodeLang(language) });

        // 媒体块：URL 非法时返回 null，由调用方过滤
        function buildImageBlock(url) {
            if (!isValidHttpURL(url)) return null;
            return { object: 'block', type: 'image', image: { type: 'external', external: { url } } };
        }

        function buildVideoBlock(url) {
            if (!isValidHttpURL(url)) return null;
            return { object: 'block', type: 'video', video: { type: 'external', external: { url } } };
        }

        function buildEmbedBlock(url) {
            if (!isValidHttpURL(url)) return null;
            return { object: 'block', type: 'embed', embed: { url } };
        }

        // 表格：统一所有行列数（API 要求 cells.length === table_width），
        // 超 100 行自动拆分为多个表格块。返回块数组。
        function buildTableBlocks(rows, hasHeader) {
            const safeRows = rows.filter(r => Array.isArray(r) && r.length > 0);
            if (safeRows.length === 0) return [];
            const width = Math.min(Math.max(...safeRows.map(r => r.length)), TABLE_MAX_COLS);
            const normRows = safeRows.map(row => {
                const cells = [];
                for (let i = 0; i < width; i++) {
                    const text = String(row[i] ?? '');
                    cells.push([{ type: 'text', text: { content: text.length > RICH_TEXT_SAFE_LEN ? text.slice(0, RICH_TEXT_SAFE_LEN - 3) + '...' : text } }]);
                }
                return { type: 'table_row', table_row: { cells } };
            });
            const blocks = [];
            for (let i = 0; i < normRows.length; i += TABLE_MAX_ROWS) {
                blocks.push({
                    object: 'block',
                    type: 'table',
                    table: {
                        table_width: width,
                        has_column_header: hasHeader && i === 0,
                        children: normRows.slice(i, i + TABLE_MAX_ROWS)
                    }
                });
            }
            return blocks;
        }

        // API 单请求最多允许 2 层嵌套：拍平 toggle 内的 toggle / table
        function flattenForToggle(children) {
            const out = [];
            for (const b of children) {
                if (!b) continue;
                if (b.type === 'toggle') {
                    const summary = (b.toggle?.rich_text || []).map(t => t.text?.content || '').join('');
                    out.push(buildTextBlock('▸ ' + summary));
                    out.push(...flattenForToggle(b.toggle?.children || []));
                } else if (b.type === 'table') {
                    // toggle 内的表格（第 3 层）会被 API 拒绝，转为文本行
                    for (const row of b.table?.children || []) {
                        const line = (row.table_row?.cells || [])
                            .map(c => Array.isArray(c) ? c.map(t => t.text?.content || '').join('') : '')
                            .join(' | ');
                        if (line.trim()) out.push(buildTextBlock(line));
                    }
                } else {
                    out.push(b);
                }
            }
            return out;
        }

        function buildToggleBlock(summary, children) {
            const flat = flattenForToggle(children).slice(0, NOTION_BATCH_SIZE);
            const toggle = { rich_text: splitToRichItems(summary) };
            if (flat.length > 0) toggle.children = flat;
            return { object: 'block', type: 'toggle', toggle };
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
                if (el) return el.textContent.trim().replace(/\s+/g, ' ');
            }
            return null;
        }

        function getZhihuQuestionTitle(element) {
            const container = element.closest('.ContentItem') || element.closest('.Card') || element.closest('[itemprop="suggestedAnswer"]') || element;
            const titleSelectors = [
                '.ContentItem-title',
                'h2.ContentItem-title',
                'h2 a[href*="/question/"]',
                '.QuestionItem-title',
                'h2',
            ];
            for (const sel of titleSelectors) {
                const el = container.querySelector(sel);
                if (el) {
                    const text = el.textContent.trim().replace(/\s+/g, ' ');
                    if (text && text.length >= 4 && text.length <= 200
                        && !/^(查看全部|展开|收起|广告|更多|写回答|关注)/.test(text)
                        && !/^(\d+个?回答|\d+条?评论)/.test(text)) {
                        return text;
                    }
                }
            }
            if (location.pathname.includes('/question/')) {
                const h1 = document.querySelector('.QuestionHeader-title');
                if (h1) {
                    const text = h1.textContent.trim().replace(/\s+/g, ' ');
                    if (text && text.length >= 4) return text;
                }
            }
            return null;
        }

        // ==================== 内容解析 ====================
        function parseFragmentToBlocks(fragment) {
            const blocks = [];
            let currentFragments = [];

            const flushFragments = () => {
                if (currentFragments.length === 0) return;
                const nonEmpty = currentFragments.filter(f => f.text.trim() !== '');
                currentFragments = [];
                if (nonEmpty.length === 0) return;
                const hasLink = hasFormatting(nonEmpty);
                if (hasLink) {
                    const richTexts = [];
                    let tempText = '';
                    for (const frag of nonEmpty) {
                        if (!frag.link && !frag.annotations) {
                            tempText += frag.text;
                        } else {
                            if (tempText) { richTexts.push({ text: { content: tempText } }); tempText = ''; }
                            const element = { text: { content: frag.text } };
                            // 仅保留合法 http(s) 链接，javascript: 等降级为纯文本
                            if (frag.link && /^https?:\/\//i.test(frag.link)) element.text.link = { url: frag.link };
                            if (frag.annotations) element.annotations = frag.annotations;
                            richTexts.push(element);
                        }
                    }
                    if (tempText) richTexts.push({ text: { content: tempText } });
                    blocks.push(buildRichTextBlock(richTexts));
                } else {
                    blocks.push(buildTextBlock(nonEmpty.map(f => f.text).join('')));
                }
            };

            const hasFormatting = (frags) => frags.some(f => f.link || f.annotations);

            function getInnerText(node) {
                if (node.nodeType === Node.TEXT_NODE) return node.textContent;
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const tag = node.tagName.toUpperCase();
                    if (tag === 'IMG' || tag === 'VIDEO' || tag === 'IFRAME') return '';
                    if (tag === 'BR') return '\n';
                    let s = Array.from(node.childNodes).map(getInnerText).join('');
                    // 块级子元素之间补换行，避免多段文字粘连
                    if (BLOCK_TAGS.has(tag) && tag !== 'TABLE') s += '\n';
                    return s;
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
                if (node.nodeType !== Node.ELEMENT_NODE) return;

                const tag = node.tagName.toUpperCase();
                if (SKIP_TAGS.has(tag)) return;

                if (node.classList?.contains('GifPlayer')) {
                    flushFragments();
                    const media = getGifPlayerMediaURL(node);
                    if (media) {
                        const b = media.type === 'video' ? buildVideoBlock(media.url) : buildImageBlock(media.url);
                        if (b) blocks.push(b);
                    } else {
                        node.childNodes.forEach(c => walk(c, parentAnnotations));
                    }
                    return;
                }

                if (tag === 'TABLE') {
                    flushFragments();
                    const rows = [];
                    let hasHeader = false;
                    node.querySelectorAll('tr').forEach((tr, idx) => {
                        const cells = [];
                        tr.querySelectorAll('td, th').forEach(cell => cells.push(getInnerText(cell).trim()));
                        if (idx === 0 && tr.querySelector('th')) hasHeader = true;
                        if (cells.length > 0) rows.push(cells);
                    });
                    blocks.push(...buildTableBlocks(rows, hasHeader));
                    return;
                }

                if (tag === 'DETAILS') {
                    flushFragments();
                    const summary = node.querySelector('summary');
                    const summaryText = summary ? getInnerText(summary).trim() : '展开';
                    const children = [];
                    Array.from(node.childNodes).forEach(c => {
                        if (c === summary) return;
                        const frag = document.createDocumentFragment();
                        frag.appendChild(c.cloneNode(true));
                        children.push(...parseFragmentToBlocks(frag));
                    });
                    blocks.push(buildToggleBlock(summaryText, children));
                    return;
                }

                if (tag === 'A') {
                    const href = node.href || '';
                    const linkText = getInnerText(node);
                    if (linkText) {
                        currentFragments.push({ text: linkText, link: href || null, annotations: parentAnnotations });
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
                        const b = buildImageBlock(getRealImageURL(node));
                        if (b) blocks.push(b);
                    }
                    return;
                }
                if (tag === 'VIDEO') {
                    flushFragments();
                    const b = buildVideoBlock(getVideoURL(node));
                    if (b) blocks.push(b);
                    return;
                }
                if (tag === 'IFRAME') {
                    flushFragments();
                    const b = buildEmbedBlock(getIframeEmbedURL(node));
                    if (b) blocks.push(b);
                    return;
                }

                if (/^H[1-6]$/.test(tag)) {
                    flushFragments();
                    const headingText = getInnerText(node).trim();
                    if (headingText) blocks.push(buildHeadingBlock(parseInt(tag[1], 10), headingText));
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
                if (tag === 'PRE') {
                    flushFragments();
                    blocks.push(buildCodeBlock(node.textContent || '', node.getAttribute('data-language')));
                    return;
                }
                // 纯代码容器（含 pre 但无其他段落类内容）整体视为代码块
                if (tag === 'DIV' && node.querySelector('pre') && !node.querySelector('p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, details, article, section')) {
                    flushFragments();
                    const pre = node.querySelector('pre');
                    blocks.push(buildCodeBlock(pre.textContent || '', pre.getAttribute('data-language')));
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
            };

            fragment.childNodes.forEach(c => walk(c, null));
            flushFragments();

            // 过滤 null（非法媒体 URL）与空段落
            return blocks.filter(b => {
                if (!b) return false;
                if (b.type === 'paragraph') {
                    const content = (b.paragraph?.rich_text || []).map(t => t.text?.content || '').join('').trim();
                    return content !== '';
                }
                return true;
            });
        }

        // ==================== Twitter 媒体提取 ====================
        // 图片质量升级：name=small/medium/large/360x360/900x900 → name=orig
        function upgradeTwitterImageURL(url) {
            if (!url) return url;
            return url.replace(/([?&])name=(small|medium|large|360x360|900x900)\b/i, '$1name=orig');
        }

        function extractTwitterMediaBlocks(tweetEl) {
            const mediaBlocks = [];
            const seen = new Set(); // URL 去重
            const pushImage = (rawUrl) => {
                const url = upgradeTwitterImageURL(normalizeURL(rawUrl));
                if (!url || url.includes('placeholder') || seen.has(url)) return;
                const b = buildImageBlock(url);
                if (b) { seen.add(url); mediaBlocks.push(b); }
            };

            tweetEl.querySelectorAll('[data-testid="tweetPhoto"]').forEach(photo => {
                const img = photo.querySelector('img');
                if (!img || img.closest('[data-testid="Tweet-User-Avatar"]')) return;
                pushImage(img.src || getRealImageURL(img));
            });

            tweetEl.querySelectorAll('[data-testid="videoPlayer"]').forEach(player => {
                const video = player.querySelector('video');
                if (!video) return;
                let gotVideo = false;
                for (const s of player.querySelectorAll('source')) {
                    const url = normalizeURL(s.src);
                    if (url) {
                        const b = buildVideoBlock(url);
                        if (b && !seen.has(url)) { seen.add(url); mediaBlocks.push(b); gotVideo = true; }
                        break;
                    }
                }
                if (!gotVideo && video.poster) pushImage(video.poster);
            });

            // 兜底：扫描未处理的 img
            const photoImgs = new Set(tweetEl.querySelectorAll('[data-testid="tweetPhoto"] img'));
            const avatarImgs = new Set(tweetEl.querySelectorAll('[data-testid="Tweet-User-Avatar"] img'));
            tweetEl.querySelectorAll('img').forEach(img => {
                if (photoImgs.has(img) || avatarImgs.has(img) || isAvatar(img)) return;
                pushImage(img.src || getRealImageURL(img));
            });
            return mediaBlocks;
        }

        // ==================== Twitter 对话提取 ====================
        function extractTwitterConversationBlocks() {
            if (!isTwitterStatusPage()) return null;
            const mainContainer = document.querySelector('main[role="main"]') || document.querySelector('div[data-testid="primaryColumn"]') || document.body;
            const tweets = mainContainer.querySelectorAll('article[data-testid="tweet"]');
            if (tweets.length < 2) return null;
            const allBlocks = [];
            for (let i = 0; i < tweets.length; i++) {
                const mediaBlocks = extractTwitterMediaBlocks(tweets[i]);
                const clone = tweets[i].cloneNode(true);
                clone.querySelectorAll('img, video, [data-testid="tweetPhoto"], [data-testid="videoPlayer"]').forEach(n => n.remove());
                const fragment = document.createDocumentFragment();
                fragment.appendChild(clone);
                const tweetBlocks = parseFragmentToBlocks(fragment);
                if (tweetBlocks.length > 0 || mediaBlocks.length > 0) {
                    if (i > 0) allBlocks.push(buildQuoteBlock('---'));
                    allBlocks.push(...tweetBlocks, ...mediaBlocks);
                }
            }
            return allBlocks.length > 0 ? allBlocks : null;
        }

        function extractBlocksFromElement(el) {
            const twitterConv = extractTwitterConversationBlocks();
            if (twitterConv) return twitterConv;

            if (el.tagName === 'IMG') {
                if (!isAvatar(el) && !isZhihuMemberImage(el)) {
                    let url = getRealImageURL(el);
                    if (url && isTwitter) url = upgradeTwitterImageURL(url);
                    const b = buildImageBlock(url);
                    return b ? [b] : [];
                }
                return [];
            }
            if (el.tagName === 'VIDEO') {
                const b = buildVideoBlock(getVideoURL(el));
                return b ? [b] : [];
            }
            if (el.tagName === 'IFRAME') {
                const b = buildEmbedBlock(getIframeEmbedURL(el));
                return b ? [b] : [];
            }
            if (el.classList?.contains('GifPlayer')) {
                const media = getGifPlayerMediaURL(el);
                if (media) {
                    const b = media.type === 'video' ? buildVideoBlock(media.url) : buildImageBlock(media.url);
                    return b ? [b] : [];
                }
            }
            if (isTwitter) {
                const tweetArticle = el.closest('article[data-testid="tweet"]');
                if (tweetArticle) {
                    const mediaBlocks = extractTwitterMediaBlocks(tweetArticle);
                    const clone = tweetArticle.cloneNode(true);
                    clone.querySelectorAll('img, video, [data-testid="tweetPhoto"], [data-testid="videoPlayer"]').forEach(n => n.remove());
                    const fragment = document.createDocumentFragment();
                    fragment.appendChild(clone);
                    const textBlocks = parseFragmentToBlocks(fragment);
                    return [...textBlocks, ...mediaBlocks];
                }
            }
            const clone = el.cloneNode(true);
            if (isZhihu) {
                const questionTitle = getZhihuQuestionTitle(el);
                if (questionTitle) {
                    ['.ContentItem-title', 'h2.ContentItem-title'].forEach(sel => {
                        clone.querySelectorAll(sel).forEach(n => n.remove());
                    });
                    cleanZhihuElement(clone);
                    const fragment = document.createDocumentFragment();
                    fragment.appendChild(clone);
                    const blocks = parseFragmentToBlocks(fragment);
                    const prefix = [buildHeadingBlock(2, questionTitle)];
                    const author = getZhihuAuthorName(el);
                    if (author) prefix.push(buildTextBlock(`作者：${author}`));
                    return [...prefix, ...blocks];
                }
                cleanZhihuElement(clone);
            }
            const fragment = document.createDocumentFragment();
            fragment.appendChild(clone);
            let blocks = parseFragmentToBlocks(fragment);
            if (isZhihu) {
                const author = getZhihuAuthorName(el);
                if (author) blocks = [buildTextBlock(`作者：${author}`), ...blocks];
            }
            return blocks;
        }

        // ==================== 平台判断与目标查找 ====================
        const isZhihu = location.hostname.includes('zhihu.com');
        const isTwitter = location.hostname.includes('x.com') || location.hostname.includes('twitter.com');
        // SPA 页面内跳转后 pathname 会变，动态判断而非启动时缓存
        const isTwitterStatusPage = () => isTwitter && location.pathname.includes('/status/');

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

            let current = element;
            let leafBlock = null;
            while (current && current !== document.body && current !== document.documentElement) {
                const tag = current.tagName;
                if (BLOCK_TAGS.has(tag)) {
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

        function positionHighlight(el) {
            const rect = el.getBoundingClientRect();
            highlightOverlay.style.display = 'block';
            highlightOverlay.style.top = rect.top + 'px';
            highlightOverlay.style.left = rect.left + 'px';
            highlightOverlay.style.width = rect.width + 'px';
            highlightOverlay.style.height = rect.height + 'px';
        }

        function handleMouseMove(e) {
            if (!isSelecting) return;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                // 临时禁用遮罩 pointer-events，使 elementFromPoint 穿透到下方真实元素
                selectMask.style.pointerEvents = 'none';
                const target = document.elementFromPoint(e.clientX, e.clientY);
                selectMask.style.pointerEvents = '';
                if (!target || isOurUI(target)) { removeHighlight(); return; }
                const best = findBestTarget(target);
                if (best) {
                    highlightedEl = best;
                    positionHighlight(best);
                } else { removeHighlight(); }
            });
        }

        // 滚动时实时重定位高亮框，避免错位
        function onSelectScroll() {
            if (!isSelecting || !highlightedEl) return;
            if (!document.contains(highlightedEl)) { removeHighlight(); return; }
            positionHighlight(highlightedEl);
        }

        selectMask.onclick = function (e) {
            // 选取模式下任何点击都不应触发链接跳转等默认行为
            e.preventDefault();
            e.stopPropagation();
            selectMask.style.pointerEvents = 'none';
            const target = document.elementFromPoint(e.clientX, e.clientY);
            selectMask.style.pointerEvents = '';
            if (!target || isOurUI(target)) return;
            const best = findBestTarget(target);
            if (!best) return;
            const blocks = extractBlocksFromElement(best);
            if (blocks.length === 0) { showToast('所选元素未提取到有效内容', 'error'); return; }
            stopSelectMode();
            currentNotionBlocks = blocks;
            showConfirmModal(document.title);
        };

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
            if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
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
            selectMask.style.display = 'block';
            document.body.style.cursor = 'crosshair';
            document.addEventListener('keydown', handleEsc, true);
            document.addEventListener('scroll', onSelectScroll, true);
        }

        function stopSelectMode() {
            if (!isSelecting) return;
            isSelecting = false;
            selectTip.style.display = 'none';
            selectMask.style.display = 'none';
            document.body.style.cursor = '';
            removeHighlight();
            if (rafId) cancelAnimationFrame(rafId);
            document.removeEventListener('keydown', handleEsc, true);
            document.removeEventListener('scroll', onSelectScroll, true);
        }

        // ==================== 预览渲染（安全，全部 textContent） ====================
        const richTextString = (rt) => (rt || []).map(t => t?.text?.content || '').join('');

        function renderBlockToPreview(block, container, index) {
            const wrapper = document.createElement('div');
            wrapper.className = 'nc-preview-item';

            // index < 0 表示 toggle 内的嵌套子块，不提供删除按钮（避免误操作）
            if (index >= 0) {
                wrapper.dataset.index = index;
                const delBtn = document.createElement('button');
                delBtn.className = 'nc-preview-delete';
                delBtn.textContent = '❌';
                delBtn.title = '删除此块';
                wrapper.appendChild(delBtn);
            }

            let content;
            if (block.type === 'paragraph') {
                const p = document.createElement('p');
                for (const rt of block.paragraph?.rich_text || []) {
                    if (rt.text?.link) {
                        const a = document.createElement('a');
                        a.href = rt.text.link.url;
                        a.textContent = rt.text.content;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        p.appendChild(a);
                    } else {
                        p.appendChild(document.createTextNode(rt.text?.content || ''));
                    }
                }
                content = p;
            } else if (block.type.startsWith('heading')) {
                const level = block.type.split('_')[1];
                const h = document.createElement(`h${level}`);
                h.textContent = richTextString(block[block.type]?.rich_text);
                content = h;
            } else if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
                const li = document.createElement('li');
                li.textContent = richTextString(block[block.type]?.rich_text);
                content = li;
            } else if (block.type === 'quote') {
                const bq = document.createElement('blockquote');
                bq.textContent = richTextString(block.quote?.rich_text);
                content = bq;
            } else if (block.type === 'code') {
                const pre = document.createElement('pre');
                pre.textContent = richTextString(block.code?.rich_text);
                content = pre;
            } else if (block.type === 'image') {
                const img = document.createElement('img');
                img.src = block.image?.external?.url || '';
                img.onerror = () => { img.style.display = 'none'; };
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
                (block.table?.children || []).forEach(row => {
                    const tr = document.createElement('tr');
                    (row.table_row?.cells || []).forEach(cellArr => {
                        const td = document.createElement('td');
                        td.textContent = Array.isArray(cellArr)
                            ? cellArr.map(rt => rt.text?.content || '').join('')
                            : (cellArr?.text?.content || '');
                        td.style.border = '1px solid #ccc';
                        td.style.padding = '4px';
                        tr.appendChild(td);
                    });
                    table.appendChild(tr);
                });
                content = table;
            } else if (block.type === 'toggle') {
                const details = document.createElement('details');
                const summary = document.createElement('summary');
                summary.textContent = richTextString(block.toggle?.rich_text);
                details.appendChild(summary);
                (block.toggle?.children || []).forEach(child => {
                    const childDiv = document.createElement('div');
                    childDiv.style.marginLeft = '1em';
                    renderBlockToPreview(child, childDiv, -1);
                    details.appendChild(childDiv);
                });
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

        // ==================== Notion API（带重试 + 超时） ====================
        async function notionRequest(method, url, data, retries = API_RETRY_MAX) {
            let lastErr = null;
            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    return await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method, url,
                            headers: {
                                'Authorization': `Bearer ${GM_getValue(STORAGE_KEYS.TOKEN)}`,
                                'Content-Type': 'application/json',
                                'Notion-Version': '2022-06-28'
                            },
                            data: data ? JSON.stringify(data) : null,
                            timeout: API_TIMEOUT,
                            onload: (res) => {
                                if (res.status >= 200 && res.status < 300) {
                                    try {
                                        resolve(JSON.parse(res.responseText));
                                    } catch (_) {
                                        const err = new Error('响应解析失败');
                                        err.status = res.status;
                                        reject(err);
                                    }
                                } else {
                                    let msg;
                                    try {
                                        const errJson = JSON.parse(res.responseText);
                                        msg = errJson.message || JSON.stringify(errJson).substring(0, 200);
                                    } catch (_) {
                                        msg = (res.responseText || 'Unknown error').substring(0, 200);
                                    }
                                    const error = new Error(`API ${res.status}: ${msg}`);
                                    error.status = res.status;
                                    error.retryAfter = parseInt(res.responseHeaders?.match(/Retry-After:\s*(\d+)/i)?.[1] || '0', 10) || 0;
                                    reject(error);
                                }
                            },
                            onerror: () => {
                                const err = new Error('网络错误');
                                err.network = true;
                                reject(err);
                            },
                            ontimeout: () => {
                                const err = new Error('请求超时');
                                err.network = true;
                                reject(err);
                            }
                        });
                    });
                } catch (err) {
                    lastErr = err;
                    // 429 / 5xx / 网络错误 / 超时均可重试；4xx（如 400 参数错误）重试无意义
                    const retryable = err.network || err.status === 429 || (err.status >= 500 && err.status < 600);
                    if (attempt < retries - 1 && retryable) {
                        const delay = Math.max((err.retryAfter || 0) * 1000, 1000 * Math.pow(2, attempt));
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                    throw err;
                }
            }
            throw lastErr;
        }

        async function appendBlocks(pageId, blocks) {
            for (let i = 0; i < blocks.length; i += NOTION_BATCH_SIZE) {
                await notionRequest('PATCH', `https://api.notion.com/v1/blocks/${pageId}/children`, { children: blocks.slice(i, i + NOTION_BATCH_SIZE) });
            }
        }

        async function sendToNotion() {
            sendBtn.disabled = true;
            sendBtn.innerText = '发送中...';
            const dbId = GM_getValue(STORAGE_KEYS.DB_ID).replace(/-/g, '');
            const title = titleInput.value || document.title || 'Untitled';
            const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);
            const tagsPropName = GM_getValue(STORAGE_KEYS.TAGS_PROP, 'Tags').trim();
            try {
                if (!/^[a-f0-9]{32}$/i.test(dbId)) throw new Error('Database ID 格式不正确（应为 32 位字符）');

                const dbInfo = await notionRequest('GET', `https://api.notion.com/v1/databases/${dbId}`);
                const dbProps = dbInfo.properties || {};

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
                    if (type === 'select') properties[tagsPropName] = { select: { name: tags[0].slice(0, MAX_TAG_NAME_LEN) } };
                    else if (type === 'multi_select') properties[tagsPropName] = { multi_select: tags.map(t => ({ name: t.slice(0, MAX_TAG_NAME_LEN) })) };
                }
                if (dbProps['URL']?.type === 'url') properties['URL'] = { url: location.href.slice(0, MAX_URL_LEN) };
                if (dbProps['Content Image']?.type === 'url') {
                    const img = getPageMainImage();
                    if (img && img.length <= MAX_URL_LEN) properties['Content Image'] = { url: img };
                }
                if (dbProps['Icon']?.type === 'url') {
                    const icon = getPageIcon();
                    if (isValidHttpURL(icon)) properties['Icon'] = { url: icon };
                }

                const children = currentNotionBlocks;
                const firstBatch = children.slice(0, NOTION_BATCH_SIZE);
                const data = { parent: { database_id: dbId }, properties, children: firstBatch };

                const iconUrl = getPageIcon();
                if (isValidHttpURL(iconUrl)) data.icon = { type: 'external', external: { url: iconUrl } };

                const response = await notionRequest('POST', 'https://api.notion.com/v1/pages', data);
                const pageId = response.id;

                // 页面已创建：剩余块追加失败不掩盖整体成功，单独提示
                if (children.length > NOTION_BATCH_SIZE) {
                    try {
                        await appendBlocks(pageId, children.slice(NOTION_BATCH_SIZE));
                    } catch (appendErr) {
                        console.error(appendErr);
                        showToast('⚠️ 页面已创建，但部分内容追加失败', 'error');
                    }
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
        $('#nc-settings-close').addEventListener('click', () => { settingsOverlay.style.display = 'none'; });
        $('#nc-settings-save').addEventListener('click', () => {
            const token = tokenInput.value.trim();
            const dbId = dbIdInput.value.trim().replace(/-/g, '');
            if (!token || !dbId) { showToast('Token 和 ID 不能为空', 'error'); return; }
            if (!/^[a-f0-9]{32}$/i.test(dbId)) { showToast('Database ID 格式不正确（应为 32 位字符）', 'error'); return; }
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
        successCloseBtn.addEventListener('click', () => { successOverlay.style.display = 'none'; });
        successOverlay.addEventListener('click', (e) => { if (e.target === successOverlay) successOverlay.style.display = 'none'; });

        // ==================== 初始化 ====================
        loadPosition();
    }

    ncInit();
})();
