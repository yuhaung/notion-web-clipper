// ==UserScript==
// @name         Notion Web Clipper
// @namespace    https://github.com/yuhaung/notion-web-clipper
// @version      2.5.0
// @description  悬停高亮 + 单击选取，保留超链接、富文本、表格/折叠块，知乎自动提取作者、问题链接及问题标题，高清图标，自动标签，Twitter 优化，大图隐藏按钮。优化版：修复注解合并、Shadow DOM 命中、Chrome 密码弹窗；新增返回重选。
// @author       yuhauang
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

    if (window.self !== window.top) return;

    /* ================================================================
     *  1. 常量
     * ================================================================ */
    const C = Object.freeze({
        TEXT_MAX:        2000,
        TEXT_SAFE:       1990,
        RT_ITEMS_MAX:    100,
        BATCH_SIZE:      100,
        TABLE_MAX_COLS:  5,
        TABLE_MAX_ROWS:  100,
        TAG_NAME_MAX:    100,
        URL_MAX:         2000,
        TOGGLE_NEST_MAX: 2,
        API_RETRY:       3,
        API_TIMEOUT:     30000,
        TITLE_MAX:       200,

        BTN_SIZE:        50,
        VISIBLE_PART:    25,
        SNAP_THRESHOLD:  30,
        LARGE_IMG_RATIO: 0.8,
        DRAG_CLICK_PX:   4,
        IMG_CHECK_MS:    200,
        TOAST_MS:        3000,
    });

    const STORAGE = Object.freeze({
        TOKEN:      'notion_token',
        DB_ID:      'notion_db_id',
        TAGS_PROP:  'notion_tags_prop',
        BTN_LEFT:   'nc_btn_left',
        BTN_TOP:    'nc_btn_top',
        BTN_HIDDEN: 'nc_btn_hidden',
        BTN_EDGE:   'nc_btn_edge',
    });

    const BLOCK_TAGS  = new Set(['P','DIV','SECTION','ARTICLE','LI','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','PRE','TABLE','ASIDE','MAIN','HEADER','FOOTER']);
    const INLINE_TAGS = new Set(['SPAN','A','EM','STRONG','B','I','U','INS','CODE','MARK','SMALL','SUB','SUP','S','DEL','STRIKE']);
    const LEAF_BLOCKS = new Set(['PRE','TABLE']);
    const SKIP_TAGS   = new Set(['STYLE','SCRIPT','NOSCRIPT','TEMPLATE','SVG','PATH']);
    const HEADING_RE  = /^H([1-6])$/;

    const ZHIHU_REMOVE = [
        '.ContentItem-actions','.Post-actions','.VoteButtons',
        '.ArticleHeaderActions','.ContentItem-more','.RichContent-actions',
        '.ContentItem-time','.ContentItem-arrowIcon','.ContentItem-extra','.ContentItem-status',
        '.Reward','.Post-Subtitle','.CornerButtons','.QuestionAnswer-actions',
        '.QuestionAnswer-meta','.ArticleHeader-info','.FollowButton',
        '.AnswerItem-extra','.AnswerItem-status',
        '.Post-Header','.ArticleHeader','.QuestionHeader',
        '.QuestionButtonGroup','.Question-mainColumn .Question-sideColumn','.Question-sideColumn',
        '.Question-actions','.Question-follow','.Question-status','.Post-bottom','.Article-actions',
        '.Question-related','.Voters',
        '.RichContent-cover','.RichContent-cover-inner',
    ].join(',');

    const NOTION_LANGS = new Set([
        'abap','agda','arduino','ascii art','assembly','bash','basic','bnf','c','c#','c++',
        'clojure','coffeescript','coq','css','dart','dhall','diff','docker','ebnf','elixir',
        'elm','erlang','f#','flow','fortran','gherkin','glsl','go','graphql','groovy',
        'haskell','hcl','html','idris','java','javascript','json','julia','kotlin','latex',
        'less','lisp','livescript','llvm ir','lua','makefile','markdown','markup','matlab',
        'mathematica','mermaid','nix','objective-c','ocaml','pascal','perl','php','plain text',
        'powershell','prolog','protobuf','purescript','python','r','racket','reason','ruby',
        'rust','sass','scala','scheme','scss','shell','smalltalk','solidity','sql','swift',
        'toml','typescript','vb.net','verilog','vhdl','visual basic','webassembly','xml','yaml',
    ]);

    const LANG_ALIAS = Object.freeze({
        js:'javascript', ts:'typescript', py:'python', sh:'shell', zsh:'bash', fish:'shell',
        cpp:'c++', cxx:'c++', csharp:'c#', golang:'go', rs:'rust', rb:'ruby', kt:'kotlin',
        objc:'objective-c', md:'markdown', yml:'yaml', plaintext:'plain text', txt:'plain text',
        text:'plain text', html5:'html', vue:'html', jsx:'javascript', tsx:'typescript',
        'c++20':'c++', shellsession:'shell', console:'shell', ini:'plain text', conf:'plain text',
    });

    /* ================================================================
     *  2. 主初始化
     * ================================================================ */
    function ncInit() {
        const old = document.getElementById('nc-host');
        if (old) old.remove();

        const host = document.createElement('div');
        host.id = 'nc-host';
        host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
        document.body.appendChild(host);
        const shadow = host.attachShadow({ mode: 'closed' });

        /* ---------- 平台判断 ---------- */
        const isZhihu   = location.hostname.includes('zhihu.com');
        const isTwitter = location.hostname.includes('x.com') || location.hostname.includes('twitter.com');
        const isTwitterStatus = () => isTwitter && location.pathname.includes('/status/');

        /* ---------- DOM 简写 ---------- */
        const $  = (s, b = shadow) => b.querySelector(s);
        const $$ = (s, b = shadow) => b.querySelectorAll(s);

        /* ---------- 样式 ---------- */
        const style = document.createElement('style');
        style.textContent = `
:host{all:initial}
*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.nc-btn{
  position:fixed;width:${C.BTN_SIZE}px;height:${C.BTN_SIZE}px;border-radius:50%;
  background:#2383e2;color:#fff;border:2px solid #fff;cursor:pointer;
  box-shadow:0 4px 12px rgba(0,0,0,.3);font-size:24px;
  display:flex;align-items:center;justify-content:center;
  transition:left .25s ease,top .25s ease,opacity .2s ease;
  user-select:none;touch-action:none;pointer-events:auto;
  left:auto;right:20px;top:auto;bottom:20px;
  will-change:left,top;
}
.nc-btn:hover{background:#1b6ec2}
.nc-btn.edge{opacity:.5}
.nc-tip{
  position:fixed;top:20px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,.85);color:#fff;padding:10px 20px;border-radius:24px;
  font-size:14px;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.2);display:none;
}
.nc-hl{
  position:fixed;top:0;left:0;width:0;height:0;
  border:3px solid #2383e2;background:rgba(35,131,226,.08);
  pointer-events:none;display:none;will-change:transform;
}
.nc-mask{
  position:fixed;top:0;left:0;width:100%;height:100%;
  z-index:-1;display:none;cursor:crosshair;pointer-events:auto;
}
.nc-ov{
  position:fixed;top:0;left:0;width:100%;height:100%;
  background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;
  pointer-events:auto;
}
.nc-modal{
  background:#fff;padding:24px;border-radius:12px;width:550px;max-width:90vw;
  max-height:85vh;overflow-y:auto;box-shadow:0 10px 25px rgba(0,0,0,.2);
  display:flex;flex-direction:column;gap:12px;
}
.nc-modal h2{font-size:18px;color:#333}
.nc-modal label{font-size:13px;color:#555;font-weight:600;margin-top:4px}
.nc-modal input,.nc-modal textarea{
  width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;
}
.nc-modal textarea{height:200px;resize:vertical;font-family:monospace;font-size:13px;line-height:1.5}
.nc-row{display:flex;gap:10px;justify-content:flex-end;margin-top:12px;align-items:center}
.nc-b{padding:9px 18px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;transition:background .15s,transform .1s}
.nc-b:active{transform:scale(.97)}
.nc-b1{background:#2383e2;color:#fff}.nc-b1:hover{background:#1b6ec2}
.nc-b1:disabled{background:#a0c4e8;cursor:not-allowed}
.nc-b2{background:#f0f0f0;color:#333}.nc-b2:hover{background:#e0e0e0}
.nc-bk{background:#fff;color:#2383e2;border:1.5px solid #2383e2}
.nc-bk:hover{background:#eef4fb}
.nc-help{font-size:12px;color:#888;margin-top:-6px;line-height:1.4}
.nc-tw{position:relative;display:flex;align-items:center}
.nc-tw input{flex:1;padding-right:40px}
.nc-tw input.masked{-webkit-text-security:disc;text-security:disc}
.nc-tv{position:absolute;right:8px;background:none;border:none;cursor:pointer;font-size:16px;color:#666;padding:4px}
.nc-pv{
  border:1px solid #eee;border-radius:8px;padding:12px;margin-top:8px;
  max-height:250px;overflow-y:auto;background:#fafafa;font-size:13px;line-height:1.6;
  user-select:text;-webkit-user-select:text;outline:none;
}
.nc-pv img{max-width:100%;max-height:150px;display:block;margin:8px 0;border-radius:4px}
.nc-pv p{margin:4px 0;color:#333;white-space:pre-wrap}
.nc-pv h1,.nc-pv h2,.nc-pv h3{margin:8px 0 4px;color:#111}
.nc-pv h1{font-size:1.4em}.nc-pv h2{font-size:1.2em}.nc-pv h3{font-size:1.1em}
.nc-pv li{margin-left:1.5em;list-style:disc}
.nc-pv blockquote{border-left:3px solid #2383e2;padding-left:10px;color:#555;margin:8px 0}
.nc-pv pre{background:#f0f0f0;padding:8px;border-radius:4px;white-space:pre-wrap;font-family:monospace}
.nc-mp{color:#2383e2;font-weight:600;margin:8px 0;background:#eef4fb;padding:6px 10px;border-radius:4px}
.nc-pi{position:relative;margin:2px 0}
.nc-pd{
  position:absolute;top:2px;right:2px;width:20px;height:20px;
  background:#ff3b30;color:#fff;border:none;border-radius:50%;
  font-size:12px;line-height:20px;text-align:center;cursor:pointer;
  opacity:0;transition:opacity .15s;z-index:2;pointer-events:auto;
}
.nc-pi:hover .nc-pd{opacity:1}
.nc-ok{font-size:15px;color:#2d7d46;font-weight:600;text-align:center;margin:8px 0}
.nc-tc{
  position:fixed;top:20px;right:20px;z-index:2147483647;
  display:flex;flex-direction:column;gap:8px;pointer-events:none;
}
.nc-t{
  padding:12px 20px;border-radius:6px;color:#fff;font-size:14px;
  box-shadow:0 4px 12px rgba(0,0,0,.15);pointer-events:auto;
  animation:nc-in .3s ease;display:flex;align-items:center;gap:8px;
  max-width:300px;word-break:break-word;
}
.nc-ts{background:#2d7d46}.nc-te{background:#d32f2f}
@keyframes nc-in{from{opacity:0;transform:translateX(50px)}to{opacity:1;transform:translateX(0)}}
`;
        shadow.appendChild(style);

        /* ---------- UI 模板 ---------- */
        const ui = document.createElement('div');
        ui.innerHTML = `
<button class="nc-btn" title="左键选取 / 右键设置">✂️</button>
<div class="nc-tip">🔍 悬停高亮元素，单击提取内容 (Esc取消)</div>
<div class="nc-mask"></div>
<div class="nc-hl"></div>

<div class="nc-ov" id="ov-set">
 <div class="nc-modal">
  <h2>⚙️ Notion 配置</h2>
  <label>Integration Token</label>
  <div class="nc-tw">
   <input type="text" id="in-tok" class="masked"
          placeholder="secret_... 或 ntn_..."
          autocomplete="new-password"
          data-lpignore="true" data-form-type="other" data-bwignore="true"
          inputmode="text" spellcheck="false">
   <button class="nc-tv" id="btn-tv" title="显示/隐藏">👁️</button>
  </div>
  <label>Database ID</label>
  <input type="text" id="in-db" placeholder="32位字符" autocomplete="off" spellcheck="false">
  <div class="nc-help">⚠️ 必须在 Notion 数据库右上角 ... → Connections 中添加你的 Integration。</div>
  <label>标签属性名 (可选)</label>
  <input type="text" id="in-tag" placeholder="默认为 Tags，没有可留空" autocomplete="off">
  <div class="nc-row">
   <button class="nc-b nc-b2" id="btn-sc">关闭</button>
   <button class="nc-b nc-b1" id="btn-ss">保存设置</button>
  </div>
 </div>
</div>

<div class="nc-ov" id="ov-cfm">
 <div class="nc-modal">
  <h2>✂️ 确认发送</h2>
  <label>页面标题</label>
  <input type="text" id="in-title" autocomplete="off">
  <label>内容预览 (Ctrl+A 全选，点击 ❌ 删除块)</label>
  <div class="nc-pv" id="pv" tabindex="0"></div>
  <label>标签 (逗号分隔，可选)</label>
  <input type="text" id="in-tags" placeholder="例如: 阅读, 技术" autocomplete="off">
  <div class="nc-row">
   <button class="nc-b nc-bk" id="btn-back" title="返回重新选取元素">↩ 重选</button>
   <span style="flex:1"></span>
   <button class="nc-b nc-b2" id="btn-cc">取消</button>
   <button class="nc-b nc-b1" id="btn-cs">发送</button>
  </div>
 </div>
</div>

<div class="nc-ov" id="ov-ok">
 <div class="nc-modal" style="text-align:center;gap:16px">
  <h2>✅ 成功发送到 Notion！</h2>
  <p class="nc-ok">页面已创建，点击下方按钮打开</p>
  <div class="nc-row" style="justify-content:center">
   <button class="nc-b nc-b1" id="btn-oo">打开</button>
   <button class="nc-b nc-b2" id="btn-oc">关闭</button>
  </div>
 </div>
</div>

<div class="nc-tc" id="tc"></div>`;
        shadow.appendChild(ui);

        /* ---------- DOM 引用缓存 ---------- */
        const el = {
            btn:     $('.nc-btn'),
            tip:     $('.nc-tip'),
            mask:    $('.nc-mask'),
            hl:      $('.nc-hl'),
            ovSet:   $('#ov-set'),
            ovCfm:   $('#ov-cfm'),
            ovOk:    $('#ov-ok'),
            pv:      $('#pv'),
            tok:     $('#in-tok'),
            db:      $('#in-db'),
            tag:     $('#in-tag'),
            title:   $('#in-title'),
            tags:    $('#in-tags'),
            send:    $('#btn-cs'),
            back:    $('#btn-back'),
            okOpen:  $('#btn-oo'),
            okClose: $('#btn-oc'),
            tokTgl:  $('#btn-tv'),
            toast:   $('#tc'),
        };

        /* ---------- 状态 ---------- */
        let selecting    = false;
        let confirmOpen  = false;
        let blocks       = [];
        let hlTarget     = null;
        let lastPageId   = null;
        let tokVisible   = false;
        let dragging     = false;
        let dragSX = 0, dragSY = 0, dragIL = 0, dragIT = 0, dragDist = 0;
        let hidden = false, hiddenEdge = '';
        let hiddenForImg = false;
        let cachedIcon   = null;
        let rafId        = null;
        let imgCheckTs   = 0;

        /* ================================================================
         *  3. 工具函数
         * ================================================================ */

        const isOwn = (node) => {
            let n = node;
            while (n) {
                if (n === host) return true;
                n = n.parentNode || n.host;
            }
            return false;
        };

        function normURL(raw) {
            if (!raw || typeof raw !== 'string') return null;
            let u = raw.trim();
            if (u.startsWith('//')) u = location.protocol + u;
            else if (u.startsWith('/')) u = location.origin + u;
            return /^https?:\/\//i.test(u) ? u : null;
        }

        function safeURL(raw) {
            if (!raw || typeof raw !== 'string') return null;
            const s = raw.trim();
            if (!s || s.length > C.URL_MAX) return null;
            try {
                const u = new URL(s, location.href);
                if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
                return u.href.length <= C.URL_MAX ? u.href : null;
            } catch { return null; }
        }

        function toast(msg, type = 'success') {
            const t = document.createElement('div');
            t.className = `nc-t nc-t${type === 'error' ? 'e' : 's'}`;
            t.textContent = msg;
            el.toast.appendChild(t);
            setTimeout(() => {
                t.style.transition = 'opacity .3s';
                t.style.opacity = '0';
                setTimeout(() => t.remove(), 300);
            }, C.TOAST_MS);
        }

        /* ================================================================
         *  4. Notion Block 构建器
         * ================================================================ */

        function toRich(text) {
            const s = String(text ?? '');
            if (!s) return [];
            const items = [];
            for (let i = 0; i < s.length && items.length < C.RT_ITEMS_MAX; i += C.TEXT_SAFE) {
                items.push({ type: 'text', text: { content: s.slice(i, i + C.TEXT_SAFE) } });
            }
            if (items.length === C.RT_ITEMS_MAX && s.length > C.RT_ITEMS_MAX * C.TEXT_SAFE) {
                const last = items[items.length - 1].text.content;
                items[items.length - 1].text.content = last.slice(0, -3) + '...';
            }
            return items;
        }

        function mkBlock(type, text, extra) {
            const rt = toRich(text);
            if (!rt.length) rt.push({ type: 'text', text: { content: '' } });
            return { object: 'block', type, [type]: { rich_text: rt, ...(extra || {}) } };
        }

        const mkPara   = (t) => mkBlock('paragraph', t);
        const mkH      = (lv, t) => mkBlock(`heading_${Math.min(Math.max(lv | 0, 1), 3)}`, t);
        const mkBullet = (t) => mkBlock('bulleted_list_item', t);
        const mkNum    = (t) => mkBlock('numbered_list_item', t);
        const mkQuote  = (t) => mkBlock('quote', t);

        function mkCode(text, lang) {
            const l = lang ? String(lang).toLowerCase().trim() : '';
            const language = NOTION_LANGS.has(l) ? l : (LANG_ALIAS[l] || 'plain text');
            return mkBlock('code', text, { language });
        }

        function mkRichPara(richArr) {
            const out = [];
            for (const item of richArr.slice(0, C.RT_ITEMS_MAX)) {
                let content = String(item.text?.content ?? '');
                if (content.length > C.TEXT_SAFE) content = content.slice(0, C.TEXT_SAFE - 3) + '...';
                const node = { type: 'text', text: { content } };
                if (item.text?.link?.url) {
                    const u = safeURL(item.text.link.url);
                    if (u) node.text.link = { url: u };
                }
                if (item.annotations) node.annotations = item.annotations;
                out.push(node);
            }
            return { object: 'block', type: 'paragraph', paragraph: { rich_text: out } };
        }

        function mkMedia(type, rawUrl) {
            const url = safeURL(rawUrl);
            if (!url) return null;
            if (type === 'image') return { object: 'block', type: 'image', image: { type: 'external', external: { url } } };
            if (type === 'video') return { object: 'block', type: 'video', video: { type: 'external', external: { url } } };
            return { object: 'block', type: 'embed', embed: { url } };
        }

        function mkTable(rows, hasHeader) {
            const valid = rows.filter(r => Array.isArray(r) && r.length > 0);
            if (!valid.length) return [];
            const w = Math.min(Math.max(...valid.map(r => r.length)), C.TABLE_MAX_COLS);
            const norm = valid.map(row => {
                const cells = [];
                for (let i = 0; i < w; i++) {
                    const t = String(row[i] ?? '');
                    cells.push([{ type: 'text', text: { content: t.length > C.TEXT_SAFE ? t.slice(0, C.TEXT_SAFE - 3) + '...' : t } }]);
                }
                return { type: 'table_row', table_row: { cells } };
            });
            const out = [];
            for (let i = 0; i < norm.length; i += C.TABLE_MAX_ROWS) {
                out.push({
                    object: 'block', type: 'table',
                    table: { table_width: w, has_column_header: hasHeader && i === 0, children: norm.slice(i, i + C.TABLE_MAX_ROWS) },
                });
            }
            return out;
        }

        function flattenToggle(children) {
            const out = [];
            for (const b of children) {
                if (!b) continue;
                if (b.type === 'toggle') {
                    const sum = (b.toggle?.rich_text || []).map(t => t.text?.content || '').join('');
                    out.push(mkPara('▸ ' + sum));
                    out.push(...flattenToggle(b.toggle?.children || []));
                } else if (b.type === 'table') {
                    for (const row of b.table?.children || []) {
                        const line = (row.table_row?.cells || []).map(c =>
                            Array.isArray(c) ? c.map(t => t.text?.content || '').join('') : ''
                        ).join(' | ');
                        if (line.trim()) out.push(mkPara(line));
                    }
                } else {
                    out.push(b);
                }
            }
            return out;
        }

        function mkToggle(summary, children) {
            const flat = flattenToggle(children).slice(0, C.BATCH_SIZE);
            const toggle = { rich_text: toRich(summary) };
            if (flat.length) toggle.children = flat;
            return { object: 'block', type: 'toggle', toggle };
        }

        /* ================================================================
         *  5. 媒体辅助
         * ================================================================ */

        function realImgSrc(img) {
            if (!img) return null;
            for (const attr of ['src', 'data-gif', 'data-animated', 'data-original', 'data-actualsrc', 'data-src']) {
                const raw = attr === 'src' ? img.src : img.getAttribute(attr);
                const url = normURL(raw);
                if (url && !url.includes('placeholder')) return url;
            }
            return null;
        }

        function isAvatar(img) {
            if (!img) return true;
            const src = img.src || img.getAttribute('data-src') || '';
            if (/\.(gif|webp)($|\?|&)/i.test(src)) return false;
            const r = img.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && (r.width <= 80 || r.height <= 80)) return true;
            const cls = typeof img.className === 'string' ? img.className.toLowerCase() : '';
            if (/avatar|icon|emoji|face/.test(cls)) return true;
            let p = img.parentElement;
            for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
                const pc = typeof p.className === 'string' ? p.className.toLowerCase() : '';
                if (/avatar|icon|emoji|face/.test(pc)) return true;
            }
            if (/avatar|emoji|icon/i.test(src)) return true;
            if (/_(is|xs|s)\.(jpg|jpeg|png|webp)/i.test(src)) return true;
            return false;
        }

        function isZhihuMember(img) {
            if (!isZhihu) return false;
            const combined = [
                typeof img.className === 'string' ? img.className : '',
                img.src || '', img.getAttribute('data-src') || '',
                img.alt || '', img.title || '',
            ].join(' ').toLowerCase();
            if (/member|vip|盐选|pay|lock/.test(combined)) return true;
            let p = img.parentElement;
            for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
                if (/member|vip|pay|lock|盐选/.test((typeof p.className === 'string' ? p.className : '').toLowerCase())) return true;
            }
            return false;
        }

        function videoSrc(v) {
            if (!v) return null;
            const d = normURL(v.src);
            if (d) return d;
            for (const s of v.querySelectorAll('source')) {
                const u = normURL(s.src);
                if (u) return u;
            }
            return null;
        }

        function gifMedia(container) {
            const v = container.querySelector('video');
            if (v) { const u = videoSrc(v); if (u) return { type: 'video', url: u }; }
            const img = container.querySelector('img');
            if (img) {
                const g = normURL(img.getAttribute('data-gif'));
                if (g) return { type: 'image', url: g };
                const s = realImgSrc(img);
                if (s) return { type: 'image', url: s };
            }
            return null;
        }

        function pageMainImage() {
            return document.querySelector('meta[property="og:image"]')?.content
                || document.querySelector('meta[name="twitter:image"]')?.content
                || '';
        }

        function pageIcon() {
            if (cachedIcon !== null) return cachedIcon;
            let best = '', bestArea = 0;
            for (const link of document.querySelectorAll(
                'link[rel="apple-touch-icon"],link[rel="apple-touch-icon-precomposed"],link[rel="mask-icon"],link[rel="icon"],link[rel="shortcut icon"]'
            )) {
                const href = link.href;
                if (!href || href.startsWith('data:')) continue;
                if (link.type === 'image/svg+xml' || href.endsWith('.svg')) { cachedIcon = href; return href; }
                const sizes = link.getAttribute('sizes');
                if (sizes) {
                    for (const part of sizes.trim().split(/\s+/)) {
                        const m = part.match(/^(\d+)x(\d+)$/i);
                        if (m) {
                            const area = +m[1] * +m[2];
                            if (area > bestArea) { bestArea = area; best = href; }
                        } else if (part.toLowerCase() === 'any') { cachedIcon = href; return href; }
                    }
                } else {
                    const assumed = /apple-touch-icon/.test(link.rel) ? 32400 : 256;
                    if (assumed > bestArea) { bestArea = assumed; best = href; }
                }
            }
            cachedIcon = best || location.origin + '/favicon.ico';
            return cachedIcon;
        }

        /* ================================================================
         *  6. 内容解析
         * ================================================================ */

        function parseBlocks(fragment) {
            const result = [];
            let frags = [];

            const flush = () => {
                if (!frags.length) return;
                const nonEmpty = frags.filter(f => f.text.trim());
                frags = [];
                if (!nonEmpty.length) return;

                const hasFmt = nonEmpty.some(f => f.link || f.annot);
                if (hasFmt) {
                    const rt = [];
                    let buf = '';
                    for (const f of nonEmpty) {
                        if (!f.link && !f.annot) { buf += f.text; continue; }
                        if (buf) { rt.push({ text: { content: buf } }); buf = ''; }
                        const node = { text: { content: f.text } };
                        const u = safeURL(f.link);
                        if (u) node.text.link = { url: u };
                        if (f.annot) node.annotations = f.annot;
                        rt.push(node);
                    }
                    if (buf) rt.push({ text: { content: buf } });
                    result.push(mkRichPara(rt));
                } else {
                    result.push(mkPara(nonEmpty.map(f => f.text).join('')));
                }
            };

            function innerText(node) {
                if (node.nodeType === 3) return node.textContent;
                if (node.nodeType !== 1) return '';
                const tag = node.tagName;
                if (tag === 'IMG' || tag === 'VIDEO' || tag === 'IFRAME') return '';
                if (tag === 'BR') return '\n';
                const parts = [];
                for (const c of node.childNodes) parts.push(innerText(c));
                let s = parts.join('');
                if (BLOCK_TAGS.has(tag) && tag !== 'TABLE') s += '\n';
                return s;
            }

            function mergeAnnot(tag, parent) {
                const a = parent ? { ...parent } : {};
                if (tag === 'B' || tag === 'STRONG')  a.bold = true;
                if (tag === 'I' || tag === 'EM')      a.italic = true;
                if (tag === 'U' || tag === 'INS')     a.underline = true;
                if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') a.strikethrough = true;
                if (tag === 'CODE')                   a.code = true;
                return Object.keys(a).length ? a : null;
            }

            function walk(node, parentAnnot) {
                if (node.nodeType === 3) {
                    frags.push({ text: node.textContent, link: null, annot: parentAnnot });
                    return;
                }
                if (node.nodeType !== 1) return;

                const tag = node.tagName;
                if (SKIP_TAGS.has(tag)) return;

                if (node.classList?.contains('GifPlayer')) {
                    flush();
                    const m = gifMedia(node);
                    if (m) { const b = mkMedia(m.type, m.url); if (b) result.push(b); }
                    else for (const c of node.childNodes) walk(c, parentAnnot);
                    return;
                }

                if (tag === 'TABLE') {
                    flush();
                    const rows = [];
                    let hdr = false;
                    for (const tr of node.querySelectorAll('tr')) {
                        const cells = [];
                        for (const td of tr.querySelectorAll('td,th')) cells.push(innerText(td).trim());
                        if (!rows.length && tr.querySelector('th')) hdr = true;
                        if (cells.length) rows.push(cells);
                    }
                    result.push(...mkTable(rows, hdr));
                    return;
                }

                if (tag === 'DETAILS') {
                    flush();
                    const sum = node.querySelector('summary');
                    const sumText = sum ? innerText(sum).trim() : '展开';
                    const children = [];
                    for (const c of node.childNodes) {
                        if (c === sum) continue;
                        const frag = document.createDocumentFragment();
                        frag.appendChild(c.cloneNode(true));
                        children.push(...parseBlocks(frag));
                    }
                    result.push(mkToggle(sumText, children));
                    return;
                }

                if (tag === 'A') {
                    const href = safeURL(node.href) || safeURL(node.getAttribute('href') || '');
                    const text = innerText(node);
                    if (text) frags.push({ text, link: href || null, annot: parentAnnot });
                    return;
                }

                if (INLINE_TAGS.has(tag)) {
                    const merged = mergeAnnot(tag, parentAnnot);
                    for (const c of node.childNodes) walk(c, merged);
                    return;
                }

                if (tag === 'BR') { frags.push({ text: '\n', link: null, annot: parentAnnot }); return; }

                if (tag === 'IMG') {
                    if (!isAvatar(node) && !isZhihuMember(node)) {
                        flush();
                        const b = mkMedia('image', realImgSrc(node));
                        if (b) result.push(b);
                    }
                    return;
                }
                if (tag === 'VIDEO')  { flush(); const b = mkMedia('video', videoSrc(node)); if (b) result.push(b); return; }
                if (tag === 'IFRAME') { flush(); const b = mkMedia('embed', normURL(node.src)); if (b) result.push(b); return; }

                const hm = HEADING_RE.exec(tag);
                if (hm) {
                    flush();
                    const t = innerText(node).trim();
                    if (t) result.push(mkH(+hm[1], t));
                    return;
                }

                if (tag === 'LI') {
                    flush();
                    const t = innerText(node).trim();
                    if (t) result.push(node.parentElement?.tagName === 'OL' ? mkNum(t) : mkBullet(t));
                    return;
                }

                if (tag === 'BLOCKQUOTE') { flush(); const t = innerText(node).trim(); if (t) result.push(mkQuote(t)); return; }
                if (tag === 'PRE') { flush(); result.push(mkCode(node.textContent || '', node.getAttribute('data-language'))); return; }

                if (tag === 'DIV' && node.querySelector('pre') && !node.querySelector('p,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,details,article,section')) {
                    flush();
                    const pre = node.querySelector('pre');
                    result.push(mkCode(pre.textContent || '', pre.getAttribute('data-language')));
                    return;
                }

                if (tag === 'FIGURE') { flush(); for (const c of node.childNodes) walk(c, parentAnnot); return; }

                if (BLOCK_TAGS.has(tag)) {
                    flush();
                    for (const c of node.childNodes) walk(c, parentAnnot);
                    flush();
                } else {
                    for (const c of node.childNodes) walk(c, parentAnnot);
                }
            }

            for (const c of fragment.childNodes) walk(c, null);
            flush();

            return result.filter(b => {
                if (!b) return false;
                if (b.type === 'paragraph') {
                    return (b.paragraph?.rich_text || []).some(t => (t.text?.content || '').trim());
                }
                return true;
            });
        }

        /* ================================================================
         *  7. 知乎专用
         * ================================================================ */

        function cleanZhihu(clone) {
            clone.querySelectorAll(ZHIHU_REMOVE).forEach(n => n.remove());
            clone.querySelectorAll('img').forEach(img => {
                if (isAvatar(img) || isZhihuMember(img)) img.remove();
            });
            return clone;
        }

        function zhihuAuthor(root) {
            const sels = [
                '.UserLink','.AuthorInfo-name','.AnswerItem-authorInfo .UserLink',
                '.ContentItem-authorInfo .UserLink','.Post-Author .UserLink',
                '.AuthorInfo .UserLink','.AnswerItem-authorInfo a[href*="/people/"]',
                '.ContentItem-authorInfo a[href*="/people/"]',
            ];
            for (const s of sels) {
                const found = root.querySelector(s) || root.closest('.AnswerItem')?.querySelector(s);
                if (found) return found.textContent.trim().replace(/\s+/g, ' ');
            }
            return null;
        }

        function zhihuQuestionTitle(root) {
            const container = root.closest('.ContentItem') || root.closest('.Card')
                || root.closest('[itemprop="suggestedAnswer"]') || root;
            for (const s of ['.ContentItem-title','h2.ContentItem-title','h2 a[href*="/question/"]','.QuestionItem-title','h2']) {
                const found = container.querySelector(s);
                if (found) {
                    const t = found.textContent.trim().replace(/\s+/g, ' ');
                    if (t && t.length >= 4 && t.length <= 200
                        && !/^(查看全部|展开|收起|广告|更多|写回答|关注)/.test(t)
                        && !/^(\d+个?回答|\d+条?评论)/.test(t)) return t;
                }
            }
            if (location.pathname.includes('/question/')) {
                const h1 = document.querySelector('.QuestionHeader-title');
                if (h1) { const t = h1.textContent.trim().replace(/\s+/g, ' '); if (t.length >= 4) return t; }
            }
            return null;
        }

        function zhihuSourceURL(root) {
            const link = root.querySelector('h2 a[href*="/question/"]')
                || root.querySelector('.ContentItem-title a[href*="/question/"]')
                || root.querySelector('.QuestionItem-title a');
            if (link?.href) return safeURL(link.href);
            const m = location.pathname.match(/\/question\/(\d+)/);
            if (m) return `https://www.zhihu.com/question/${m[1]}`;
            return safeURL(location.href);
        }

        /* ================================================================
         *  8. Twitter 专用
         * ================================================================ */

        const upgradeTwImg = (u) => u ? u.replace(/([?&])name=(small|medium|large|360x360|900x900)\b/i, '$1name=orig') : u;

        function twMediaBlocks(tweet) {
            const out = [], seen = new Set();
            const pushImg = (raw) => {
                const url = upgradeTwImg(normURL(raw));
                if (!url || url.includes('placeholder') || seen.has(url)) return;
                const b = mkMedia('image', url);
                if (b) { seen.add(url); out.push(b); }
            };

            tweet.querySelectorAll('[data-testid="tweetPhoto"]').forEach(p => {
                const img = p.querySelector('img');
                if (!img || img.closest('[data-testid="Tweet-User-Avatar"]')) return;
                pushImg(img.src || realImgSrc(img));
            });

            tweet.querySelectorAll('[data-testid="videoPlayer"]').forEach(vp => {
                const video = vp.querySelector('video');
                if (!video) return;
                let got = false;
                for (const s of vp.querySelectorAll('source')) {
                    const u = normURL(s.src);
                    if (u) { const b = mkMedia('video', u); if (b && !seen.has(u)) { seen.add(u); out.push(b); got = true; } break; }
                }
                if (!got && video.poster) pushImg(video.poster);
            });

            const photoImgs = new Set(tweet.querySelectorAll('[data-testid="tweetPhoto"] img'));
            const avatarImgs = new Set(tweet.querySelectorAll('[data-testid="Tweet-User-Avatar"] img'));
            tweet.querySelectorAll('img').forEach(img => {
                if (photoImgs.has(img) || avatarImgs.has(img) || isAvatar(img)) return;
                pushImg(img.src || realImgSrc(img));
            });
            return out;
        }

        function twConversation() {
            if (!isTwitterStatus()) return null;
            const main = document.querySelector('main[role="main"]') || document.querySelector('div[data-testid="primaryColumn"]') || document.body;
            const tweets = main.querySelectorAll('article[data-testid="tweet"]');
            if (tweets.length < 2) return null;
            const all = [];
            tweets.forEach((tw, i) => {
                const media = twMediaBlocks(tw);
                const clone = tw.cloneNode(true);
                clone.querySelectorAll('img,video,[data-testid="tweetPhoto"],[data-testid="videoPlayer"]').forEach(n => n.remove());
                const frag = document.createDocumentFragment();
                frag.appendChild(clone);
                const text = parseBlocks(frag);
                if (text.length || media.length) {
                    if (i > 0) all.push(mkQuote('---'));
                    all.push(...text, ...media);
                }
            });
            return all.length ? all : null;
        }

        /* ================================================================
         *  9. 元素 → Blocks 提取
         * ================================================================ */

        function extractBlocks(target) {
            const twConv = twConversation();
            if (twConv) return { blocks: twConv, title: document.title };

            const tag = target.tagName;
            if (tag === 'IMG') {
                if (isAvatar(target) || isZhihuMember(target)) return { blocks: [], title: document.title };
                let url = realImgSrc(target);
                if (url && isTwitter) url = upgradeTwImg(url);
                const b = mkMedia('image', url);
                return { blocks: b ? [b] : [], title: document.title };
            }
            if (tag === 'VIDEO')  { const b = mkMedia('video', videoSrc(target)); return { blocks: b ? [b] : [], title: document.title }; }
            if (tag === 'IFRAME') { const b = mkMedia('embed', normURL(target.src)); return { blocks: b ? [b] : [], title: document.title }; }
            if (target.classList?.contains('GifPlayer')) {
                const m = gifMedia(target);
                if (m) { const b = mkMedia(m.type, m.url); return { blocks: b ? [b] : [], title: document.title }; }
            }

            if (isTwitter) {
                const article = target.closest('article[data-testid="tweet"]');
                if (article) {
                    const media = twMediaBlocks(article);
                    const clone = article.cloneNode(true);
                    clone.querySelectorAll('img,video,[data-testid="tweetPhoto"],[data-testid="videoPlayer"]').forEach(n => n.remove());
                    const frag = document.createDocumentFragment();
                    frag.appendChild(clone);
                    return { blocks: [...parseBlocks(frag), ...media], title: document.title };
                }
            }

            const clone = target.cloneNode(true);

            if (isZhihu) {
                const qTitle = zhihuQuestionTitle(target);
                const srcUrl = zhihuSourceURL(target);
                if (qTitle) {
                    for (const s of ['.ContentItem-title', 'h2.ContentItem-title'])
                        clone.querySelectorAll(s).forEach(n => n.remove());
                }
                cleanZhihu(clone);
                const frag = document.createDocumentFragment();
                frag.appendChild(clone);
                const body = parseBlocks(frag);

                const prefix = [];
                if (qTitle) prefix.push(mkH(2, qTitle));
                const author = zhihuAuthor(target);
                if (author) prefix.push(mkPara(`作者：${author}`));
                if (srcUrl) {
                    prefix.push(mkRichPara([{
                        type: 'text',
                        text: { content: qTitle ? '🔗 问题链接' : '🔗 原文链接', link: { url: srcUrl } },
                    }]));
                }
                return { blocks: [...prefix, ...body], title: qTitle || document.title };
            }

            const frag = document.createDocumentFragment();
            frag.appendChild(clone);
            return { blocks: parseBlocks(frag), title: document.title };
        }

        /* ================================================================
         *  10. 目标查找
         * ================================================================ */

        function findTarget(node) {
            if (!node || node === document.body || node === document.documentElement || isOwn(node)) return null;

            const tag = node.tagName;
            if (tag === 'IMG') return (!isAvatar(node) && !isZhihuMember(node) && realImgSrc(node)) ? node : null;
            if (tag === 'VIDEO' && videoSrc(node)) return node;
            if (tag === 'IFRAME' && normURL(node.src)) return node;
            if (node.classList?.contains('GifPlayer')) return node;

            if (isZhihu) {
                for (const s of ['.AnswerItem','.PostIndex-answerItem','.List-item','.QuestionAnswer-content',
                    '[itemprop="suggestedAnswer"]','.ContentItem','.Card','.RichContent','.RichContent-inner',
                    '.Answer','.Post-RichTextContainer','[itemprop="text"]','.RichText','article']) {
                    const card = node.closest(s);
                    if (card) {
                        const r = card.getBoundingClientRect();
                        if (r.width > 50 && r.height > 100) return card;
                    }
                }
            }

            if (isTwitter) {
                const tw = node.closest('article[data-testid="tweet"]');
                if (tw) return tw;
            }

            let cur = node, leaf = null;
            while (cur && cur !== document.body && cur !== document.documentElement) {
                if (BLOCK_TAGS.has(cur.tagName)) {
                    const r = cur.getBoundingClientRect();
                    if (r.width > 20 && r.height > 20) {
                        if (LEAF_BLOCKS.has(cur.tagName)) leaf = cur;
                        else return cur;
                    }
                }
                cur = cur.parentElement;
            }
            return leaf || node.closest('p,div,li,blockquote') || null;
        }

        /* ================================================================
         *  11. 按钮位置 / 拖拽 / 贴边
         * ================================================================ */

        const clampPos = (l, t) => ({
            left: Math.max(0, Math.min(l, innerWidth - C.BTN_SIZE)),
            top:  Math.max(0, Math.min(t, innerHeight - C.BTN_SIZE)),
        });

        function fullFromHidden(edge, l, t) {
            if (edge === 'left')   l = 0;
            if (edge === 'right')  l = innerWidth - C.BTN_SIZE;
            if (edge === 'top')    t = 0;
            if (edge === 'bottom') t = innerHeight - C.BTN_SIZE;
            return clampPos(l, t);
        }

        function hiddenPos(edge, l, t) {
            if (edge === 'left')   l = -C.BTN_SIZE + C.VISIBLE_PART;
            if (edge === 'right')  l = innerWidth - C.VISIBLE_PART;
            if (edge === 'top')    t = -C.BTN_SIZE + C.VISIBLE_PART;
            if (edge === 'bottom') t = innerHeight - C.VISIBLE_PART;
            return { left: l, top: t };
        }

        function applyPos(l, t) {
            const p = clampPos(l, t);
            el.btn.style.left = p.left + 'px';
            el.btn.style.top = p.top + 'px';
            el.btn.style.right = 'auto';
            el.btn.style.bottom = 'auto';
        }

        const showFull = () => { el.btn.classList.remove('edge'); hidden = false; hiddenEdge = ''; };
        const hideTo   = (e) => { el.btn.classList.add('edge'); hidden = true; hiddenEdge = e; };

        function savePos() {
            const r = el.btn.getBoundingClientRect();
            let fl = r.left, ft = r.top;
            if (hidden) { const p = fullFromHidden(hiddenEdge, fl, ft); fl = p.left; ft = p.top; }
            const c = clampPos(fl, ft);
            GM_setValue(STORAGE.BTN_LEFT, c.left);
            GM_setValue(STORAGE.BTN_TOP, c.top);
            GM_setValue(STORAGE.BTN_HIDDEN, hidden);
            GM_setValue(STORAGE.BTN_EDGE, hiddenEdge);
        }

        function loadPos() {
            const sl = GM_getValue(STORAGE.BTN_LEFT, null);
            const st = GM_getValue(STORAGE.BTN_TOP, null);
            if (sl === null || st === null) return;
            const c = clampPos(sl, st);
            if (GM_getValue(STORAGE.BTN_HIDDEN, false) && GM_getValue(STORAGE.BTN_EDGE, '')) {
                const edge = GM_getValue(STORAGE.BTN_EDGE, '');
                const hp = hiddenPos(edge, c.left, c.top);
                applyPos(hp.left, hp.top);
                hideTo(edge);
            } else {
                applyPos(c.left, c.top);
                showFull();
            }
        }

        function snap(l, t) {
            let edge = '';
            if (l < C.SNAP_THRESHOLD) edge = 'left';
            else if (l + C.BTN_SIZE > innerWidth - C.SNAP_THRESHOLD) edge = 'right';
            else if (t < C.SNAP_THRESHOLD) edge = 'top';
            else if (t + C.BTN_SIZE > innerHeight - C.SNAP_THRESHOLD) edge = 'bottom';
            if (edge) { const hp = hiddenPos(edge, l, t); applyPos(hp.left, hp.top); hideTo(edge); }
            else { applyPos(l, t); showFull(); }
            savePos();
        }

        /* ---------- 拖拽 ---------- */
        el.btn.addEventListener('mouseenter', () => {
            if (dragging || hiddenForImg) return;
            if (hidden) {
                const r = el.btn.getBoundingClientRect();
                const fp = fullFromHidden(hiddenEdge, r.left, r.top);
                applyPos(fp.left, fp.top);
                showFull();
            }
        });

        el.btn.addEventListener('mouseleave', () => {
            if (dragging || hidden) return;
            const r = el.btn.getBoundingClientRect();
            snap(r.left, r.top);
        });

        el.btn.addEventListener('mousedown', (e) => {
            if (e.button === 2) return;
            e.preventDefault();
            e.stopPropagation();
            dragging = true;
            el.btn.style.transition = 'none';
            if (hidden) {
                const r = el.btn.getBoundingClientRect();
                const fp = fullFromHidden(hiddenEdge, r.left, r.top);
                applyPos(fp.left, fp.top);
                showFull();
            }
            const r = el.btn.getBoundingClientRect();
            dragSX = e.clientX; dragSY = e.clientY;
            dragIL = r.left; dragIT = r.top;
        });

        function dragEnd(e) {
            if (!dragging) return;
            dragging = false;
            el.btn.style.transition = '';
            const dx = e.clientX - dragSX, dy = e.clientY - dragSY;
            dragDist = Math.sqrt(dx * dx + dy * dy);
            if (dragDist <= C.DRAG_CLICK_PX) { savePos(); return; }
            const r = el.btn.getBoundingClientRect();
            snap(r.left, r.top);
        }

        el.btn.addEventListener('click', (e) => {
            if (dragDist > C.DRAG_CLICK_PX) { e.preventDefault(); e.stopPropagation(); dragDist = 0; return; }
            if (hidden) {
                e.preventDefault(); e.stopPropagation();
                const r = el.btn.getBoundingClientRect();
                const fp = fullFromHidden(hiddenEdge, r.left, r.top);
                applyPos(fp.left, fp.top);
                showFull(); savePos(); dragDist = 0;
                return;
            }
            e.stopPropagation();
            triggerClipper();
            dragDist = 0;
        });

        el.btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openSettings();
        });

        /* ---------- resize ---------- */
        window.addEventListener('resize', () => {
            if (hidden) {
                const sl = GM_getValue(STORAGE.BTN_LEFT, null);
                const st = GM_getValue(STORAGE.BTN_TOP, null);
                if (sl !== null && st !== null) {
                    const c = clampPos(sl, st);
                    const hp = hiddenPos(hiddenEdge, c.left, c.top);
                    applyPos(hp.left, hp.top);
                }
            } else {
                const r = el.btn.getBoundingClientRect();
                applyPos(r.left, r.top);
            }
        });

        /* ================================================================
         *  12. Document 级事件（on* 属性，免疫 addEventListener hook）
         * ================================================================ */

        const prevMM = document.onmousemove;
        const prevMU = document.onmouseup;

        document.onmousemove = function (e) {
            try { prevMM?.call(this, e); } catch { /* ignore */ }

            if (dragging) {
                e.preventDefault();
                applyPos(dragIL + e.clientX - dragSX, dragIT + e.clientY - dragSY);
                return;
            }
            if (selecting) { onHoverMove(e); return; }

            const now = Date.now();
            if (now - imgCheckTs < C.IMG_CHECK_MS) return;
            imgCheckTs = now;
            const t = document.elementFromPoint(e.clientX, e.clientY);
            if (t?.tagName === 'IMG' && isLargeImg(t)) {
                if (!hiddenForImg) { hiddenForImg = true; el.btn.style.display = 'none'; }
            } else if (hiddenForImg) {
                hiddenForImg = false;
                el.btn.style.display = '';
                if (hidden) {
                    const sl = GM_getValue(STORAGE.BTN_LEFT, null);
                    const st = GM_getValue(STORAGE.BTN_TOP, null);
                    if (sl !== null && st !== null) {
                        const c = clampPos(sl, st);
                        const hp = hiddenPos(hiddenEdge, c.left, c.top);
                        applyPos(hp.left, hp.top);
                        hideTo(hiddenEdge);
                    }
                } else loadPos();
            }
        };

        document.onmouseup = function (e) {
            try { prevMU?.call(this, e); } catch { /* ignore */ }
            if (dragging) dragEnd(e);
        };

        function isLargeImg(img) {
            const r = img.getBoundingClientRect();
            return r.width >= innerWidth * C.LARGE_IMG_RATIO || r.height >= innerHeight * C.LARGE_IMG_RATIO;
        }

        /* ================================================================
         *  13. 选取模式
         * ================================================================ */

        function positionHL(target) {
            const r = target.getBoundingClientRect();
            el.hl.style.display = 'block';
            el.hl.style.width = r.width + 'px';
            el.hl.style.height = r.height + 'px';
            el.hl.style.transform = `translate(${r.left}px,${r.top}px)`;
        }

        function clearHL() { el.hl.style.display = 'none'; hlTarget = null; }

        function onHoverMove(e) {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                el.mask.style.pointerEvents = 'none';
                const t = document.elementFromPoint(e.clientX, e.clientY);
                el.mask.style.pointerEvents = '';
                if (!t || isOwn(t)) { clearHL(); return; }
                const best = findTarget(t);
                if (best) { hlTarget = best; positionHL(best); }
                else clearHL();
            });
        }

        function onScroll() {
            if (!selecting || !hlTarget) return;
            if (!document.contains(hlTarget)) { clearHL(); return; }
            positionHL(hlTarget);
        }

        el.mask.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.mask.style.pointerEvents = 'none';
            const t = document.elementFromPoint(e.clientX, e.clientY);
            el.mask.style.pointerEvents = '';
            if (!t || isOwn(t)) return;
            const best = findTarget(t);
            if (!best) return;
            const { blocks: b, title } = extractBlocks(best);
            if (!b.length) { toast('所选元素未提取到有效内容', 'error'); return; }
            stopSelect();
            blocks = b;
            showConfirm(title);
        });

        function onEsc(e) {
            if (e.key === 'Escape') { e.preventDefault(); if (selecting) stopSelect(); }
        }

        function startSelect() {
            if (selecting) stopSelect();
            selecting = true;
            el.tip.style.display = 'block';
            el.mask.style.display = 'block';
            document.body.style.cursor = 'crosshair';
            document.addEventListener('keydown', onEsc, true);
            document.addEventListener('scroll', onScroll, true);
        }

        function stopSelect() {
            if (!selecting) return;
            selecting = false;
            el.tip.style.display = 'none';
            el.mask.style.display = 'none';
            document.body.style.cursor = '';
            clearHL();
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            document.removeEventListener('keydown', onEsc, true);
            document.removeEventListener('scroll', onScroll, true);
        }

        /* ================================================================
         *  14. 预览渲染
         * ================================================================ */

        const rtStr = (rt) => (rt || []).map(t => t?.text?.content || '').join('');

        function renderPreview(block, container, idx) {
            const wrap = document.createElement('div');
            wrap.className = 'nc-pi';

            if (idx >= 0) {
                wrap.dataset.index = idx;
                const del = document.createElement('button');
                del.className = 'nc-pd';
                del.textContent = '❌';
                del.title = '删除此块';
                wrap.appendChild(del);
            }

            let content = null;
            const type = block.type;

            if (type === 'paragraph') {
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
            } else if (type.startsWith('heading')) {
                const lv = type.split('_')[1];
                const h = document.createElement(`h${lv}`);
                h.textContent = rtStr(block[type]?.rich_text);
                content = h;
            } else if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
                const li = document.createElement('li');
                li.textContent = rtStr(block[type]?.rich_text);
                content = li;
            } else if (type === 'quote') {
                const bq = document.createElement('blockquote');
                bq.textContent = rtStr(block.quote?.rich_text);
                content = bq;
            } else if (type === 'code') {
                const pre = document.createElement('pre');
                pre.textContent = rtStr(block.code?.rich_text);
                content = pre;
            } else if (type === 'image') {
                const img = document.createElement('img');
                img.src = block.image?.external?.url || '';
                img.onerror = () => { img.style.display = 'none'; };
                content = img;
            } else if (type === 'video') {
                const div = document.createElement('div');
                div.className = 'nc-mp';
                div.textContent = `🎬 视频: ${block.video?.external?.url || ''}`;
                content = div;
            } else if (type === 'embed') {
                const div = document.createElement('div');
                div.className = 'nc-mp';
                div.textContent = `📺 嵌入: ${block.embed?.url || ''}`;
                content = div;
            } else if (type === 'table') {
                const table = document.createElement('table');
                table.style.cssText = 'border-collapse:collapse;width:100%';
                for (const row of block.table?.children || []) {
                    const tr = document.createElement('tr');
                    for (const cell of row.table_row?.cells || []) {
                        const td = document.createElement('td');
                        td.textContent = Array.isArray(cell) ? cell.map(t => t.text?.content || '').join('') : '';
                        td.style.cssText = 'border:1px solid #ccc;padding:4px';
                        tr.appendChild(td);
                    }
                    table.appendChild(tr);
                }
                content = table;
            } else if (type === 'toggle') {
                const det = document.createElement('details');
                const sum = document.createElement('summary');
                sum.textContent = rtStr(block.toggle?.rich_text);
                det.appendChild(sum);
                for (const child of block.toggle?.children || []) {
                    const cd = document.createElement('div');
                    cd.style.marginLeft = '1em';
                    renderPreview(child, cd, -1);
                    det.appendChild(cd);
                }
                content = det;
            }

            if (content) wrap.appendChild(content);
            container.appendChild(wrap);
        }

        function refreshPreview() {
            el.pv.innerHTML = '';
            if (!blocks.length) { el.pv.textContent = '无内容'; return; }
            blocks.forEach((b, i) => renderPreview(b, el.pv, i));
        }

        el.pv.addEventListener('click', (e) => {
            const del = e.target.closest('.nc-pd');
            if (!del) return;
            e.preventDefault();
            e.stopPropagation();
            const item = del.closest('.nc-pi');
            if (!item) return;
            const idx = parseInt(item.dataset.index, 10);
            if (!isNaN(idx) && idx >= 0 && idx < blocks.length) {
                blocks.splice(idx, 1);
                refreshPreview();
            }
        });

        /* ================================================================
         *  15. 模态框
         * ================================================================ */

        function showConfirm(title) {
            el.title.value = title;
            el.tags.value = '';
            refreshPreview();
            el.ovCfm.style.display = 'flex';
            confirmOpen = true;
            document.addEventListener('keydown', onConfirmKey, true);
        }

        function closeConfirm() {
            el.ovCfm.style.display = 'none';
            confirmOpen = false;
            document.removeEventListener('keydown', onConfirmKey, true);
        }

        function onConfirmKey(e) {
            if (!confirmOpen) return;
            if (e.key === 'Escape') { e.preventDefault(); closeConfirm(); return; }
            if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
                const active = shadow.activeElement || document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
                e.preventDefault();
                el.pv.focus();
                const range = document.createRange();
                range.selectNodeContents(el.pv);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }

        function openSettings() {
            el.tok.value = GM_getValue(STORAGE.TOKEN, '');
            el.db.value = GM_getValue(STORAGE.DB_ID, '');
            el.tag.value = GM_getValue(STORAGE.TAGS_PROP, 'Tags');
            tokVisible = false;
            el.tok.classList.add('masked');
            el.tokTgl.textContent = '👁️';
            el.ovSet.style.display = 'flex';
        }

        function triggerClipper() {
            if (!GM_getValue(STORAGE.TOKEN) || !GM_getValue(STORAGE.DB_ID)) {
                toast('请先右键点击 ✂️ 按钮进行 Notion 配置！', 'error');
                openSettings();
                return;
            }
            startSelect();
        }

        /* ================================================================
         *  16. Notion API
         * ================================================================ */

        async function apiReq(method, url, data, retries = C.API_RETRY) {
            let lastErr = null;
            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    return await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method, url,
                            headers: {
                                'Authorization': `Bearer ${GM_getValue(STORAGE.TOKEN)}`,
                                'Content-Type': 'application/json',
                                'Notion-Version': '2022-06-28',
                            },
                            data: data ? JSON.stringify(data) : null,
                            timeout: C.API_TIMEOUT,
                            onload(res) {
                                if (res.status >= 200 && res.status < 300) {
                                    try { resolve(JSON.parse(res.responseText)); }
                                    catch { reject(Object.assign(new Error('响应解析失败'), { status: res.status })); }
                                } else {
                                    let msg;
                                    try { msg = JSON.parse(res.responseText).message || res.responseText.substring(0, 200); }
                                    catch { msg = (res.responseText || 'Unknown').substring(0, 200); }
                                    const err = new Error(`API ${res.status}: ${msg}`);
                                    err.status = res.status;
                                    err.retryAfter = parseInt(res.responseHeaders?.match(/Retry-After:\s*(\d+)/i)?.[1] || '0', 10) || 0;
                                    reject(err);
                                }
                            },
                            onerror:   () => reject(Object.assign(new Error('网络错误'), { network: true })),
                            ontimeout: () => reject(Object.assign(new Error('请求超时'), { network: true })),
                        });
                    });
                } catch (err) {
                    lastErr = err;
                    const retryable = err.network || err.status === 429 || (err.status >= 500 && err.status < 600);
                    if (attempt < retries - 1 && retryable) {
                        await new Promise(r => setTimeout(r, Math.max((err.retryAfter || 0) * 1000, 1000 * 2 ** attempt)));
                        continue;
                    }
                    throw err;
                }
            }
            throw lastErr;
        }

        async function appendChildren(pageId, blks) {
            for (let i = 0; i < blks.length; i += C.BATCH_SIZE) {
                await apiReq('PATCH', `https://api.notion.com/v1/blocks/${pageId}/children`, {
                    children: blks.slice(i, i + C.BATCH_SIZE),
                });
            }
        }

        async function sendToNotion() {
            el.send.disabled = true;
            el.send.textContent = '发送中...';
            const dbId = GM_getValue(STORAGE.DB_ID).replace(/-/g, '');
            const title = el.title.value || document.title || 'Untitled';
            const tags = el.tags.value.split(',').map(t => t.trim()).filter(Boolean);
            const tagsProp = GM_getValue(STORAGE.TAGS_PROP, 'Tags').trim();

            try {
                if (!/^[a-f0-9]{32}$/i.test(dbId)) throw new Error('Database ID 格式不正确（应为 32 位字符）');

                const dbInfo = await apiReq('GET', `https://api.notion.com/v1/databases/${dbId}`);
                const props = dbInfo.properties || {};

                if (tagsProp && tags.length && !props[tagsProp]) {
                    try {
                        await apiReq('PATCH', `https://api.notion.com/v1/databases/${dbId}`, {
                            properties: { [tagsProp]: { type: 'multi_select', multi_select: {} } },
                        });
                        props[tagsProp] = { type: 'multi_select' };
                    } catch (e) { console.warn('[NC] 自动创建标签属性失败', e); }
                }

                let titleKey = 'Name';
                for (const k in props) if (props[k].type === 'title') { titleKey = k; break; }

                const properties = {
                    [titleKey]: { title: [{ text: { content: title.substring(0, C.TITLE_MAX) } }] },
                };

                if (tagsProp && tags.length && props[tagsProp]) {
                    const t = props[tagsProp].type;
                    if (t === 'select') properties[tagsProp] = { select: { name: tags[0].slice(0, C.TAG_NAME_MAX) } };
                    else if (t === 'multi_select') properties[tagsProp] = { multi_select: tags.map(tg => ({ name: tg.slice(0, C.TAG_NAME_MAX) })) };
                }

                const urlPropMap = {
                    'URL':           () => safeURL(location.href),
                    'Content Image': () => safeURL(pageMainImage()),
                    'Icon':          () => safeURL(pageIcon()),
                };
                for (const [key, getter] of Object.entries(urlPropMap)) {
                    if (props[key]?.type === 'url') {
                        const val = getter();
                        if (val) properties[key] = { url: val };
                    }
                }

                const firstBatch = blocks.slice(0, C.BATCH_SIZE);
                const payload = { parent: { database_id: dbId }, properties, children: firstBatch };
                const iconUrl = safeURL(pageIcon());
                if (iconUrl) payload.icon = { type: 'external', external: { url: iconUrl } };

                const resp = await apiReq('POST', 'https://api.notion.com/v1/pages', payload);
                lastPageId = resp.id;

                if (blocks.length > C.BATCH_SIZE) {
                    try { await appendChildren(resp.id, blocks.slice(C.BATCH_SIZE)); }
                    catch (e) { console.error('[NC] 追加块失败', e); toast('⚠️ 页面已创建，但部分内容追加失败', 'error'); }
                }

                closeConfirm();
                el.ovOk.style.display = 'flex';
            } catch (err) {
                console.error('[NC]', err);
                toast(`❌ 发送失败: ${(err.message || '未知错误').substring(0, 200)}`, 'error');
            } finally {
                el.send.disabled = false;
                el.send.textContent = '发送';
            }
        }

        /* ================================================================
         *  17. 事件绑定
         * ================================================================ */

        el.tokTgl.addEventListener('click', () => {
            tokVisible = !tokVisible;
            el.tok.classList.toggle('masked', !tokVisible);
            el.tokTgl.textContent = tokVisible ? '🙈' : '👁️';
        });

        $('#btn-sc').addEventListener('click', () => { el.ovSet.style.display = 'none'; });

        $('#btn-ss').addEventListener('click', () => {
            const token = el.tok.value.trim();
            const dbId = el.db.value.trim().replace(/-/g, '');
            if (!token || !dbId) { toast('Token 和 ID 不能为空', 'error'); return; }
            if (!/^[a-f0-9]{32}$/i.test(dbId)) { toast('Database ID 格式不正确（应为 32 位字符）', 'error'); return; }
            GM_setValue(STORAGE.TOKEN, token);
            GM_setValue(STORAGE.DB_ID, dbId);
            GM_setValue(STORAGE.TAGS_PROP, el.tag.value.trim());
            el.ovSet.style.display = 'none';
            toast('✅ 保存成功！');
        });

        // ↩ 重选：关闭确认框 → 清空已提取内容 → 重新进入框选模式
        el.back.addEventListener('click', () => {
            closeConfirm();
            blocks = [];
            hlTarget = null;
            startSelect();
        });

        $('#btn-cc').addEventListener('click', closeConfirm);
        el.send.addEventListener('click', sendToNotion);

        el.okOpen.addEventListener('click', () => {
            if (lastPageId) window.open(`https://www.notion.so/${lastPageId.replace(/-/g, '')}`, '_blank');
        });
        el.okClose.addEventListener('click', () => { el.ovOk.style.display = 'none'; });
        el.ovOk.addEventListener('click', (e) => { if (e.target === el.ovOk) el.ovOk.style.display = 'none'; });

        /* ---------- 初始化位置 ---------- */
        loadPos();
    }

    ncInit();
})();
