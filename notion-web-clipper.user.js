// ==UserScript==
// @name Notion & Feishu & Obsidian Web Clipper
// @namespace https://github.com/yuhaung/notion-web-clipper
// @version      5.18.0
// @description 悬停高亮 + 单击选取，保存至 Notion、飞书文档、Obsidian。变更日志见脚本头部 v5.16.x ~ v5.18.x 注释与 CHANGELOG.md。
// @author yuhauang
// @match *://*/*
// @noframes
// @grant GM_xmlhttpRequest
// @grant GM_setValue
// @grant GM_getValue
// @grant GM_setClipboard
// @connect api.notion.com
// @connect open.feishu.cn
// @connect *.notion.so
// @connect *.feishu.cn
// @connect *.feishucdn.com
// @connect *.zhihu.com
// @connect *.zhimg.com
// @connect *.x.com
// @connect *.twimg.com
// @connect *.googleusercontent.com
// @connect *.githubusercontent.com
// @connect *.github.io
// @connect *.weibo.com
// @connect *.sinaimg.cn
// @connect *.sina.com.cn
// @connect *.bdimg.com
// @connect *.bilibili.com
// @connect *.hdslb.com
// @connect *.qpic.cn
// @connect *.xiaohongshu.com
// @connect *.xhscdn.com
// @connect *.byteimg.com
// @connect *.douyinpic.com
// @connect *.wp.com
// @connect *.wordpress.com
// @connect *.medium.com
// @connect *.cdninstagram.com
// @connect *.cloudfront.net
// @connect *.amazonaws.com
// @connect *.imgur.com
// @connect *.gstatic.com
// @connect *.google.com
// @connect 127.0.0.1
// @connect localhost
// @connect *.csdnimg.cn
// @connect *.juejin.cn
// @connect *.sspai.com
// @connect *.126.net
// @connect *.notion-static.com
// @connect *.notion.site
// @connect *.larksuite.com
// @license MIT
// ==/UserScript==

(function () {
 'use strict';
 if (window.self !== window.top) return;

 // ---- 单实例清理：重复注入时先卸载旧实例 ----
 if (typeof window.__ncCleanup === 'function') { try { window.__ncCleanup(); } catch {   } }
 const _cleanupFns = [];
 window.__ncCleanup = () => { for (const fn of _cleanupFns) { try { fn(); } catch {   } } _cleanupFns.length = 0; };

 // ===== 常量与配置 =====
 // v5.16.1 修复：断点续传网络丢响应重复写入（Notion/飞书重试前对账已写入边界）、Obsidian 保存路径穿越、发送态异常按钮与进度条卡死、拖拽窗口外松手持续跟随、closed Shadow DOM Ctrl+A 选中预览、Notion 标签属性类型不兼容静默丢弃、提取异常停留选取模式、连接测试汇总显示失败原因；清理重复代码、统一命名注释；UI：设计令牌体系、WCAG AA 对比度、label/role/aria、窄屏断点、触摸目标、reduced-motion。
// v5.16.2 修复：飞书断点续传边界被嵌套降级块污染（重试丢块）、拖拽复位定时器竞态、选取 rAF 清理遗漏、预览链接协议复验；统一 zh* 命名与分节注释；UI：模态焦点管理与 Tab 循环、进度条 aria 语义、占位符对比度、预览图片失败占位。
// v5.17.0 UI 重做（纯表现层，业务与存储契约不变）：设计令牌补齐（圆角/间距/字阶/字体族/层级阴影/动效曲线，含暗色与高对比度覆写）；中文字体与 Emoji 字体回退补齐（原字体族无中文回退，中文环境易落宋体）；悬浮球改内联 SVG 剪刀图标（原 ✂️ 各平台字形差异大）+ 渐变材质 + 触摸命中区外扩；提示条去掉 nowrap/ellipsis（原长提示在窄屏被截断）+ 入场动画 + 毛玻璃；高亮框加圆角、遮罩加边缘暗角；弹窗 sticky 标题/底部按钮条上方漏内容（"穿模"）修复，底部改为渐隐遮罩 + margin-top:auto；设置面板分区卡片化（通用 / Notion / 飞书 / Obsidian / 标签 / 备份 / 历史 / 快捷键），原生复选框升级为滑动开关并带启用状态指示灯；确认面板新增发送目标徽章、可展开预览（原固定 250px）、按钮按主次分组；完成面板新增自动关闭倒计时；发送/重试按钮新增加载态；错误详情 word-break 由 break-all 改为 overflow-wrap:anywhere（不再把英文单词与 URL 任意截断）且改为左对齐；滚动条美化；新增 prefers-contrast 与 760px 中间断点。
// v5.18.0 信息架构与交互补全（业务与存储契约不变）：① 设置面板改「左侧标签栏 + 右侧内容区」八分区导航（通用/Notion/飞书/Obsidian/标签/备份/历史/快捷键），≤600px 由 CSS 降级为手风琴，同一份 DOM 两套呈现；上次所在分区持久化（nc_set_tab）；点击确认面板平台徽章直达对应分区；标签栏支持 ↑/↓ 键盘导航与 role=tablist 语义。② 手动主题切换（跟随系统 / 浅色 / 深色，存储键 nc_theme）：暗色令牌抽出为单一来源 DARK_VARS，由「系统深色且未被手动指定浅色」与「手动深色」两条选择器共用，避免两份副本漂移；同步接管 prefers-contrast 与 color-scheme；主题随配置备份导出/导入。③ 自绘确认对话框替换全部 5 处原生 confirm()（关闭未保存设置、导出未保存提示、导出含明文密钥、清空发送历史、保存外部 Obsidian API 地址），返回 Promise 并接入既有焦点记忆 / Tab 循环 / Esc 层级；原生 confirm 在部分站点会被 CSP 或页面脚本拦截改写。④ 平台状态三态可视化：分区指示灯与标签栏指示灯改为 on / warn（已启用但凭据不全）/ off，设置面板内读表单实时值（勾掉开关立刻灯灭，无需先保存）；悬浮球新增角标显示已就绪平台数，0 个时转警示态。⑤ 修正 Esc / Tab 的叠加层级顺序（ovSet 与 ovAsk 排在最前）。
const SCRIPT_VERSION = '5.18.0';
 const C = Object.freeze({
  TEXT_SAFE: 1990, RT_ITEMS_MAX: 100, BATCH_SIZE: 100,
  TABLE_MAX_COLS: 5, TABLE_MAX_ROWS: 100, TAG_NAME_MAX: 100, URL_MAX: 2000,
  API_RETRY: 3, API_TIMEOUT: 30000, TITLE_MAX: 200, BTN_SIZE: 50,
  VISIBLE_PART: 25, SNAP_THRESHOLD: 30, LARGE_IMG_RATIO: 0.8, DRAG_CLICK_PX: 4,
  IMG_CHECK_MS: 250, TOAST_MS: 3000, TOAST_MAX: 3, HISTORY_MAX: 20, WALK_DEPTH_MAX: 60,
  BLOCKS_WARN: 500, FS_BATCH: 50, FS_IMG_PER_REQ: 20,
  FS_UPLOAD_TIMEOUT: 60000, FS_INIT_WAIT: 500, FS_INIT_RETRY: 2, FS_IMG_WARN: 30,
  FS_REL_RETRY: 2, FS_REL_RETRY_WAIT: 800,
  IMG_DL_TIMEOUT: 20000, IMG_DL_RETRY: 2,
  IMG_UP_MAX: 15 * 1024 * 1024, IMG_DL_CACHE_MAX: 50, IMG_DL_CACHE_BYTES: 50 * 1024 * 1024, FS_BLOCK_DEPTH_MAX: 40,
  CLONE_NODE_MAX: 5000, PREVIEW_DEPTH_MAX: 30, OBS_WRITE_GAP: 300, OBS_RETRY: 3,
  TW_CONV_MAX: 60, IMG_FAIL_TTL: 30000, IMG_FAIL_MAX: 256,
  NOTION_REQ_BLOCKS_MAX: 950, NOTION_REQ_BYTES_MAX: 450 * 1024,
 });

 const SEND_PROFILES = Object.freeze({
  gentle: Object.freeze({ staggerMs: 700, imgConc: 2, apiGapMs: 550 }),
  standard: Object.freeze({ staggerMs: 300, imgConc: 3, apiGapMs: 350 }),
 });
 const STORAGE = Object.freeze({
  ENABLE_NOTION: 'enable_notion', ENABLE_FEISHU: 'enable_feishu', TOKEN: 'notion_token',
  DB_ID: 'notion_db_id', TAGS_PROP: 'notion_tags_prop', FS_APP_ID: 'feishu_app_id',
  FS_APP_SECRET: 'feishu_app_secret', FS_FOLDER: 'feishu_folder', BTN_LEFT: 'nc_btn_left',
  BTN_TOP: 'nc_btn_top', BTN_HIDDEN: 'nc_btn_hidden', BTN_EDGE: 'nc_btn_edge',
  ENABLE_OBSIDIAN: 'enable_obsidian',
  OBSIDIAN_API_URL: 'obsidian_api_url', OBSIDIAN_API_KEY: 'obsidian_api_key',
  OBSIDIAN_FOLDER: 'obsidian_folder',
  LAST_TAGS: 'nc_last_tags',
  BLOCKLIST: 'nc_blocklist',
  DOMAIN_TAGS: 'nc_domain_tags',
  SEND_PROFILE: 'nc_send_profile',
  HISTORY: 'nc_send_history',
  THEME: 'nc_theme',
  SET_TAB: 'nc_set_tab',
});

 const FS_BLK = Object.freeze({ TEXT: 2, H1: 3, H2: 4, H3: 5, H4: 6, H5: 7, H6: 8, H7: 9, H8: 10, H9: 11, BULLET: 12, ORDERED: 13, CODE: 14, QUOTE: 15, DIVIDER: 22, IMAGE: 27 });
 const FS_NESTABLE = new Set([FS_BLK.TEXT, FS_BLK.BULLET, FS_BLK.ORDERED, FS_BLK.QUOTE, FS_BLK.CODE, FS_BLK.DIVIDER, FS_BLK.IMAGE]);
 const BLOCK_TAGS = new Set(['P','DIV','SECTION','ARTICLE','LI','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','PRE','TABLE','ASIDE','MAIN','HEADER','FOOTER']);
 const INLINE_TAGS = new Set(['SPAN','A','EM','STRONG','B','I','U','INS','CODE','MARK','SMALL','SUB','SUP','S','DEL','STRIKE']);
 const SKIP_TAGS = new Set(['STYLE','SCRIPT','NOSCRIPT','TEMPLATE','SVG','PATH']);
 const HEADING_RE = /^H([1-6])$/;
 const DATA_IMG_RE = /^data:image\//i;
 const ZHIHU_REMOVE = ['.ContentItem-actions','.Post-actions','.VoteButtons','.ArticleHeaderActions','.ContentItem-more','.RichContent-actions','.ContentItem-time','.ContentItem-arrowIcon','.ContentItem-extra','.ContentItem-status','.Reward','.Post-Subtitle','.CornerButtons','.QuestionAnswer-actions','.QuestionAnswer-meta','.ArticleHeader-info','.FollowButton','.AnswerItem-extra','.AnswerItem-status','.Post-Header','.ArticleHeader','.QuestionHeader','.QuestionButtonGroup','.Question-mainColumn .Question-sideColumn','.Question-sideColumn','.Question-actions','.Question-follow','.Question-status','.Post-bottom','.Article-actions','.Question-related','.Voters','.RichContent-cover','.RichContent-cover-inner'].join(',');
 const NOTION_LANGS = new Set(['abap','agda','arduino','ascii art','assembly','bash','basic','bnf','c','c#','c++','clojure','coffeescript','coq','css','dart','dhall','diff','docker','ebnf','elixir','elm','erlang','f#','flow','fortran','gherkin','glsl','go','graphql','groovy','haskell','hcl','html','idris','java','javascript','json','julia','kotlin','latex','less','lisp','livescript','llvm ir','lua','makefile','markdown','markup','matlab','mathematica','mermaid','nix','objective-c','ocaml','pascal','perl','php','plain text','powershell','prolog','protobuf','purescript','python','r','racket','reason','ruby','rust','sass','scala','scheme','scss','shell','smalltalk','solidity','sql','swift','toml','typescript','vb.net','verilog','vhdl','visual basic','webassembly','xml','yaml']);
 const LANG_ALIAS = Object.freeze({ js:'javascript',ts:'typescript',py:'python',sh:'shell',zsh:'bash',fish:'shell',cpp:'c++',cxx:'c++',csharp:'c#',golang:'go',rs:'rust',rb:'ruby',kt:'kotlin',objc:'objective-c',md:'markdown',yml:'yaml',plaintext:'plain text',txt:'plain text',text:'plain text',html5:'html',vue:'html',jsx:'javascript',tsx:'typescript','c++20':'c++',shellsession:'shell',console:'shell',ini:'plain text',conf:'plain text' });
 const FEISHU_LANG_MAP = { 'plain text':1,'abap':2,'ada':3,'apache':4,'apex':5,'assembly':6,'bash':7,'c#':8,'c++':9,'c':10,'cobol':11,'css':12,'coffeescript':13,'d':14,'dart':15,'delphi':16,'django':17,'docker':18,'erlang':19,'fortran':20,'foxpro':21,'go':22,'groovy':23,'html':24,'htmlbars':25,'http':26,'haskell':27,'json':28,'java':29,'javascript':30,'julia':31,'kotlin':32,'latex':33,'lisp':34,'logo':35,'lua':36,'matlab':37,'makefile':38,'markdown':39,'nginx':40,'objective-c':41,'openedgeabl':42,'php':43,'perl':44,'postscript':45,'powershell':46,'prolog':47,'protobuf':48,'python':49,'r':50,'rpg':51,'ruby':52,'rust':53,'sas':54,'scss':55,'sql':56,'scala':57,'scheme':58,'scratch':59,'shell':60,'swift':61,'thrift':62,'typescript':63,'vbscript':64,'visual basic':65,'xml':66,'yaml':67,'cmake':68,'diff':69,'gherkin':70,'graphql':71,'glsl':72,'properties':73,'solidity':74,'toml':75 };
 const IMG_EXT = Object.freeze({ 'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/bmp':'bmp','image/tiff':'tif','image/svg+xml':'svg','image/x-icon':'ico','image/vnd.microsoft.icon':'ico','image/heic':'heic','image/heif':'heif','image/avif':'avif' });
 // localhost 与私网 IP 字面量判定统一在 isSensitiveHost 内完成（含 *.localhost 子域），与 isPrivateURL 口径一致
 const SENSITIVE_DOMAINS = [/bank\./i,/mail\./i,/outlook\./i,/^pay\./i,/alipay\./i,/tenpay\./i,/paypal\./i,/^passport\./i,/^account\./i,/^auth\./i,/^login\./i,/^admin\./i,/^console\./i,/^manage\./i,/^dashboard\./i];

 const PLATFORM_LABELS = Object.freeze({ notion: 'Notion', feishu: '飞书', obsidian: 'Obsidian' });

 // ===== 通用工具与重试 =====
 const sleep = (ms) => new Promise(r => setTimeout(r, ms));
 const pad2 = (n) => String(n).padStart(2, '0');

 function tryParseJSON(text) {
  try { return JSON.parse(text); } catch { return null; }
 }

const _hdrReCache = new Map();
function parseResponseHeader(res, name) {
 const headers = String(res?.responseHeaders || '');
 let re = _hdrReCache.get(name);
 if (!re) { re = new RegExp(`${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^\\r\\n;]+)`, 'i'); _hdrReCache.set(name, re); }
 const m = headers.match(re);
 return m ? m[1].trim() : '';
}

 function isRetryableError(err) {
  return !!err && (!!err.network || err.status === 429 || (err.status >= 500 && err.status < 600));
 }

 /**
  * 通用重试包装器：统一 Notion / 飞书 / Obsidian / 图片下载的退避逻辑。
  * @param {() => Promise<T>} fn 业务函数，抛出的 error 可携带 retryable/network/retryAfter/status
  * @param {object} opts retries / baseDelay / retryOn(err,attempt)
  */
 async function withRetry(fn, opts) {
  const { retries = C.API_RETRY, baseDelay = 1000, retryOn } = opts || {};
  const total = Math.max(1, retries);
  let lastErr = null;
  for (let attempt = 0; attempt < total; attempt++) {
   try { return await fn(attempt, lastErr); }
   catch (err) {
    lastErr = err;
    const retryable = retryOn ? retryOn(err, attempt) : isRetryableError(err);
    if (attempt < total - 1 && retryable) {
     const retryAfterSec = (err?.retryAfter || 0);
     if (retryAfterSec > 0) { await sleep(Math.min(retryAfterSec * 1000 + 250, 60000)); continue; }
     const backoff = baseDelay * (1 << attempt);
     const jitter = 0.75 + Math.random() * 0.5;
     await sleep(backoff * jitter);
     continue;
    }
    throw err;
   }
  }
  throw lastErr;
 }

 function isSensitiveHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (isPrivateIPLiteral(h)) return true;
  for (const re of SENSITIVE_DOMAINS) if (re.test(h)) return true;
  return false;
 }

 function isUserBlocked(hostname, raw) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return false;
  for (let line of String(raw || '').split(/[,\n]/)) {
   line = line.trim().toLowerCase();
   if (!line) continue;
   if (line.startsWith('*.')) { if (h.endsWith(line.slice(1))) return true; }
   else if (h === line || h.endsWith('.' + line)) return true;
  }
  return false;
 }

 function matchDomainTags(raw, hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return '';
  for (const line of String(raw || '').split(/\n+/)) {
   const i = line.indexOf('=');
   if (i <= 0) continue;
   const host = line.slice(0, i).trim().toLowerCase().replace(/^\*\./, '');
   const tags = line.slice(i + 1).trim();
   if (!host || !tags) continue;
   if (h === host || h.endsWith('.' + host)) return tags;
  }
  return '';
 }

 const PRIVATE_IPV4_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.1[89]\.)/;
 const PRIVATE_IPV6_RE = /^(::1$|fe80:|fc00:|fd00:)/i;
 // === '[::ffff:7f00:1]' —— WHATWG URL 将 IPv6 序列化为十六进制组而非点分十进制；
 function ipv4FromMappedHost(host) {
  const m = /^::ffff:(.+)$/i.exec(String(host || ''));
  if (!m) return null;
  const tail = m[1];
  if (tail.indexOf('.') >= 0) {
   if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(tail)) return null;
   const p = tail.split('.').map(Number);
   if (p.some(v => !(v >= 0 && v <= 255))) return null;
   return p;
  }
  const hm = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
  if (!hm) return null;
  const hi = parseInt(hm[1], 16), lo = parseInt(hm[2], 16);
  if (!(hi >= 0 && hi <= 0xffff) || !(lo >= 0 && lo <= 0xffff)) return null;
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
 }
 // 私有网段/IP 字面量判定单一来源——isSensitiveHost 与 isPrivateURL 共用同一口径。
 function isPrivateIPLiteral(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  let ipClassified = false;
  const mappedV4 = ipv4FromMappedHost(h);
  if (mappedV4) {
   ipClassified = true;
   const dottedMapped = mappedV4.join('.');
   if (PRIVATE_IPV4_RE.test(dottedMapped) || mappedV4[0] === 255) return true;
  }
  if (PRIVATE_IPV4_RE.test(h)) {
   if (/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.test(h)) { const p = h.split('.').map(Number); if (p[0] === 255) return true; }
   return true;
  }
  if (PRIVATE_IPV6_RE.test(h)) return true;
  // IP 字面量 fail-closed——形似 IP 却无法解析归类的按私有处理：① 含 ':' 的其余 IPv6 变体；
  const isStdQuad = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(h);
  if (!ipClassified && !isStdQuad && (h.includes(':') || /^[\d.]+$/.test(h) || /^0x[0-9a-f]+$/i.test(h))) return true;
  return false;
 }
 function isPrivateURL(urlStr) {
  try {
   const u = new URL(urlStr); const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
   if (h === 'localhost' || h.endsWith('.localhost')) return true;
   if (isPrivateIPLiteral(h)) return true;
   if (h === '169.254.169.254' || h === 'metadata.google.internal') return true;
   return false;
  } catch { return false; }
 }

 function isLocalishTarget(urlStr) {
  try {
   const u = new URL(String(urlStr || '').trim());
   if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
   return isPrivateURL('https://' + u.hostname);
  } catch { return false; }
 }

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
 function resolveImgURL(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (DATA_IMG_RE.test(s)) return s;
  return normOrSafe(s);
 }
 // 协议相对 / 根相对补全优先，其次走 new URL 校验；两阶段解析在多处复用，收敛为具名函数
 const normOrSafe = (raw) => normURL(raw) || safeURL(raw);
 function parseDbId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.replace(/-/g, '').match(/[a-f0-9]{32}/i);
  return m ? m[0] : '';
 }

 // 合并 INLINE_TAGS 与 A 两个冗余分支（原两分支仅差末尾换行，且两类标签集无交集，
 // 合并后行为等价）；firstChild/nextSibling 直连遍历 + 字符串累加替代 parts 数组，
 // 消除每次调用的临时数组与 join 开销——表格逐格、标题提取等高频路径收益明显。
 function innerText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName;
  if (tag === 'IMG' || tag === 'VIDEO' || tag === 'IFRAME') return '';
  if (tag === 'BR') return '\n';
  let s = '';
  for (let c = node.firstChild; c; c = c.nextSibling) s += innerText(c);
  if (BLOCK_TAGS.has(tag) && tag !== 'TABLE') s += '\n';
  return s;
 }
 function mergeAnnot(tag, parent) {
  const a = parent ? { ...parent } : {};
  if (tag === 'B' || tag === 'STRONG') a.bold = true;
  if (tag === 'I' || tag === 'EM') a.italic = true;
  if (tag === 'U' || tag === 'INS') a.underline = true;
  if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') a.strikethrough = true;
  if (tag === 'CODE') a.code = true;
  return Object.keys(a).length ? a : null;
 }

 // ===== 图片类型嗅探与 data: 解码 =====
 const IMG_SIGNATURES = [
  { sig: [0x89,0x50,0x4E,0x47], ct: 'image/png' },
  { sig: [0xFF,0xD8,0xFF], ct: 'image/jpeg' },
  { sig: [0x47,0x49,0x46,0x38], ct: 'image/gif' },
  { sig: [0x42,0x4D], ct: 'image/bmp' },
  { sig: [0x49,0x49,0x2A,0x00], ct: 'image/tiff' },
  { sig: [0x4D,0x4D,0x00,0x2A], ct: 'image/tiff' },
  { sig: [0x00,0x00,0x01,0x00], ct: 'image/x-icon' },
  { sig: [0x52,0x49,0x46,0x46], off: 8, sig2: [0x57,0x45,0x42,0x50], ct: 'image/webp' },
 ];
 function sniffImageType(buf) {
  const b = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
  if (b.length < 4) return null;
  for (const { sig, off, sig2, ct } of IMG_SIGNATURES) {
   if (sig.every((v, i) => b[i] === v)) {
    if (sig2) { const at = off || sig.length; if (at + sig2.length > b.length) continue; if (!sig2.every((v, i) => b[at + i] === v)) continue; }
    return ct;
   }
  }
  if (b.length >= 5) {
   const head = String.fromCharCode(b[0], b[1], b[2], b[3], b[4]).toLowerCase();
   if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'image/svg+xml';
  }
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
   const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
   if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'heim') return 'image/heic';
   if (brand === 'heif' || brand === 'mif1' || brand === 'msf1') return 'image/heif';
   if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return null;
 }

 function decodeDataURL(url) {
  const m = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/is.exec(url);
  if (!m) return null;
  const b64 = m[1];
  const approx = Math.floor(b64.length * 3 / 4);
  if (!approx || approx > C.IMG_UP_MAX) return null;
  try {
   const bin = atob(b64);
   const len = bin.length;
   if (!len || len > C.IMG_UP_MAX) return null;
   const bytes = new Uint8Array(len);
   for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
   return { buf: bytes.buffer, ct: 'image/unknown' };
  } catch { return null; }
 }

 // ===== Notion 块构建 =====
 function toRich(text) {
  const s = String(text ?? '');
  if (!s) return [];
  const items = [];
  for (let i = 0; i < s.length && items.length < C.RT_ITEMS_MAX; i += C.TEXT_SAFE)
   items.push({ type: 'text', text: { content: s.slice(i, i + C.TEXT_SAFE) } });
  if (items.length === C.RT_ITEMS_MAX && s.length > C.RT_ITEMS_MAX * C.TEXT_SAFE) {
   const last = items[items.length - 1].text.content;
   items[items.length - 1].text.content = last.slice(0, -3) + '...';
  }
  return items;
 }
 function capRT(rt) {
  const out = [];
  for (const item of rt || []) {
   if (out.length >= C.RT_ITEMS_MAX) break;
   const content = String(item.text?.content ?? '');
   if (!content) continue;
   const link = item.text?.link?.url ? safeURL(item.text.link.url) : null;
   const annots = item.annotations || null;
   if (content.length <= C.TEXT_SAFE) {
    const node = { type: 'text', text: { content } };
    if (link) node.text.link = { url: link };
    if (annots) node.annotations = annots;
    out.push(node);
    continue;
   }
   const first = { type: 'text', text: { content: content.slice(0, C.TEXT_SAFE) } };
   if (link) first.text.link = { url: link };
   if (annots) first.annotations = annots;
   out.push(first);
   for (let i = C.TEXT_SAFE; i < content.length && out.length < C.RT_ITEMS_MAX; i += C.TEXT_SAFE)
    out.push({ type: 'text', text: { content: content.slice(i, i + C.TEXT_SAFE) } });
  }
  return out;
 }
 const mkBlockRT = (type, rt, extra) => ({ object: 'block', type, [type]: { rich_text: (rt && rt.length) ? rt : [{ type: 'text', text: { content: '' } }], ...(extra || {}) } });
 const mkBlock = (type, text, extra) => mkBlockRT(type, toRich(text), extra);
 const mkPara = (t) => mkBlock('paragraph', t);
 const mkH = (lv, t) => mkBlock(`heading_${Math.min(Math.max(lv | 0, 1), 3)}`, t);
 const mkQuote = (t) => mkBlock('quote', t);
 const mkDivider = () => ({ object: 'block', type: 'divider', divider: {} });
 const mkCode = (text, lang) => {
  const l = lang ? String(lang).toLowerCase().trim() : '';
  return mkBlock('code', text, { language: NOTION_LANGS.has(l) ? l : (LANG_ALIAS[l] || 'plain text') });
 };
 const mkRichPara = (richArr) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: capRT(richArr) } });
 function mkMedia(type, rawUrl) {
  const raw = String(rawUrl || '');
  if (type === 'image' && DATA_IMG_RE.test(raw)) return { object: 'block', type: 'image', image: { type: 'external', external: { url: raw } } };
  const url = safeURL(raw);
  if (!url) return null;
  if (type === 'image') return { object: 'block', type: 'image', image: { type: 'external', external: { url } } };
  if (type === 'video') return { object: 'block', type: 'video', video: { type: 'external', external: { url } } };
  return { object: 'block', type: 'embed', embed: { url } };
 }
 // mkMedia 返回块或 null；调用方多需要「0 或 1 个块」的数组，收敛为具名函数
 const mediaBlocks = (type, url) => { const b = mkMedia(type, url); return b ? [b] : []; };
 function mkTable(rows, hasHeader) {
  const valid = rows.filter(r => Array.isArray(r) && r.length > 0);
  if (!valid.length) return [];
  let w = 1;
  for (const r of valid) w = Math.max(w, r.length);
  w = Math.min(w, C.TABLE_MAX_COLS);
  const norm = valid.map(row => {
   const cells = [];
   for (let i = 0; i < w; i++) {
    let t = String(row[i] ?? '');
    if (i === w - 1 && row.length > C.TABLE_MAX_COLS) {
     const overflow = row.slice(C.TABLE_MAX_COLS).map(c => String(c ?? '').trim()).filter(Boolean);
     if (overflow.length) t = [t.trim(), ...overflow].filter(Boolean).join(' / ');
    }
    cells.push(t ? toRich(t) : []);
   }
   return { type: 'table_row', table_row: { cells } };
  });
  const out = [];
  for (let i = 0; i < norm.length; i += C.TABLE_MAX_ROWS)
   out.push({ object: 'block', type: 'table', table: { table_width: w, has_column_header: hasHeader && i === 0, children: norm.slice(i, i + C.TABLE_MAX_ROWS) } });
  return out;
 }
 const rtStr = (rt) => (rt || []).map(t => t?.text?.content || '').join('');
 const cellText = (cell) => Array.isArray(cell) ? cell.map(t => t.text?.content || '').join('') : '';
 function tableToParas(tbl) {
  const out = [];
  for (const row of tbl.table?.children || []) {
   const line = (row.table_row?.cells || []).map(cellText).join(' | ');
   if (line.trim()) out.push(mkPara(line));
  }
  return out;
 }
 function stripDeep(blocks) {
  const out = [];
  for (const b of blocks) {
   if (!b) continue;
   if (b.type === 'table') { out.push(...tableToParas(b)); continue; }
   const body = b[b.type];
   if (body && Array.isArray(body.children)) { const kids = body.children; delete body.children; out.push(b); out.push(...stripDeep(kids)); }
   else out.push(b);
  }
  return out;
 }
 function flattenToggle(children, depth = 0) {
  if (depth > C.WALK_DEPTH_MAX) return [];
  const out = [];
  for (const b of children) {
   if (!b) continue;
   if (b.type === 'toggle') {
    out.push(mkPara('▸ ' + rtStr(b.toggle?.rich_text)));
    out.push(...flattenToggle(b.toggle?.children || [], depth + 1));
   } else if (b.type === 'table') out.push(...tableToParas(b));
   else out.push(...stripDeep([b]));
  }
  return out;
 }
 const mkToggle = (summary, children) => {
  const flat = flattenToggle(children).slice(0, C.BATCH_SIZE);
  const toggle = { rich_text: toRich(summary) };
  if (flat.length) toggle.children = flat;
  return { object: 'block', type: 'toggle', toggle };
 };

 // ===== 飞书块转换 =====
 function richToFeishuElements(rt) {
  const elements = [];
  for (const item of rt || []) {
   const text = item.text?.content || '';
   if (!text) continue;
   const style = {};
   const a = item.annotations || {};
   if (a.bold) style.bold = true;
   if (a.italic) style.italic = true;
   if (a.strikethrough) style.strikethrough = true;
   if (a.underline) style.underline = true;
   if (a.code) style.inline_code = true;
   if (item.text?.link?.url) style.link = { url: item.text.link.url };
   elements.push({ text_run: { content: text, text_element_style: Object.keys(style).length ? style : undefined } });
  }
  return elements;
 }
 function fsPushText(out, blockType, key, elements) {
  if (!elements.some(e => (e.text_run?.content || '').trim())) return false;
  out.push({ block_type: blockType, [key]: { elements } });
  return true;
 }
 function fsLinkPara(text, url) {
  return { block_type: FS_BLK.TEXT, text: { elements: [{ text_run: { content: text, text_element_style: url ? { link: { url } } : undefined } }] } };
 }
 function blocksToFeishu(blocks, ctx, depth = 0) {
  if (depth > C.FS_BLOCK_DEPTH_MAX) return;
  for (const block of blocks) {
   const type = block.type;
   if (type === 'paragraph') {
    fsPushText(ctx.out, FS_BLK.TEXT, 'text', richToFeishuElements(block.paragraph?.rich_text));
   } else if (type.startsWith('heading_')) {
    const level = Math.min(Math.max(parseInt(type.split('_')[1], 10) || 1, 1), 9);
    const headingKey = `heading${level}`;
    fsPushText(ctx.out, FS_BLK[`H${level}`] ?? FS_BLK.TEXT, headingKey, richToFeishuElements(block[type]?.rich_text));
   } else if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
    const bullet = type === 'bulleted_list_item';
    const pushed = fsPushText(ctx.out, bullet ? FS_BLK.BULLET : FS_BLK.ORDERED, bullet ? 'bullet' : 'ordered', richToFeishuElements(block[type]?.rich_text));
    const kids = block[type]?.children;
    if (Array.isArray(kids) && kids.length) {
     const childCtx = { out: [], jobs: [], imgInfo: ctx.imgInfo, nest: [] };
     blocksToFeishu(kids, childCtx, depth + 1);
     const nestable = pushed && childCtx.out.length > 0 && childCtx.out.every(b => FS_NESTABLE.has(b.block_type));
     if (nestable) {
      ctx.nest.push({ index: ctx.out.length - 1, ctx: childCtx });
     } else {
      const offset = ctx.out.length;
      ctx.out.push(...childCtx.out);
      for (const j of childCtx.jobs) ctx.jobs.push({ index: offset + j.index, info: j.info });
      for (const nj of childCtx.nest) ctx.nest.push({ index: offset + nj.index, ctx: nj.ctx });
     }
    }
   } else if (type === 'quote') {
    fsPushText(ctx.out, FS_BLK.QUOTE, 'quote', richToFeishuElements(block.quote?.rich_text));
   } else if (type === 'code') {
    const els = richToFeishuElements(block.code?.rich_text);
    if (els.length) {
     const lang = (block.code?.language || 'plain text').toLowerCase();
     ctx.out.push({ block_type: FS_BLK.CODE, code: { elements: els, style: { language: FEISHU_LANG_MAP[lang] || 1 } } });
    }
   } else if (type === 'image') {
    const url = block.image?.external?.url || '';
    const info = url ? ctx.imgInfo?.get(url) : null;
    if (info) { ctx.jobs.push({ index: ctx.out.length, info }); ctx.out.push({ block_type: FS_BLK.IMAGE, image: {} }); }
    else if (url && !DATA_IMG_RE.test(url)) ctx.out.push(fsLinkPara(`🖼️ 图片: ${url}`, url));
    else if (url) ctx.out.push({ block_type: FS_BLK.TEXT, text: { elements: [{ text_run: { content: '🖼️ [内嵌图片过大或格式不支持，已略过]' } }] } });
   } else if (type === 'video' || type === 'embed') {
    const url = block[type]?.external?.url || block[type]?.url || '';
    if (url) ctx.out.push(fsLinkPara(`🔗 媒体: ${url}`, url));
   } else if (type === 'table') {
    for (const row of block.table?.children || []) {
     const cells = row.table_row?.cells || [];
     const text = cells.map(cellText).join(' | ');
     if (text.trim()) ctx.out.push({ block_type: FS_BLK.TEXT, text: { elements: [{ text_run: { content: text } }] } });
    }
   } else if (type === 'divider') {
    ctx.out.push({ block_type: FS_BLK.DIVIDER, divider: {} });
   } else if (type === 'toggle') {
    fsPushText(ctx.out, FS_BLK.TEXT, 'text', richToFeishuElements(block.toggle?.rich_text));
    const kids = block.toggle?.children;
    if (Array.isArray(kids) && kids.length) blocksToFeishu(kids, ctx, depth + 1);
   }
  }
 }

 // ===== Markdown 序列化 =====
 const mdUrl = (u) => String(u || '').replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
 function richToMd(rt) {
  if (!rt) return '';
  return rt.map(t => {
   let text = t.text?.content || '';
   if (!text) return '';
   const a = t.annotations || {};
   if (a.code) text = '`' + text + '`';
   if (a.bold) text = '**' + text + '**';
   if (a.italic) text = '*' + text + '*';
   if (a.strikethrough) text = '~~' + text + '~~';
   if (a.underline) text = '<u>' + text + '</u>';
   if (t.text?.link?.url) text = `[${text}](${mdUrl(t.text.link.url)})`;
   return text;
  }).join('');
 }
 // 片段收集到数组后单次 join 返回——循环内 md += 会累计 O(块数) 次拼接，
 // 长文档（数千块、嵌套列表）时字符串树膨胀且每次拼接产生新串；数组 + join 为线性路径。行为不变。
 function blocksToMarkdown(blocks, indent = '') {
  const out = [];
  for (const b of blocks) {
   const type = b.type;
   if (type === 'paragraph') out.push(indent + richToMd(b.paragraph?.rich_text) + '\n\n');
   else if (type.startsWith('heading_')) { const lv = parseInt(type.split('_')[1], 10) || 1; out.push(indent + '#'.repeat(lv) + ' ' + richToMd(b[type]?.rich_text) + '\n\n'); }
   else if (type === 'bulleted_list_item') { out.push(indent + '- ' + richToMd(b[type]?.rich_text).replace(/\n/g, '\n  ') + '\n'); if (Array.isArray(b[type]?.children) && b[type].children.length) out.push(blocksToMarkdown(b[type].children, indent + '  ')); }
   else if (type === 'numbered_list_item') { out.push(indent + '1. ' + richToMd(b[type]?.rich_text).replace(/\n/g, '\n   ') + '\n'); if (Array.isArray(b[type]?.children) && b[type].children.length) out.push(blocksToMarkdown(b[type].children, indent + '   ')); }
   else if (type === 'quote') out.push(indent + '> ' + richToMd(b.quote?.rich_text).replace(/\n/g, '\n> ') + '\n\n');
   else if (type === 'code') { const lang = b.code?.language || ''; out.push(indent + '```' + lang + '\n' + rtStr(b.code?.rich_text) + '\n```\n\n'); }
   else if (type === 'image') { const url = b.image?.external?.url || ''; out.push(DATA_IMG_RE.test(url) ? indent + '🖼️ [内嵌图片(data:)，已略过]\n\n' : indent + `![](${mdUrl(url)})\n\n`); }
   else if (type === 'video' || type === 'embed') { const url = b[type]?.external?.url || b[type]?.url || ''; out.push(indent + `[媒体链接](${mdUrl(url)})\n\n`); }
   else if (type === 'table') {
    const mdCell = (cell) => cellText(cell).replace(/\|/g, '\\|');
    const rows = b.table?.children || [];
    if (rows.length > 0) {
     const firstRow = rows[0].table_row?.cells || [];
     out.push(indent + '| ' + firstRow.map(mdCell).join(' | ') + ' |\n');
     out.push(indent + '| ' + firstRow.map(() => '---').join(' | ') + ' |\n');
     for (let i = 1; i < rows.length; i++) { const cells = rows[i].table_row?.cells || []; out.push(indent + '| ' + cells.map(mdCell).join(' | ') + ' |\n'); }
     out.push('\n');
    }
   }
   else if (type === 'divider') out.push(indent + '---\n\n');
   else if (type === 'toggle') out.push(indent + '<details>\n' + indent + '<summary>' + rtStr(b.toggle?.rich_text) + '</summary>\n\n' + blocksToMarkdown(b.toggle?.children || [], indent) + '\n' + indent + '</details>\n\n');
  }
  return out.join('');
 }

 const normalizeObsidianBase = (raw) => {
  let b = String(raw || '').trim() || 'http://127.0.0.1:27123';
  if (!/^https?:\/\//i.test(b)) b = 'http://' + b;
  return b.replace(/\/+$/, '').replace(/\/vault$/i, '');
 };

 // ===== 设置读取与存储 =====
 function readSettings() {
  return {
   notionToken: GM_getValue(STORAGE.TOKEN, ''),
   notionDbId: GM_getValue(STORAGE.DB_ID, ''),
   notionTagsProp: GM_getValue(STORAGE.TAGS_PROP, 'Tags'),
   enableNotion: GM_getValue(STORAGE.ENABLE_NOTION, null),
   fsAppId: GM_getValue(STORAGE.FS_APP_ID, ''),
   fsAppSecret: GM_getValue(STORAGE.FS_APP_SECRET, ''),
   fsFolder: GM_getValue(STORAGE.FS_FOLDER, ''),
   enableFeishu: GM_getValue(STORAGE.ENABLE_FEISHU, null),
   enableObsidian: GM_getValue(STORAGE.ENABLE_OBSIDIAN, null),
   obsApiUrl: GM_getValue(STORAGE.OBSIDIAN_API_URL, 'http://127.0.0.1:27123'),
   obsApiKey: GM_getValue(STORAGE.OBSIDIAN_API_KEY, ''),
   obsFolder: GM_getValue(STORAGE.OBSIDIAN_FOLDER, ''),
   blocklist: GM_getValue(STORAGE.BLOCKLIST, ''),
   domainTags: GM_getValue(STORAGE.DOMAIN_TAGS, ''),
   sendProfile: GM_getValue(STORAGE.SEND_PROFILE, 'gentle'),
   theme: GM_getValue(STORAGE.THEME, 'auto'),
  };
}
 let S = readSettings();
 const refreshSettings = () => { S = readSettings(); };
 const getProfile = () => SEND_PROFILES[S.sendProfile] || SEND_PROFILES.gentle;

 // ===== UI 样式与模板 =====
// 暗色令牌只写一份，由「系统深色且未被手动指定浅色」与「手动指定深色」两条选择器共用，
// 避免同一套色值出现两份副本后逐渐漂移。
const DARK_VARS = `--c-bg:#1e1e1e;--c-surface-sunken:#242424;--c-scrollbar:#4a4a4a;--c-scrollbar-hover:#626262;--c-badge-on-bg:#243447;--c-badge-on-text:#8ec2f5;--c-badge-off-bg:#2f2f2f;--c-badge-off-text:#9a9a9a;--sh-pop:0 8px 24px rgba(0,0,0,.5);--sh-hi:0 12px 28px rgba(0,0,0,.6);--sh-inset-t:inset 0 1px 0 rgba(255,255,255,.08);--c-toast-shadow:0 6px 20px rgba(0,0,0,.45);--c-text:#e0e0e0;--c-text-sec:#bbb;--c-border:#444;--c-border-hover:#5a5a5a;--c-input-bg:#2a2a2a;--c-bg-sec:#333;--c-pv-bg:#2a2a2a;--c-pv-text:#ddd;--c-pv-border:#444;--c-code-bg:#333;--c-th-bg:#383838;--c-td-border:#555;--c-btn-sec-bg:#333;--c-btn-sec-text:#e0e0e0;--c-btn-ghost-bg:#1e1e1e;--c-btn-ghost-text:#5b9fe6;--c-btn-ghost-border:#5b9fe6;--c-help:#9a9a9a;--c-kbd-bg:#333;--c-kbd-border:#555;--c-progress-bg:#444;--c-err-bg:#3a1a1a;--c-err-border:#5c2828;--c-err-text:#ff6b6b;--c-err-succ-bg:#1a3a1a;--c-err-succ-border:#2d5c2d;--c-err-succ-text:#6bdf6b;--c-accent:#5b9fe6;--c-accent-hover:#4a8ed5;--c-accent-strong:#5b9fe6;--c-accent-ink:#5b9fe6;--c-toast-info:#b45309;--c-ring:rgba(91,159,230,.2);--c-success:#6bdf6b;--c-success-solid:#2d7d46;--c-danger:#ff6b6b;--c-danger-solid:#b71c1c;--c-danger-solid-hover:#8e1414;--c-warn:#f0a860;--c-accent-soft:#243447;--c-hl-fill:rgba(91,159,230,.16);--c-hl-inner:rgba(255,255,255,.35);--c-hl-ring:rgba(91,159,230,.28);--c-focus-ring:rgba(91,159,230,.5);--c-scrim:rgba(0,0,0,.72);--c-tip-bg:rgba(0,0,0,.88);--c-tip-text:#fff;--c-placeholder:#9a9a9a;--c-btn-disabled-bg:#2f2f2f;--c-btn-disabled-text:#9a9a9a;--c-brand-fs:#5b95ff;--c-brand-obs:#a78bfa;--sh-float:0 4px 12px rgba(0,0,0,.45);--sh-modal:0 24px 48px rgba(0,0,0,.55),0 4px 12px rgba(0,0,0,.35);--dur-fast:.15s;--dur-base:.2s;--ease:cubic-bezier(.2,0,.2,1)`;
 const PANEL_CSS = `:host{all:initial;color-scheme:light dark;--c-bg:#fff;--c-text:#333;--c-text-sec:#555;--c-border:#ddd;--c-border-hover:#bfbfbf;--c-input-bg:#fff;--c-bg-sec:#f0f0f0;--c-pv-bg:#fafafa;--c-pv-text:#333;--c-pv-border:#eee;--c-code-bg:#f0f0f0;--c-th-bg:#e8e8e8;--c-td-border:#ccc;--c-btn-sec-bg:#f0f0f0;--c-btn-sec-text:#333;--c-btn-ghost-bg:#fff;--c-btn-ghost-text:#1667bb;--c-btn-ghost-border:#2383e2;--c-help:#6f6f6f;--c-kbd-bg:#f0f0f0;--c-kbd-border:#ccc;--c-progress-bg:#eee;--c-err-bg:#fff5f5;--c-err-border:#ffcdd2;--c-err-text:#d32f2f;--c-err-succ-bg:#f1f8e9;--c-err-succ-border:#c8e6c9;--c-err-succ-text:#2d7d46;--c-accent:#2383e2;--c-accent-hover:#1b6ec2;--c-accent-strong:#1b6ec2;--c-accent-ink:#1667bb;--c-toast-info:#b45309;--c-ring:rgba(27,110,194,.16);--c-success:#2d7d46;--c-success-solid:#2d7d46;--c-danger:#d32f2f;--c-danger-solid:#c62828;--c-danger-solid-hover:#b71c1c;--c-warn:#b45309;--c-accent-soft:#eaf2fb;--c-hl-fill:rgba(35,131,226,.1);--c-hl-inner:rgba(255,255,255,.6);--c-hl-ring:rgba(35,131,226,.22);--c-focus-ring:rgba(35,131,226,.45);--c-scrim:rgba(0,0,0,.6);--c-tip-bg:rgba(0,0,0,.85);--c-tip-text:#fff;--c-placeholder:#767676;--c-btn-disabled-bg:#f0f0f0;--c-btn-disabled-text:#555;--c-brand-fs:#2c62e0;--c-brand-obs:#7c3aed;--sh-float:0 4px 12px rgba(0,0,0,.15);--sh-modal:0 24px 48px rgba(15,23,42,.16),0 4px 12px rgba(15,23,42,.08);--dur-fast:.15s;--dur-base:.2s;--ease:cubic-bezier(.2,0,.2,1)}
:host{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;--font-mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono","Courier New",monospace;--r-xs:3px;--r-sm:4px;--r-md:6px;--r-lg:8px;--r-xl:12px;--r-2xl:16px;--r-full:999px;--sp-1:4px;--sp-2:6px;--sp-3:8px;--sp-4:12px;--sp-5:16px;--sp-6:20px;--sp-7:28px;--fs-xs:11px;--fs-sm:12px;--fs-base:13px;--fs-md:14px;--fs-lg:16px;--fs-xl:18px;--lh-tight:1.35;--lh-base:1.55;--sh-pop:0 8px 24px rgba(0,0,0,.18);--sh-hi:0 12px 28px rgba(15,23,42,.22);--sh-inset-t:inset 0 1px 0 rgba(255,255,255,.6);--dur-slow:.3s;--ease-out:cubic-bezier(.16,1,.3,1);--ease-spring:cubic-bezier(.34,1.4,.64,1);--c-scrollbar:#cfcfcf;--c-scrollbar-hover:#b0b0b0;--c-surface-sunken:#fafafa;--c-badge-on-bg:#eaf2fb;--c-badge-on-text:#1667bb;--c-badge-off-bg:#f0f0f0;--c-badge-off-text:#767676;--c-toast-shadow:0 6px 20px rgba(15,23,42,.2)}
*{box-sizing:border-box;margin:0;padding:0;line-height:var(--lh-base);font-family:var(--font-sans)}
::placeholder{color:var(--c-placeholder);opacity:1}
::selection{background:var(--c-accent-soft);color:var(--c-text)}
.nc-host-scroll::-webkit-scrollbar,.nc-modal::-webkit-scrollbar,.nc-pv::-webkit-scrollbar,.nc-err::-webkit-scrollbar,.nc-panes::-webkit-scrollbar,.nc-nav::-webkit-scrollbar{width:10px;height:10px}
.nc-modal::-webkit-scrollbar-track,.nc-pv::-webkit-scrollbar-track,.nc-err::-webkit-scrollbar-track,.nc-panes::-webkit-scrollbar-track,.nc-nav::-webkit-scrollbar-track{background:transparent}
.nc-modal::-webkit-scrollbar-thumb,.nc-pv::-webkit-scrollbar-thumb,.nc-err::-webkit-scrollbar-thumb,.nc-panes::-webkit-scrollbar-thumb,.nc-nav::-webkit-scrollbar-thumb{background:var(--c-scrollbar);border-radius:var(--r-full);border:3px solid var(--c-bg);background-clip:padding-box}
.nc-modal::-webkit-scrollbar-thumb:hover,.nc-pv::-webkit-scrollbar-thumb:hover,.nc-err::-webkit-scrollbar-thumb:hover,.nc-panes::-webkit-scrollbar-thumb:hover,.nc-nav::-webkit-scrollbar-thumb:hover{background:var(--c-scrollbar-hover);background-clip:padding-box}
.nc-panes{scrollbar-width:thin;scrollbar-color:var(--c-scrollbar) transparent}
.nc-pv::-webkit-scrollbar-thumb,.nc-err::-webkit-scrollbar-thumb{border-color:var(--c-pv-bg)}
.nc-err::-webkit-scrollbar-thumb{border-color:var(--c-err-bg)}
.nc-modal{scrollbar-width:thin;scrollbar-color:var(--c-scrollbar) transparent}
.nc-btn{position:fixed;width:${C.BTN_SIZE}px;height:${C.BTN_SIZE}px;border-radius:var(--r-full);background:linear-gradient(180deg,var(--c-accent-hover),var(--c-accent) 60%);color:#fff;border:2px solid #fff;cursor:pointer;box-shadow:var(--sh-float),var(--sh-inset-t);font-size:24px;line-height:1;display:flex;align-items:center;justify-content:center;transition:left var(--dur-base) var(--ease),top var(--dur-base) var(--ease),opacity var(--dur-slow) var(--ease),transform var(--dur-fast) var(--ease-spring),box-shadow var(--dur-base) var(--ease),filter var(--dur-base) var(--ease);user-select:none;-webkit-user-select:none;touch-action:none;-webkit-tap-highlight-color:transparent;pointer-events:auto;left:auto;right:20px;top:auto;bottom:20px;will-change:left,top;padding:0}
.nc-btn-ico{width:24px;height:24px;display:block;pointer-events:none;filter:drop-shadow(0 1px 1px rgba(0,0,0,.25));transition:transform var(--dur-base) var(--ease-spring)}
.nc-btn:hover{background:linear-gradient(180deg,var(--c-accent),var(--c-accent-hover));transform:scale(1.06);box-shadow:var(--sh-pop),var(--sh-inset-t)}
.nc-btn:hover .nc-btn-ico{transform:rotate(-10deg) scale(1.05)}
.nc-btn:active{transform:scale(.94)}
.nc-btn:active .nc-btn-ico{transform:rotate(0) scale(.92)}
/* 悬浮球角标：一眼看出当前有几个平台已就绪；0 个时转为警示态，避免用户点开才发现没配置 */
.nc-btn-badge{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 5px;border-radius:var(--r-full);background:var(--c-success-solid);color:#fff;font-size:10px;font-weight:700;line-height:18px;text-align:center;letter-spacing:0;box-shadow:0 0 0 2px var(--c-bg);pointer-events:none;font-family:var(--font-sans)}
.nc-btn-badge.is-warn{background:var(--c-warn);color:#fff8ec}
.nc-btn-badge[hidden]{display:none}
.nc-btn.edge{opacity:.58;filter:saturate(.82)}
.nc-btn.edge:hover{opacity:1;filter:none}
.nc-btn:focus-visible{outline:2px solid #fff;outline-offset:2px;box-shadow:0 0 0 4px var(--c-focus-ring),var(--sh-pop)}
@media (pointer:coarse){.nc-btn::after{content:'';position:absolute;inset:-7px;border-radius:var(--r-full)}}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--c-accent);outline-offset:1px;border-radius:var(--r-sm)}
.nc-tip{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--c-tip-bg);color:var(--c-tip-text);padding:10px 18px;border-radius:var(--r-xl);font-size:var(--fs-md);font-weight:500;letter-spacing:.01em;text-align:center;text-wrap:balance;pointer-events:none;box-shadow:var(--sh-pop);display:none;z-index:1;width:max-content;max-width:min(560px,92vw);line-height:var(--lh-tight);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:nc-tip-in .22s var(--ease-out)}
@keyframes nc-tip-in{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.nc-hl{position:fixed;top:0;left:0;width:0;height:0;border:3px solid var(--c-accent);border-radius:var(--r-md);background:var(--c-hl-fill);box-shadow:0 0 0 1px var(--c-hl-inner),0 0 0 5px var(--c-hl-ring),0 6px 18px var(--c-hl-ring);transition:none;pointer-events:none;display:none;will-change:transform}
.nc-mask{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;display:none;cursor:crosshair;pointer-events:auto;background:radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(15,23,42,.14) 100%)}
.nc-ov{position:fixed;top:0;left:0;width:100%;height:100%;background:var(--c-scrim);display:none;align-items:center;justify-content:center;pointer-events:auto;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:nc-fade-in .18s var(--ease)}
.nc-ov.nc-ov-tr{background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;animation:none;align-items:flex-start;justify-content:flex-end;pointer-events:none;padding:24px}
.nc-ov.nc-ov-tr .nc-modal{pointer-events:auto;width:420px;max-width:calc(100vw - 40px);max-height:calc(100vh - 40px);box-shadow:var(--sh-modal);animation:nc-slide-in .25s var(--ease)}
.nc-ov.nc-ov-tr .nc-modal.minimized{width:auto}
@keyframes nc-slide-in{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
@keyframes nc-fade-in{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:scale(1)}}
.nc-modal{background:var(--c-bg);padding:var(--sp-7);border-radius:var(--r-xl);width:580px;max-width:92vw;max-height:88vh;overflow-y:auto;overscroll-behavior:contain;box-shadow:var(--sh-modal),0 0 0 1px rgba(15,23,42,.06);display:flex;flex-direction:column;gap:var(--sp-4);color:var(--c-text);animation:nc-fade-in .18s var(--ease)}
.nc-modal h2{font-size:var(--fs-xl);font-weight:650;line-height:var(--lh-tight);letter-spacing:.01em;color:var(--c-text);position:sticky;top:0;z-index:3;background:var(--c-bg);padding-bottom:var(--sp-3)}
.nc-modal:not(.minimized) h2::before{content:'';position:absolute;left:0;right:0;top:-28px;height:28px;background:var(--c-bg)}
.nc-modal:not(.minimized) h2::after{content:'';position:absolute;left:0;right:0;bottom:-9px;height:8px;background:linear-gradient(to bottom,rgba(0,0,0,.055),transparent);pointer-events:none}
.nc-modal-h2{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3)}
.nc-min{background:none;border:none;cursor:pointer;font-size:15px;line-height:1;color:var(--c-help);width:28px;height:28px;flex:none;display:flex;align-items:center;justify-content:center;padding:0;border-radius:var(--r-sm);transition:background var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease),transform var(--dur-fast) var(--ease);font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}
.nc-min:hover{background:var(--c-bg-sec);color:var(--c-accent)}
.nc-min:active{transform:scale(.9)}
.nc-min:disabled{color:var(--c-btn-disabled-text);cursor:not-allowed}
.nc-modal.minimized{padding:8px 10px 8px 18px;gap:0;max-height:none;overflow:visible;border-radius:var(--r-full);box-shadow:var(--sh-pop),0 0 0 1px rgba(15,23,42,.06)}
.nc-modal.minimized h2{font-size:var(--fs-md);padding-bottom:0;white-space:nowrap}
.nc-modal.minimized h2 ~ *{display:none !important}
.nc-modal h3{font-size:var(--fs-lg);font-weight:650;letter-spacing:.01em;color:var(--c-text);margin-top:var(--sp-5);display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--c-border);padding-bottom:var(--sp-2)}
.nc-modal h3 > span:first-child{display:inline-flex;align-items:center;gap:var(--sp-2)}
.nc-modal label{font-size:var(--fs-base);color:var(--c-text-sec);font-weight:600;letter-spacing:.01em;margin-top:var(--sp-1)}
.nc-modal input,.nc-modal select,.nc-modal textarea{width:100%;padding:9px 11px;border:1px solid var(--c-border);border-radius:var(--r-md);font-size:var(--fs-md);background:var(--c-input-bg);color:var(--c-text);transition:border-color var(--dur-fast) var(--ease),box-shadow var(--dur-fast) var(--ease),background var(--dur-fast) var(--ease)}
.nc-modal input:hover,.nc-modal select:hover,.nc-modal textarea:hover{border-color:var(--c-border-hover)}
.nc-modal input:focus,.nc-modal select:focus,.nc-modal textarea:focus{border-color:var(--c-accent);box-shadow:0 0 0 3px var(--c-ring);outline:none}
.nc-modal select{cursor:pointer;appearance:none;-webkit-appearance:none;padding-right:32px;background-image:linear-gradient(45deg,transparent 50%,var(--c-help) 50%),linear-gradient(135deg,var(--c-help) 50%,transparent 50%);background-position:calc(100% - 17px) calc(50% + 1px),calc(100% - 12px) calc(50% + 1px);background-size:5px 5px,5px 5px;background-repeat:no-repeat}
.nc-modal textarea{resize:vertical;min-height:56px;line-height:var(--lh-base);font-family:var(--font-mono);font-size:var(--fs-base)}
.nc-sec{background:var(--c-surface-sunken);border:1px solid var(--c-border);border-radius:var(--r-lg);padding:var(--sp-4);margin-top:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-3);transition:border-color var(--dur-base) var(--ease)}
.nc-sec:focus-within{border-color:var(--c-border-hover)}
.nc-sec > h3{margin-top:0;padding-bottom:var(--sp-2)}
.nc-sec > .nc-help:last-child{margin-bottom:0}
.nc-dot{width:7px;height:7px;border-radius:var(--r-full);flex:none;background:var(--c-border);box-shadow:0 0 0 3px var(--c-badge-off-bg);transition:background var(--dur-base) var(--ease),box-shadow var(--dur-base) var(--ease)}
/* 标签栏与手风琴标题上的状态点：语义色（绿=就绪 / 琥珀=凭据不全），
   区别于分区卡片内用品牌色的那颗——导航位只回答「能不能用」，不回答「是哪家」 */
.nc-dot.on{background:var(--c-success);box-shadow:0 0 0 3px var(--c-err-succ-bg)}
.nc-dot.warn{background:var(--c-warn);box-shadow:0 0 0 3px var(--c-err-succ-bg)}
.nc-sec.on > h3 .nc-dot{background:var(--c-success);box-shadow:0 0 0 3px var(--c-err-succ-bg)}
.nc-plat-hd{display:inline-flex;align-items:center;gap:var(--sp-2);font-weight:650}
.nc-sec[data-plat=notion].on > h3 .nc-plat-hd{color:var(--c-text)}
.nc-sec[data-plat=feishu].on > h3 .nc-dot{background:var(--c-brand-fs);box-shadow:0 0 0 3px var(--c-accent-soft)}
.nc-sec[data-plat=obsidian].on > h3 .nc-dot{background:var(--c-brand-obs);box-shadow:0 0 0 3px var(--c-accent-soft)}
.nc-sec.warn > h3 .nc-dot{background:var(--c-warn);box-shadow:0 0 0 3px var(--c-err-succ-bg)}
/* 纯 CSS 显隐，无需 JS 参与：开关已开但凭据不全时明确告知会被跳过，避免「明明勾了却没发出去」 */
.nc-warn-hint{display:none;font-size:var(--fs-sm);color:var(--c-warn);border:1px solid var(--c-warn);border-radius:var(--r-md);padding:6px 10px;line-height:var(--lh-base)}
.nc-sec.warn > .nc-warn-hint{display:block}
/* ---------- 设置面板：左侧标签栏 + 右侧内容区（≤600px 降级为手风琴） ---------- */
.nc-set{width:min(740px,94vw);overflow:hidden}
.nc-set-body{display:flex;gap:var(--sp-5);align-items:stretch;flex:1 1 auto;min-height:0;overflow:hidden}
.nc-nav{flex:none;width:130px;display:flex;flex-direction:column;gap:2px;padding-right:var(--sp-4);margin-right:0;border-right:1px solid var(--c-border);overflow-y:auto;overscroll-behavior:contain}
.nc-nav-i{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:none;border-radius:var(--r-md);background:transparent;color:var(--c-text-sec);font-family:inherit;font-size:var(--fs-base);font-weight:600;line-height:var(--lh-tight);text-align:left;cursor:pointer;white-space:nowrap;transition:background var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease)}
.nc-nav-i:hover{background:var(--c-bg-sec);color:var(--c-text)}
.nc-nav-i[aria-selected=true]{background:var(--c-accent-soft);color:var(--c-accent);font-weight:650}
.nc-nav-ico{flex:none;width:16px;text-align:center;font-size:14px;line-height:1;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",var(--font-sans)}
.nc-nav-t{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis}
.nc-nav-i .nc-dot{margin-left:2px;box-shadow:0 0 0 2.5px var(--c-badge-off-bg)}
.nc-nav-i .nc-dot.on,.nc-nav-i .nc-dot.warn{box-shadow:0 0 0 2.5px var(--c-err-succ-bg)}
.nc-pane-hd .nc-dot{margin-left:6px;box-shadow:0 0 0 2.5px var(--c-badge-off-bg)}
.nc-pane-hd .nc-dot.on,.nc-pane-hd .nc-dot.warn{box-shadow:0 0 0 2.5px var(--c-err-succ-bg)}
.nc-panes{flex:1 1 auto;min-width:0;overflow-y:auto;overscroll-behavior:contain;padding-right:2px}
.nc-pane{display:none;flex-direction:column}
.nc-pane.active{display:flex;animation:nc-pane-in .2s var(--ease-out)}
@keyframes nc-pane-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.nc-pane-hd{display:none}
.nc-pane > .nc-sec:first-of-type{margin-top:0}
/* ---------- 自绘询问框 ---------- */
.nc-ask-msg{font-size:var(--fs-md);color:var(--c-text-sec);white-space:pre-wrap;overflow-wrap:anywhere;line-height:var(--lh-base)}
.nc-row{display:flex;flex-wrap:wrap;gap:var(--sp-3) 10px;justify-content:flex-end;align-items:center}
.nc-modal > .nc-row:last-child{position:sticky;bottom:0;z-index:2;background:var(--c-bg);margin-top:auto;padding:var(--sp-4) 0 2px}
.nc-modal > .nc-row:last-child::before{content:'';position:absolute;left:0;right:0;bottom:100%;height:18px;background:linear-gradient(to top,var(--c-bg) 35%,transparent);pointer-events:none}
.nc-sep{flex:none;align-self:stretch;width:1px;min-height:24px;margin:0 2px;background:var(--c-border)}
.nc-grow{flex:1 1 auto}
.nc-b{padding:9px 16px;border:none;border-radius:var(--r-md);cursor:pointer;font-weight:600;font-size:var(--fs-md);letter-spacing:.01em;line-height:var(--lh-tight);transition:filter var(--dur-fast) var(--ease),transform var(--dur-fast) var(--ease),background var(--dur-fast) var(--ease),box-shadow var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease);white-space:nowrap;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.nc-b:active{transform:scale(.97)}
.nc-b1{background:var(--c-accent-strong);color:#fff;box-shadow:0 1px 2px rgba(15,23,42,.14)}
.nc-b1:hover{filter:brightness(.94);box-shadow:0 4px 14px rgba(35,131,226,.3)}
.nc-b2{background:var(--c-btn-sec-bg);color:var(--c-btn-sec-text)}
.nc-b2:hover{filter:brightness(.95);background:var(--c-border)}
.nc-bk{background:var(--c-btn-ghost-bg);color:var(--c-btn-ghost-text);border:1.5px solid var(--c-btn-ghost-border)}
.nc-bk:hover{filter:none;background:var(--c-accent-soft)}
.nc-bk:active{background:var(--c-accent-soft)}
.nc-b-sm{padding:6px 11px;font-size:var(--fs-sm);font-weight:600;border-width:1px}
.nc-b.is-loading{position:relative;padding-left:34px;pointer-events:none}
.nc-b.is-loading::before{content:'';position:absolute;left:12px;top:50%;width:13px;height:13px;margin-top:-7px;border:2px solid currentColor;border-top-color:transparent;border-radius:var(--r-full);opacity:.6;animation:nc-spin .6s linear infinite}
@keyframes nc-spin{to{transform:rotate(360deg)}}
.nc-bk-brand-fs{color:var(--c-brand-fs);border-color:var(--c-brand-fs)}
.nc-bk-brand-fs:hover{background:var(--c-accent-soft)}
.nc-bk-brand-obs{color:var(--c-brand-obs);border-color:var(--c-brand-obs)}
.nc-bk-brand-obs:hover{background:var(--c-accent-soft)}
.nc-br{background:var(--c-danger-solid);color:#fff;box-shadow:0 1px 2px rgba(15,23,42,.14)}
.nc-br:hover{background:var(--c-danger-solid-hover);box-shadow:0 4px 14px rgba(198,40,40,.3)}
.nc-b:disabled,.nc-br:disabled,.nc-tb:disabled{background:var(--c-btn-disabled-bg);color:var(--c-btn-disabled-text);border-color:var(--c-border);cursor:not-allowed;filter:none;opacity:1;transform:none}
.nc-b:disabled:hover,.nc-br:disabled:hover,.nc-tb:disabled:hover{filter:none;transform:none;background:var(--c-btn-disabled-bg)}
.nc-help{font-size:var(--fs-sm);color:var(--c-help);margin-top:-4px;line-height:1.55}
.nc-help a{color:var(--c-accent-ink);text-decoration:underline;text-underline-offset:2px}
.nc-tw{position:relative;display:flex;align-items:center}
.nc-tw input{flex:1;padding-right:40px}
.nc-tv{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:none;border-radius:var(--r-sm);cursor:pointer;font-size:15px;line-height:1;color:var(--c-help);padding:0;transition:background var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease),transform var(--dur-fast) var(--ease);font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}
.nc-tv:hover{background:var(--c-bg-sec);color:var(--c-accent);transform:translateY(-50%)}
.nc-tv:active{transform:translateY(-50%) scale(.9)}
.nc-switch{display:inline-flex;align-items:center;gap:var(--sp-2);font-size:var(--fs-sm);color:var(--c-text-sec);font-weight:500;cursor:pointer;white-space:nowrap;user-select:none;-webkit-user-select:none}
.nc-switch:hover{color:var(--c-accent)}
.nc-modal .nc-switch input{width:34px;height:20px;flex:none;margin:0;padding:0;border:none;border-radius:var(--r-full);background:var(--c-border);position:relative;cursor:pointer;appearance:none;-webkit-appearance:none;transition:background var(--dur-base) var(--ease)}
.nc-modal .nc-switch input::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:var(--r-full);background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform var(--dur-base) var(--ease-spring)}
.nc-modal .nc-switch input:checked{background:var(--c-accent)}
.nc-modal .nc-switch input:checked::after{transform:translateX(14px)}
.nc-modal .nc-switch input:hover{border:none;background:var(--c-border-hover)}
.nc-modal .nc-switch input:checked:hover{background:var(--c-accent-hover)}
.nc-modal .nc-switch input:focus-visible{outline:2px solid var(--c-accent);outline-offset:2px;box-shadow:none}
.nc-pv{border:1px solid var(--c-pv-border);border-radius:var(--r-lg);padding:var(--sp-4);margin-top:0;max-height:250px;overflow-y:auto;overscroll-behavior:contain;background:var(--c-pv-bg);font-size:var(--fs-base);line-height:1.7;user-select:text;-webkit-user-select:text;transition:max-height var(--dur-slow) var(--ease-out)}
.nc-pv.expanded{max-height:min(58vh,560px)}
.nc-pv:focus-visible{outline:2px solid var(--c-accent);outline-offset:1px}
.nc-pv-head{display:flex;align-items:center;gap:var(--sp-3);margin-top:var(--sp-2);min-height:26px}
.nc-pv-head > label{margin-top:0}
.nc-pv-head .nc-info{margin-top:0;margin-left:auto;text-align:left;flex:none}
.nc-plats{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center}
.nc-plat{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:var(--r-full);font-size:var(--fs-sm);font-weight:600;letter-spacing:.01em;line-height:1.5;border:1px solid transparent;cursor:pointer;user-select:none;-webkit-user-select:none;transition:background var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease),border-color var(--dur-fast) var(--ease)}
.nc-plat::before{content:'';width:6px;height:6px;border-radius:var(--r-full);background:currentColor;flex:none;opacity:.9}
.nc-plat.on{background:var(--c-badge-on-bg);color:var(--c-badge-on-text)}
.nc-plat.off{background:var(--c-badge-off-bg);color:var(--c-badge-off-text);border-color:var(--c-border)}
.nc-plat.warn{background:var(--c-badge-off-bg);color:var(--c-warn);border-color:var(--c-warn)}
.nc-plat:hover{border-color:var(--c-accent);background:var(--c-accent-soft);color:var(--c-accent-ink)}
.nc-plat:active{transform:scale(.97)}
.nc-pv a{color:var(--c-accent-ink);text-decoration:underline}
.nc-pv hr{border:none;border-top:1px dashed var(--c-border);margin:6px 0}
.nc-pv img{max-width:100%;max-height:150px;display:block;margin:8px 0;border-radius:4px;background:var(--c-progress-bg);min-height:24px}
.nc-pv-img-err{border:1px dashed var(--c-border);border-radius:4px;background:var(--c-bg-sec);color:var(--c-help);font-size:12px;padding:8px 10px;text-align:center;margin:8px 0}
.nc-pv p{margin:4px 0;color:var(--c-pv-text);white-space:pre-wrap}
.nc-pv h1,.nc-pv h2,.nc-pv h3{margin:8px 0 4px;color:var(--c-text)}
.nc-pv h1{font-size:1.4em}.nc-pv h2{font-size:1.2em}.nc-pv h3{font-size:1.1em}
.nc-pv li{margin-left:1.5em;list-style:disc}
.nc-pv blockquote{border-left:3px solid var(--c-accent);padding-left:10px;color:var(--c-text-sec);margin:8px 0}
.nc-pv pre{background:var(--c-code-bg);padding:8px;border-radius:4px;white-space:pre-wrap;font-family:monospace}
.nc-pv table{border-collapse:collapse;width:100%}
.nc-pv table th{font-weight:700;background:var(--c-th-bg)}
.nc-pv table td,.nc-pv table th{border:1px solid var(--c-td-border);padding:4px}
.nc-pv-kids{margin-left:1.2em;border-left:2px solid var(--c-pv-border);padding-left:6px}
.nc-mp{color:var(--c-accent-ink);font-weight:600;margin:8px 0;background:var(--c-accent-soft);padding:6px 10px;border-radius:4px}
.nc-pi{position:relative;margin:4px 0}
.nc-pd{position:absolute;top:2px;right:2px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:var(--c-danger-solid);color:#fff;border:none;border-radius:var(--r-full);font-size:10px;line-height:1;padding:0;cursor:pointer;opacity:0;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:opacity var(--dur-fast) var(--ease),transform var(--dur-fast) var(--ease),background var(--dur-fast) var(--ease);z-index:2;pointer-events:auto}
.nc-pi:hover .nc-pd,.nc-pi:focus-within .nc-pd,.nc-pd:focus-visible{opacity:1}
.nc-pd:hover{background:var(--c-danger-solid-hover)}
.nc-pd:active{transform:scale(.88)}
@media (pointer:coarse){.nc-pd{opacity:.82;pointer-events:auto}}
.nc-ok{font-size:var(--fs-lg);font-weight:650;color:var(--c-success);text-align:center;margin:var(--sp-2) 0;line-height:var(--lh-tight)}
.nc-err{color:var(--c-err-text);background:var(--c-err-bg);border:1px solid var(--c-err-border);border-radius:var(--r-lg);padding:var(--sp-4);margin:var(--sp-2) 0;max-height:200px;overflow-y:auto;overscroll-behavior:contain;white-space:pre-wrap;word-break:normal;overflow-wrap:anywhere;line-height:1.6;font-family:var(--font-mono);font-size:var(--fs-sm);text-align:left}
.nc-err-succ{font-size:var(--fs-base);color:var(--c-err-succ-text);background:var(--c-err-succ-bg);border:1px solid var(--c-err-succ-border);border-radius:var(--r-lg);padding:10px var(--sp-4);margin:var(--sp-1) 0;line-height:1.6}
.nc-err-title{color:var(--c-danger)}
.nc-err-title.is-warn{color:var(--c-warn)}
.nc-tc{position:fixed;top:20px;right:20px;z-index:2147483647;display:flex;flex-direction:column;gap:var(--sp-3);pointer-events:none;max-width:min(360px,calc(100vw - 40px))}
.nc-t{padding:11px 16px;border-radius:var(--r-lg);color:#fff;font-size:var(--fs-md);font-weight:500;line-height:var(--lh-tight);box-shadow:var(--c-toast-shadow);pointer-events:auto;animation:nc-in .28s var(--ease-out);display:flex;align-items:flex-start;gap:var(--sp-3);word-break:break-word;overflow-wrap:anywhere}
.nc-ts{background:var(--c-success-solid)}.nc-te{background:var(--c-danger-solid)}.nc-ti{background:var(--c-toast-info)}
.nc-ts::before,.nc-te::before,.nc-ti::before{flex:none;width:17px;height:17px;margin-top:1px;border-radius:var(--r-full);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;line-height:1;background:rgba(255,255,255,.22)}
.nc-ts::before{content:'✓'}
.nc-te::before{content:'✕'}
.nc-ti::before{content:'i'}
.nc-info{font-size:var(--fs-sm);color:var(--c-help);text-align:right;margin-top:-4px;line-height:1.5}
.nc-progress{margin-top:var(--sp-2);height:7px;background:var(--c-progress-bg);border-radius:var(--r-full);overflow:hidden;display:none;box-shadow:inset 0 1px 2px rgba(0,0,0,.08)}
.nc-progress-bar{position:relative;height:100%;background:linear-gradient(90deg,var(--c-accent),var(--c-accent-hover));border-radius:var(--r-full);transition:width var(--dur-slow) var(--ease-out);width:0;overflow:hidden}
.nc-progress-bar::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent);animation:nc-shimmer 1.3s linear infinite}
@keyframes nc-shimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
.nc-shortcuts{margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);background:var(--c-surface-sunken);border:1px solid var(--c-border);border-radius:var(--r-lg);font-size:var(--fs-sm);color:var(--c-help);line-height:1.95}
.nc-shortcuts strong{display:block;color:var(--c-text-sec);font-size:var(--fs-sm);font-weight:650;margin-bottom:2px}
.nc-shortcuts kbd{display:inline-block;min-width:18px;text-align:center;background:var(--c-bg);border:1px solid var(--c-kbd-border);border-bottom-width:2px;border-radius:var(--r-xs);padding:1px 5px;margin:0 1px;font-size:var(--fs-xs);font-family:var(--font-mono);color:var(--c-text-sec);font-weight:600}
.nc-shortcuts kbd+kbd{margin-left:2px}
.nc-dirty{font-size:var(--fs-sm);color:var(--c-warn);margin-top:var(--sp-1);font-weight:650;display:none}
.nc-h3r{display:flex;align-items:center;gap:var(--sp-3);flex:none}
.nc-hist{margin-top:var(--sp-2);display:flex;flex-direction:column;gap:2px}
.nc-hist-item{display:flex;align-items:baseline;gap:var(--sp-3);font-size:var(--fs-sm);line-height:1.6;padding:4px 8px;border-radius:var(--r-sm);transition:background var(--dur-fast) var(--ease)}
.nc-hist-item:hover{background:var(--c-bg-sec)}
.nc-hist-time{color:var(--c-help);flex:none;font-family:var(--font-mono);font-size:var(--fs-xs);font-variant-numeric:tabular-nums}
.nc-hist-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--c-text-sec)}
.nc-hist-plat{margin-left:auto;flex:none;color:var(--c-accent-ink);font-weight:600}
.nc-hist-empty{font-size:var(--fs-sm);color:var(--c-help);text-align:center;padding:var(--sp-5) 10px;border:1px dashed var(--c-border);border-radius:var(--r-md);line-height:1.6}
.nc-empty{padding:var(--sp-7) var(--sp-4);text-align:center;color:var(--c-help);font-size:var(--fs-sm)}
.nc-empty b{display:block;font-weight:650;color:var(--c-text-sec);font-size:var(--fs-md);margin-bottom:var(--sp-1)}
.nc-tb{padding:4px 10px;font-size:var(--fs-sm);border:1px solid var(--c-btn-ghost-border);background:var(--c-btn-ghost-bg);color:var(--c-btn-ghost-text);border-radius:var(--r-sm);cursor:pointer;font-weight:600;line-height:1.5;white-space:nowrap;transition:background var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease),transform var(--dur-fast) var(--ease),border-color var(--dur-fast) var(--ease)}
.nc-tb:hover{background:var(--c-accent-soft);border-color:var(--c-accent)}
.nc-tb:active{transform:scale(.95)}
.nc-tb:disabled{background:var(--c-btn-disabled-bg);color:var(--c-btn-disabled-text);border-color:var(--c-border);cursor:not-allowed;transform:none}
@keyframes nc-in{from{opacity:0;transform:translateX(50px)}to{opacity:1;transform:translateX(0)}}
@media (pointer:coarse){.nc-tb{min-height:28px;padding:5px 12px}.nc-min{width:32px;height:32px}.nc-tv{width:32px;height:32px}.nc-pd{width:28px;height:28px;font-size:12px}.nc-b{min-height:38px}.nc-b-sm{min-height:32px}}
@media (max-width:760px){.nc-modal{width:min(560px,94vw)}}
/* 窄屏无横向空间放标签栏：降级为手风琴，同一份 DOM 由 CSS 切换呈现，JS 只维护 open 态 */
@media (max-width:600px){
 .nc-set{overflow-y:auto}
 .nc-set-body{display:block;overflow:visible}
 .nc-nav{display:none}
 .nc-panes{overflow:visible}
 .nc-pane{display:flex}
 .nc-pane.active{animation:none}
 .nc-pane-hd{display:flex;align-items:center;gap:8px;width:100%;margin-top:var(--sp-4);padding:10px 12px;border:1px solid var(--c-border);border-radius:var(--r-md);background:var(--c-surface-sunken);color:var(--c-text);font-family:inherit;font-size:var(--fs-md);font-weight:650;line-height:var(--lh-tight);text-align:left;cursor:pointer;transition:background var(--dur-fast) var(--ease),border-color var(--dur-fast) var(--ease)}
 .nc-pane-hd:hover{background:var(--c-bg-sec);border-color:var(--c-border-hover)}
 .nc-panes > .nc-pane:first-child > .nc-pane-hd{margin-top:0}
 .nc-caret{margin-left:auto;flex:none;font-size:11px;color:var(--c-help);transition:transform var(--dur-base) var(--ease)}
 .nc-pane.open > .nc-pane-hd .nc-caret{transform:rotate(180deg)}
 .nc-pane:not(.open) > *:not(.nc-pane-hd){display:none}
 .nc-pane > .nc-sec{margin-top:var(--sp-3)}
}
@media (max-width:520px){.nc-ov.nc-ov-tr{align-items:flex-end;justify-content:center;padding:10px}.nc-ov.nc-ov-tr .nc-modal{width:100%;max-width:none;max-height:74vh}.nc-modal{padding:var(--sp-5);gap:var(--sp-3)}.nc-modal:not(.minimized) h2::before{top:-18px;height:18px}.nc-sec{padding:var(--sp-3);margin-top:var(--sp-3)}.nc-pv.expanded{max-height:50vh}.nc-tc{left:10px;right:10px;top:10px;max-width:none}.nc-t{max-width:none}.nc-btn{right:14px;bottom:14px}}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important}.nc-progress-bar::after{display:none}.nc-btn:hover{transform:none}.nc-btn-ico{transform:none}}
@media (prefers-contrast:more){:host(:not([data-theme=dark])){--c-border:#767676;--c-border-hover:#333;--c-help:#595959;--c-text-sec:#3d3d3d}:host([data-theme=dark]){--c-border:#8f8f8f;--c-border-hover:#b5b5b5;--c-help:#c9c9c9;--c-text-sec:#d8d8d8}.nc-bk{border-width:2px}.nc-sec{border-width:1.5px}.nc-modal{box-shadow:var(--sh-modal),0 0 0 1px rgba(0,0,0,.5)}}
:host([data-theme=light]){color-scheme:light}
:host([data-theme=dark]){color-scheme:dark}
/* 手动指定主题时接管系统偏好：light 屏蔽系统深色分支，dark 在无媒体查询命中的系统浅色下独立生效 */
@media (prefers-color-scheme: dark) {
 :host(:not([data-theme=light])){${DARK_VARS}}
 :host(:not([data-theme=light])) .nc-b1{color:#0d2137}
}
:host([data-theme=dark]){${DARK_VARS}}
:host([data-theme=dark]) .nc-b1{color:#0d2137}
`;

 const PANEL_HTML = `

<button class="nc-btn" type="button" title="左键选取 · 右键设置 · Alt+Shift+N" aria-label="网页剪藏：左键选取，右键打开设置，快捷键 Alt+Shift+N">
<svg class="nc-btn-ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
<span class="nc-btn-badge" id="btn-badge" aria-hidden="true" hidden></span>
</button>
<div class="nc-tip" role="status" aria-live="polite">🔍 悬停高亮元素，单击提取内容 (Esc取消)</div>
<div class="nc-mask"></div><div class="nc-hl"></div>
<div class="nc-ov" id="ov-set" role="dialog" aria-modal="true" aria-labelledby="ttl-set"><div class="nc-modal nc-set">
 <h2 id="ttl-set">⚙️ Notion / 飞书 / Obsidian 配置</h2>
 <div class="nc-set-body">
  <nav class="nc-nav" id="set-nav" role="tablist" aria-label="设置分区" aria-orientation="vertical">
   <button class="nc-nav-i" type="button" role="tab" id="nav-general" data-tab="general" aria-controls="tab-general" aria-selected="true"><span class="nc-nav-ico">🧭</span><span class="nc-nav-t">通用</span></button>
   <button class="nc-nav-i" type="button" role="tab" id="nav-notion" data-tab="notion" aria-controls="tab-notion" aria-selected="false" tabindex="-1"><span class="nc-nav-ico">📕</span><span class="nc-nav-t">Notion</span><i class="nc-dot"></i></button>
   <button class="nc-nav-i" type="button" role="tab" id="nav-feishu" data-tab="feishu" aria-controls="tab-feishu" aria-selected="false" tabindex="-1"><span class="nc-nav-ico">🪁</span><span class="nc-nav-t">飞书</span><i class="nc-dot"></i></button>
   <button class="nc-nav-i" type="button" role="tab" id="nav-obsidian" data-tab="obsidian" aria-controls="tab-obsidian" aria-selected="false" tabindex="-1"><span class="nc-nav-ico">💎</span><span class="nc-nav-t">Obsidian</span><i class="nc-dot"></i></button>
   <button class="nc-nav-i" type="button" role="tab" id="nav-tags" data-tab="tags" aria-controls="tab-tags" aria-selected="false" tabindex="-1"><span class="nc-nav-ico">🏷️</span><span class="nc-nav-t">标签</span></button>
   <button class="nc-nav-i" type="button" role="tab" id="nav-backup" data-tab="backup" aria-controls="tab-backup" aria-selected="false" tabindex="-1"><span class="nc-nav-ico">💾</span><span class="nc-nav-t">备份</span></button>
   <button class="nc-nav-i" type="button" role="tab" id="nav-hist" data-tab="hist" aria-controls="tab-hist" aria-selected="false" tabindex="-1"><span class="nc-nav-ico">🕘</span><span class="nc-nav-t">历史</span></button>
   <button class="nc-nav-i" type="button" role="tab" id="nav-keys" data-tab="keys" aria-controls="tab-keys" aria-selected="false" tabindex="-1"><span class="nc-nav-ico">⌨️</span><span class="nc-nav-t">快捷键</span></button>
  </nav>
  <div class="nc-panes" id="set-panes">
   <div class="nc-pane" id="tab-general" role="tabpanel" aria-labelledby="nav-general">
    <button class="nc-pane-hd" type="button" data-pane-hd="general" aria-expanded="true" aria-controls="tab-general"><span class="nc-nav-ico">🧭</span><span>通用</span><span class="nc-caret">▼</span></button>
    <section class="nc-sec" id="sec-general">
     <h3><span class="nc-plat-hd">🧭 通用</span></h3>
     <label for="in-theme">🎨 界面主题</label><select id="in-theme"><option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select>
     <div class="nc-help">默认跟随系统深色模式；手动指定浅色 / 深色后将忽略系统设置。保存后立即生效，无需刷新。</div>
     <label for="in-blocklist">🚫 禁用站点（逗号分隔，命中则本脚本不启用）</label><input type="text" id="in-blocklist" placeholder="example.com, *.example.org" autocomplete="off">
     <div class="nc-help">支持 example.com（含子域）与 *.example.com（仅子域）。保存后刷新页面生效。</div>
     <label for="in-send-profile">🚦 发送节奏</label><select id="in-send-profile"><option value="gentle">温和 · 降低并发（推荐，规避平台接口限流）</option><option value="standard">标准 · 更快</option></select>
     <div class="nc-help">温和档：三平台错峰启动 700ms · 图片下载并发 2 · API 写入间隔 550ms；标准档：300ms / 3 / 350ms。</div>
    </section>
   </div>
   <div class="nc-pane" id="tab-notion" role="tabpanel" aria-labelledby="nav-notion">
    <button class="nc-pane-hd" type="button" data-pane-hd="notion" aria-expanded="false" aria-controls="tab-notion"><span class="nc-nav-ico">📕</span><span>Notion</span><i class="nc-dot"></i><span class="nc-caret">▼</span></button>
    <section class="nc-sec" id="sec-notion" data-plat="notion">
     <h3><span class="nc-plat-hd"><i class="nc-dot"></i>📕 Notion</span><span class="nc-h3r"><label class="nc-switch"><input type="checkbox" id="ck-notion"> 启用</label><button class="nc-tb" id="btn-test-notion" title="验证 Token 与数据库连通性（读取当前表单值，无需先保存）">🔌 测试</button></span></h3>
     <label for="in-tok">Integration Token</label><div class="nc-tw"><input type="password" id="in-tok" placeholder="secret_... 或 ntn_..." autocomplete="new-password"><button class="nc-tv nc-tv-notion" type="button" aria-label="显示或隐藏 Notion Token" title="显示/隐藏">👁️</button></div>
     <label for="in-db">Database ID</label><input type="text" id="in-db" placeholder="32 位 ID 或数据库链接" autocomplete="off">
     <div class="nc-help">⚠️ 必须在 Notion 数据库 Connections 中添加 Integration。</div>
     <div class="nc-warn-hint">⚠️ 已启用但 Token 或 Database ID 未填全，发送时该平台会被跳过。</div>
     <label for="in-tag">标签属性名 (可选)</label><input type="text" id="in-tag" placeholder="Tags" autocomplete="off">
    </section>
   </div>
   <div class="nc-pane" id="tab-feishu" role="tabpanel" aria-labelledby="nav-feishu">
    <button class="nc-pane-hd" type="button" data-pane-hd="feishu" aria-expanded="false" aria-controls="tab-feishu"><span class="nc-nav-ico">🪁</span><span>飞书</span><i class="nc-dot"></i><span class="nc-caret">▼</span></button>
    <section class="nc-sec" id="sec-feishu" data-plat="feishu">
     <h3><span class="nc-plat-hd"><i class="nc-dot"></i>🪁 飞书</span><span class="nc-h3r"><label class="nc-switch"><input type="checkbox" id="ck-feishu"> 启用</label><button class="nc-tb" id="btn-test-feishu" title="验证凭证 + 创建/回收测试文档（读取当前表单值）">🔌 测试</button></span></h3>
     <label for="in-fs-appid">App ID</label><input type="text" id="in-fs-appid" placeholder="App ID" autocomplete="off">
     <label for="in-fs-secret">App Secret</label><div class="nc-tw"><input type="password" id="in-fs-secret" placeholder="App Secret" autocomplete="new-password"><button class="nc-tv nc-tv-fs" type="button" aria-label="显示或隐藏飞书 App Secret" title="显示/隐藏">👁️</button></div>
     <label for="in-fs-folder">文件夹 Token</label><input type="text" id="in-fs-folder" placeholder="Folder Token" autocomplete="off">
     <div class="nc-help">⚠️ Token 明文存储于本地，请勿在公共电脑保存。</div>
     <div class="nc-warn-hint">⚠️ 已启用但 App ID 或 App Secret 未填全，发送时该平台会被跳过。</div>
    </section>
   </div>
   <div class="nc-pane" id="tab-obsidian" role="tabpanel" aria-labelledby="nav-obsidian">
    <button class="nc-pane-hd" type="button" data-pane-hd="obsidian" aria-expanded="false" aria-controls="tab-obsidian"><span class="nc-nav-ico">💎</span><span>Obsidian</span><i class="nc-dot"></i><span class="nc-caret">▼</span></button>
    <section class="nc-sec" id="sec-obsidian" data-plat="obsidian">
     <h3><span class="nc-plat-hd"><i class="nc-dot"></i>💎 Obsidian</span><span class="nc-h3r"><label class="nc-switch"><input type="checkbox" id="ck-obsidian"> 启用</label><button class="nc-tb" id="btn-test-obsidian" title="探测 Local REST API 连通性与 API Key（读取当前表单值）">🔌 测试</button></span></h3>
     <label for="in-obs-api-url">API Base URL</label><input type="text" id="in-obs-api-url" placeholder="http://127.0.0.1:27123" autocomplete="off">
     <label for="in-obs-api-key">API Key</label><div class="nc-tw"><input type="password" id="in-obs-api-key" placeholder="Local REST API 插件中获取" autocomplete="new-password"><button class="nc-tv nc-tv-obs" type="button" aria-label="显示或隐藏 Obsidian API Key" title="显示/隐藏">👁️</button></div>
     <label for="in-obs-folder">保存路径</label><input type="text" id="in-obs-folder" placeholder="例如: Clippings" autocomplete="off">
     <div class="nc-help">💡 需安装 <b>Local REST API</b> 插件并启用 HTTP 端口(27123)。<br>💡 写入采用串行队列 + 自动重试；失败后可在弹窗中一键复制 Markdown 或重试。</div>
     <div class="nc-warn-hint">⚠️ 已启用但 API Key 未填写，发送时该平台会连接失败。</div>
    </section>
    <div class="nc-row"><button class="nc-tb" id="btn-testall" title="按顺序逐个测试已配置平台（读取当前表单值，无需先保存）；未配置的平台自动跳过并汇总">🔌 测试全部平台连通性</button></div>
   </div>
   <div class="nc-pane" id="tab-tags" role="tabpanel" aria-labelledby="nav-tags">
    <button class="nc-pane-hd" type="button" data-pane-hd="tags" aria-expanded="false" aria-controls="tab-tags"><span class="nc-nav-ico">🏷️</span><span>域名默认标签</span><span class="nc-caret">▼</span></button>
    <section class="nc-sec" id="sec-tags">
     <h3><span class="nc-plat-hd">🏷️ 域名默认标签</span></h3>
     <textarea id="in-domain-tags" rows="3" aria-label="域名默认标签（每行一条：域名=标签1,标签2）" placeholder="每行一条：域名=标签1,标签2&#10;zhihu.com=阅读,知乎&#10;github.com=代码"></textarea>
     <div class="nc-help">发送前按当前站点域名（含子域）自动预填标签；手动输入优先于自动预填。</div>
    </section>
   </div>
   <div class="nc-pane" id="tab-backup" role="tabpanel" aria-labelledby="nav-backup">
    <button class="nc-pane-hd" type="button" data-pane-hd="backup" aria-expanded="false" aria-controls="tab-backup"><span class="nc-nav-ico">💾</span><span>配置备份</span><span class="nc-caret">▼</span></button>
    <section class="nc-sec" id="sec-backup">
     <h3><span class="nc-plat-hd">💾 配置备份</span><span class="nc-h3r"><button class="nc-tb" id="btn-exp" title="将全部配置导出为 JSON 文件下载">导出</button><button class="nc-tb" id="btn-imp" title="从 JSON 文件导入配置到当前表单">导入</button></span></h3>
     <div class="nc-help">脚本配置按站点独立存储，多站点使用时可用此功能同步。导出文件含 Token 明文请妥善保管；导入仅回填表单，核对后需点击「保存设置」生效。</div>
     <input type="file" id="in-imp-file" accept=".json,application/json" style="display:none">
    </section>
   </div>
   <div class="nc-pane" id="tab-hist" role="tabpanel" aria-labelledby="nav-hist">
    <button class="nc-pane-hd" type="button" data-pane-hd="hist" aria-expanded="false" aria-controls="tab-hist"><span class="nc-nav-ico">🕘</span><span>最近发送</span><span class="nc-caret">▼</span></button>
    <section class="nc-sec" id="sec-hist">
     <h3><span class="nc-plat-hd">🕘 最近发送</span><span class="nc-h3r"><button class="nc-tb" id="btn-hist-clear" title="清空全部本地发送历史">清空</button></span></h3>
     <div class="nc-hist" id="hist-list"></div>
    </section>
   </div>
   <div class="nc-pane" id="tab-keys" role="tabpanel" aria-labelledby="nav-keys">
    <button class="nc-pane-hd" type="button" data-pane-hd="keys" aria-expanded="false" aria-controls="tab-keys"><span class="nc-nav-ico">⌨️</span><span>快捷键</span><span class="nc-caret">▼</span></button>
    <section class="nc-sec" id="sec-keys">
     <h3><span class="nc-plat-hd">⌨️ 快捷键</span></h3>
     <div class="nc-shortcuts">
      <strong>选取阶段</strong>
      🖱️ <kbd>左键</kbd> 单击提取 · <kbd>右键</kbd> 单击悬浮球打开设置<br>
      <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> 开始选取 · <kbd>↑</kbd>/<kbd>↓</kbd> 调整选取范围 · <kbd>Esc</kbd> 取消
      <strong>确认面板</strong>
      <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 发送 · <kbd>Ctrl</kbd>+<kbd>A</kbd> 全选预览内容
     </div>
    </section>
   </div>
  </div>
 </div>
 <div class="nc-dirty" id="dirty-flag">⚠️ 有未保存的更改</div>
 <div class="nc-row"><button class="nc-b nc-b2" id="btn-sc">关闭</button><button class="nc-b nc-b1" id="btn-ss">保存设置</button></div>
</div></div>
<div class="nc-ov nc-ov-tr" id="ov-cfm" role="dialog" aria-modal="true" aria-labelledby="ttl-cfm"><div class="nc-modal" id="modal-cfm">
 <h2 class="nc-modal-h2"><span id="ttl-cfm">✂️ 确认发送</span><button class="nc-min" id="btn-min" type="button" aria-label="最小化确认发送面板" title="最小化">🔽</button></h2>
 <div class="nc-plats" id="plat-badges" role="group" aria-label="发送目标平台，点击前往设置调整"></div>
 <label for="in-title">页面标题</label><input type="text" id="in-title" autocomplete="off">
 <div class="nc-pv-head"><label id="lb-pv">内容预览</label><span class="nc-info" id="pv-count"></span><button class="nc-tb" id="pv-expand" type="button" aria-expanded="false" aria-controls="pv" title="展开 / 收起预览区域">展开</button></div>
 <div class="nc-pv" id="pv" tabindex="0" role="region" aria-labelledby="lb-pv"></div>
 <div class="nc-progress" id="pg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="nc-progress-bar" id="pg-bar"></div></div><div class="nc-info" id="pg-text" role="status" style="display:none"></div>
 <label for="in-tags">标签 (逗号分隔)</label><input type="text" id="in-tags" placeholder="阅读, 技术" autocomplete="off">
 <div class="nc-row">
  <button class="nc-b nc-bk nc-b-sm" id="btn-back" title="放弃当前内容，返回页面重新选取">↩ 重选</button>
  <button class="nc-b nc-bk nc-b-sm" id="btn-add" title="返回页面继续选取，追加到当前内容末尾">➕ 追加</button>
  <span class="nc-sep"></span>
  <button class="nc-b nc-bk nc-b-sm" id="btn-copy" title="复制为纯文本">📋 复制</button>
  <button class="nc-b nc-bk nc-b-sm" id="btn-cmd" title="复制整篇剪藏为 Markdown（含 frontmatter）">📄 MD</button>
  <span class="nc-grow"></span>
  <button class="nc-b nc-b2" id="btn-cc">取消</button>
  <button class="nc-b nc-b1" id="btn-cs">发送</button>
 </div>
</div></div>
<div class="nc-ov nc-ov-tr" id="ov-ok" role="dialog" aria-modal="true" aria-labelledby="ttl-ok"><div class="nc-modal" style="text-align:center;gap:var(--sp-4)">
 <h2 id="ttl-ok">✅ 发送完成！</h2><p class="nc-ok" id="ok-msg" role="status"></p>
 <div class="nc-info" id="ok-tip" style="text-align:center;display:none"></div>
 <div class="nc-row" style="justify-content:center"><button class="nc-b nc-b1" id="btn-oo-notion" style="display:none">打开 Notion</button><button class="nc-b nc-bk nc-bk-brand-fs" id="btn-oo-feishu" style="display:none">打开飞书</button><button class="nc-b nc-bk nc-bk-brand-obs" id="btn-oo-obsidian" style="display:none">打开 Obsidian</button><button class="nc-b nc-b2" id="btn-oc">关闭</button></div>
</div></div>
<div class="nc-ov nc-ov-tr" id="ov-err" role="dialog" aria-modal="true" aria-labelledby="err-title"><div class="nc-modal" style="text-align:center;gap:var(--sp-3)">
 <h2 id="err-title" class="nc-err-title">❌ 发送失败</h2><div class="nc-err-succ" id="err-succ" style="display:none"></div><div class="nc-err" id="err-detail"></div>
 <div class="nc-row" style="justify-content:center"><button class="nc-b nc-br" id="btn-retry">🔄 重试</button><button class="nc-b nc-b2" id="btn-err-md" style="display:none">📋 复制 Markdown</button><button class="nc-b nc-b2" id="btn-err-copy">📋 复制错误</button><button class="nc-b nc-b2" id="btn-err-close">关闭</button></div>
</div></div>
<div class="nc-ov" id="ov-ask" role="dialog" aria-modal="true" aria-labelledby="ask-title" aria-describedby="ask-msg"><div class="nc-modal" id="modal-ask" style="width:420px">
 <h2 id="ask-title">请确认</h2>
 <div class="nc-ask-msg" id="ask-msg"></div>
 <div class="nc-row"><button class="nc-b nc-b2" id="ask-no">取消</button><button class="nc-b nc-b1" id="ask-yes">确定</button></div>
</div></div>
<div class="nc-tc" id="tc" role="status" aria-live="polite" aria-atomic="false"></div>`;

 // ===== 主初始化 =====
 function ncInit() {
  if (isSensitiveHost(location.hostname)) return;
  if (isUserBlocked(location.hostname, S.blocklist)) return;

  const old = document.getElementById('nc-host'); if (old) old.remove();
  const host = document.createElement('div'); host.id = 'nc-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const ac = new AbortController(); const signal = ac.signal;
  _cleanupFns.push(() => ac.abort());

  const isZhihu = location.hostname.includes('zhihu.com');
  const isTwitter = location.hostname.includes('x.com') || location.hostname.includes('twitter.com');
  const isTwitterStatus = () => isTwitter && location.pathname.includes('/status/');
  const $ = (s, b = shadow) => b.querySelector(s);

  const pageTitle = () => {
   const og = document.querySelector('meta[property="og:title"]')?.content?.trim();
   return og || document.title || '';
  };

  // ---------- 样式 ----------
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  shadow.appendChild(style);

  // ---------- UI 模板 ----------
  const ui = document.createElement('div');
  ui.innerHTML = PANEL_HTML;
  shadow.appendChild(ui);

  // ---------- 元素引用 ----------
  const el = {
   btn: $('.nc-btn'), tip: $('.nc-tip'), mask: $('.nc-mask'), hl: $('.nc-hl'),
   ovSet: $('#ov-set'), ovCfm: $('#ov-cfm'), ovOk: $('#ov-ok'), ovErr: $('#ov-err'),
   pv: $('#pv'), pvCount: $('#pv-count'), errTitle: $('#err-title'), errDetail: $('#err-detail'),
   errSucc: $('#err-succ'), modalCfm: $('#modal-cfm'), btnMin: $('#btn-min'), ckNotion: $('#ck-notion'),
   ckFeishu: $('#ck-feishu'), tok: $('#in-tok'), db: $('#in-db'), tag: $('#in-tag'), tags: $('#in-tags'),
   fsAppId: $('#in-fs-appid'), fsSecret: $('#in-fs-secret'), fsFolder: $('#in-fs-folder'), title: $('#in-title'),
   okMsg: $('#ok-msg'), send: $('#btn-cs'), btnCopy: $('#btn-copy'), btnCopyMd: $('#btn-cmd'), back: $('#btn-back'), btnAdd: $('#btn-add'),
   okOpenNotion: $('#btn-oo-notion'), okOpenFeishu: $('#btn-oo-feishu'), okOpenObsidian: $('#btn-oo-obsidian'), okClose: $('#btn-oc'),
   tokTglNotion: $('.nc-tv-notion'), tokTglFeishu: $('.nc-tv-fs'), tokTglObsidian: $('.nc-tv-obs'), toast: $('#tc'), retry: $('#btn-retry'),
   errCopy: $('#btn-err-copy'), errClose: $('#btn-err-close'), pg: $('#pg'), pgBar: $('#pg-bar'),
   pgText: $('#pg-text'), dirtyFlag: $('#dirty-flag'),
   ckObsidian: $('#ck-obsidian'), obsApiUrl: $('#in-obs-api-url'),
   obsApiKey: $('#in-obs-api-key'), obsFolder: $('#in-obs-folder'),
   testNotion: $('#btn-test-notion'), testFeishu: $('#btn-test-feishu'), testObsidian: $('#btn-test-obsidian'),
   errMd: $('#btn-err-md'),
   blocklist: $('#in-blocklist'), domainTags: $('#in-domain-tags'), sendProfile: $('#in-send-profile'),
   expBtn: $('#btn-exp'), impBtn: $('#btn-imp'), impFile: $('#in-imp-file'),
   testAll: $('#btn-testall'),
   histList: $('#hist-list'), histClear: $('#btn-hist-clear'),
   platBadges: $('#plat-badges'), pvExpand: $('#pv-expand'), okTip: $('#ok-tip'),
   secNotion: $('#sec-notion'), secFeishu: $('#sec-feishu'), secObsidian: $('#sec-obsidian'),
   btnBadge: $('#btn-badge'), theme: $('#in-theme'),
   setNav: $('#set-nav'), setPanes: $('#set-panes'),
   ovAsk: $('#ov-ask'), askTitle: $('#ask-title'), askMsg: $('#ask-msg'), askYes: $('#ask-yes'), askNo: $('#ask-no'),
  };

  // ---------- 发送目标徽章 ----------
  // 仅做只读呈现 + 跳转到设置，不参与 sendToAll 的平台判定（判定仍以 refreshSettings 后的 S 为准），
  // 避免两处真相源；关闭设置时重绘即可同步用户在设置里的改动。
  // 两个正交维度：enabled=开关是否打开，configured=凭据是否齐全；ready=两者皆真。
  // 三平台口径统一为「能否发送成功」。注意这与 sendToAll 有意不同——后者对 Obsidian 只判开关
  // （勾了就会尝试发送，缺 Key 则在发送时报连接失败）。指示灯回答的是「能不能发成功」，
  // 而非「会不会尝试」，否则「勾了但没填 Key」这种最该提醒的场景将永远显示绿灯。
  const PLAT_BADGES = [
   { key: 'notion', label: 'Notion',
    enabled: () => isNotionEnabled(), configured: () => isNotionConfigured(),
    sec: () => el.secNotion, box: () => el.ckNotion, cfgLive: () => !!(el.tok.value.trim() && el.db.value.trim()) },
   { key: 'feishu', label: '飞书',
    enabled: () => isFeishuEnabled(), configured: () => isFeishuConfigured(),
    sec: () => el.secFeishu, box: () => el.ckFeishu, cfgLive: () => !!(el.fsAppId.value.trim() && el.fsSecret.value.trim()) },
   { key: 'obsidian', label: 'Obsidian',
    enabled: () => isObsidianEnabled(), configured: () => isObsidianConfigured(),
    sec: () => el.secObsidian, box: () => el.ckObsidian, cfgLive: () => !!el.obsApiKey.value.trim() },
  ];
  for (const p of PLAT_BADGES) p.ready = () => p.enabled() && p.configured();
  function renderPlatBadges() {
   if (!el.platBadges) return;
   el.platBadges.textContent = '';
   for (const p of PLAT_BADGES) {
    const st = platStatus(p);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nc-plat ' + st;
    b.dataset.plat = p.key;
    b.textContent = (st === 'on' ? '发往 ' : st === 'warn' ? '待补凭据 ' : '未启用 ') + p.label;
    b.title = st === 'on' ? `${p.label}：已启用且配置完整，点击前往设置调整`
     : st === 'warn' ? `${p.label}：已启用但凭据不全，发送会失败，点击前往设置补全`
     : `${p.label}：未启用，点击前往设置开启`;
    el.platBadges.appendChild(b);
   }
  }
  // 三态指示灯：on=开关已开且凭据齐全；warn=开关已开但凭据不全；off=未启用。
  // 设置面板打开时读表单实时值（勾掉开关立刻灯灭，清空凭据立刻转 warn，无需先保存），
  // 关闭后读已落盘的 enabled / configured——两条分支口径一致，不会同一状态两副面孔。
  const platStatus = (p) => {
   if (ovVisible(el.ovSet)) {
    if (!p.box().checked) return 'off';
    return p.cfgLive() ? 'on' : 'warn';
   }
   if (!p.enabled()) return 'off';
   return p.configured() ? 'on' : 'warn';
  };
  function syncSectionState() {
   for (const p of PLAT_BADGES) {
    const st = platStatus(p);
    const sec = p.sec();
    if (sec) { sec.classList.toggle('on', st === 'on'); sec.classList.toggle('warn', st === 'warn'); }
    // 标签栏与手风琴标题的状态点共用同一套 on / warn；窄屏收起时靠它们一眼定位到待补配置的平台
    const navDot = el.setNav.querySelector(`.nc-nav-i[data-tab="${p.key}"] .nc-dot`);
    const hdDot = el.setPanes.querySelector(`#tab-${p.key} > .nc-pane-hd .nc-dot`);
    for (const d of [navDot, hdDot]) {
     if (!d) continue;
     d.classList.toggle('on', st === 'on'); d.classList.toggle('warn', st === 'warn');
    }
   }
   syncBtnBadge();
  }
  // 悬浮球角标：已就绪平台数；0 个时转警示态，点开前就能发现没配好。
  function syncBtnBadge() {
   if (!el.btnBadge) return;
   const n = PLAT_BADGES.filter((p) => p.ready()).length;
   const warn = n === 0;
   el.btnBadge.hidden = false;
   el.btnBadge.textContent = warn ? '!' : String(n);
   // 有平台已启用但凭据不全时同样转警示色——数字照常显示，但颜色提醒「有平台待补」，
   // 比一律显示绿灯、等发送失败才发现要诚实。
   const broken = PLAT_BADGES.filter((p) => !p.ready() && p.enabled()).map((p) => p.label);
   el.btnBadge.classList.toggle('is-warn', warn || broken.length > 0);
   const labels = PLAT_BADGES.filter((p) => p.ready()).map((p) => p.label).join('、');
   el.btnBadge.title = warn
    ? (broken.length ? `已启用但凭据不全：${broken.join('、')}，右键打开设置` : '未启用任何目标平台，右键打开设置')
    : `已就绪：${labels}` + (broken.length ? `　·　待补凭据：${broken.join('、')}` : '');
  }
  if (el.platBadges) el.platBadges.addEventListener('click', (e) => {
   if (sending) return;
   const b = e.target.closest ? e.target.closest('.nc-plat') : null;
   openSettings(b && b.dataset.plat);
  }, { signal });

  // ---------- 设置面板分区导航 ----------
  // 桌面端左侧标签栏 + 右侧内容区；≤600px 由 CSS 降级为手风琴。同一份 DOM，
  // JS 只维护 active（标签选中）与 open（手风琴展开）两个状态，不感知当前断点。
  const SET_TABS = ['general', 'notion', 'feishu', 'obsidian', 'tags', 'backup', 'hist', 'keys'];
  let activeTab = SET_TABS[0];
  function switchTab(key) {
   if (!SET_TABS.includes(key)) key = SET_TABS[0];
   activeTab = key;
   for (const pane of el.setPanes.querySelectorAll('.nc-pane')) {
    const on = pane.id === 'tab-' + key;
    pane.classList.toggle('active', on);
    pane.classList.toggle('open', on);
    const hd = pane.querySelector('.nc-pane-hd');
    if (hd) hd.setAttribute('aria-expanded', on ? 'true' : 'false');
   }
   for (const nav of el.setNav.querySelectorAll('.nc-nav-i')) {
    const on = nav.dataset.tab === key;
    nav.setAttribute('aria-selected', on ? 'true' : 'false');
    nav.tabIndex = on ? 0 : -1;
   }
   try { GM_setValue(STORAGE.SET_TAB, key); } catch (e) {   }
  }
  el.setNav.addEventListener('click', (e) => {
   const nav = e.target.closest ? e.target.closest('.nc-nav-i') : null;
   if (nav) switchTab(nav.dataset.tab);
  }, { signal });
  // 手风琴：点击已展开的标题收起自身，点击其他标题切到该分区
  el.setPanes.addEventListener('click', (e) => {
   const hd = e.target.closest ? e.target.closest('.nc-pane-hd') : null;
   if (!hd) return;
   const key = hd.dataset.paneHd;
   const pane = el.setPanes.querySelector('#tab-' + key);
   if (key === activeTab && pane && pane.classList.contains('open')) {
    pane.classList.remove('open'); hd.setAttribute('aria-expanded', 'false'); return;
   }
   switchTab(key);
  }, { signal });
  el.setNav.addEventListener('keydown', (e) => {
   if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
   e.preventDefault();
   const i = SET_TABS.indexOf(activeTab), n = SET_TABS.length;
   const next = SET_TABS[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n];
   switchTab(next);
   const nav = el.setNav.querySelector(`.nc-nav-i[data-tab="${next}"]`);
   if (nav) { try { nav.focus(); } catch (err) {   } }
  }, { signal });

  // ---------- 主题 ----------
  // 手动指定时给宿主挂 data-theme，CSS 侧据此屏蔽系统深色分支（light）或独立生效（dark）
  const applyTheme = (v) => {
   const t = (v === 'light' || v === 'dark') ? v : '';
   if (t) host.setAttribute('data-theme', t); else host.removeAttribute('data-theme');
  };

  // ---------- 运行时状态（按职责分组） ----------
  let selecting = false, blocks = [], hlTarget = null;
  let selCands = [], selIdx = 0, selAnchor = null;
  let appendMode = false;
  let hoverTimer = null, rafId = null;
  let dragging = false, dragSX = 0, dragSY = 0, dragIL = 0, dragIT = 0, dragDist = 0;
  let hidden = false, hiddenEdge = '', hiddenForImg = false, imgCheckTs = 0;
  let cachedIcon = null;
  let confirmOpen = false;
  let sending = false;
  let accSuccess = [];
  let cachedSend = null, lastNotionPageId = null, lastFeishuDocId = null, okAutoCloseTimer = null;
  let notionDbCache = { dbId: '', props: null };
  let fsTokenCache = { token: '', expiry: 0 }, fsLastWrite = 0, imgDL = new Map(), imgDLBytes = 0;
  const imgFailTs = new Map();
  let settingsDirty = false, settingsListenersAttached = false;
  let modeAc = null;
  // 清理钩子：重注入时旧实例的 __ncCleanup 会 abort 旧 modeAc，连带移除旧 signal 上的监听器；
  // body 十字线光标位于 shadow 之外，host 移除不会覆盖它，须随清理一并复位
  _cleanupFns.push(() => {
   try { modeAc && modeAc.abort(); } catch (e) {   }
   if (selecting) { try { document.body.style.cursor = ''; } catch (e) {   } }
  });

  const isOwn = (node) => { let n = node; while (n) { if (n === host) return true; n = n.parentNode || n.host; } return false; };

  // 段落块是否含非空文本——parseBlocks 过滤与知乎评论 body 判定共用同一谓词
  const paraHasText = (b) => (b?.paragraph?.rich_text || []).some(t => (t.text?.content || '').trim());

  // ---------- Toast / 剪贴板 ----------
  function toast(msg, type = 'success', ms) {
   while (el.toast.children.length >= C.TOAST_MAX) { const old = el.toast.firstChild; clearTimeout(old._ncTimer); old.remove(); }
   const t = document.createElement('div');
   t.className = `nc-t ${type === 'error' ? 'nc-te' : type === 'info' ? 'nc-ti' : 'nc-ts'}`;
   t.textContent = msg;
   el.toast.appendChild(t);
   t._ncTimer = setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms || (type === 'error' ? 6000 : C.TOAST_MS));
  }
  function copyText(text, successMsg = '已复制') {
   if (!text) { toast('没有可复制的内容', 'error'); return; }
   try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text); toast(successMsg); return; } } catch {   }
   if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(successMsg), () => toast('复制失败', 'error'));
   else toast('当前环境不支持剪贴板操作', 'error');
  }
  function openTab(url) {
   let win = null;
   try { win = window.open(url, '_blank'); } catch {   }
   if (win) { try { win.opener = null; } catch {   } return; }
   copyText(url, '📋 链接已复制（弹窗被阻止）');
  }

  // ---------- 弹窗焦点管理 ----------
  // 打开时聚焦首控件、Tab 在模态内循环、关闭还原焦点；仅覆盖键盘路径，不改变任何业务回调
  let lastFocusedBeforeModal = null;
  const rememberFocus = () => { lastFocusedBeforeModal = shadow.activeElement || document.activeElement; };
  const restoreFocus = () => { const n = lastFocusedBeforeModal; lastFocusedBeforeModal = null; if (n && n.isConnected && typeof n.focus === 'function') { try { n.focus(); } catch {   } } };
  const modalFocusables = (ov) => [...ov.querySelectorAll('button,input,select,textarea,a[href]')].filter(n => !n.disabled && n.getClientRects().length > 0);
  function trapModalTab(e, ov) {
   const list = modalFocusables(ov);
   if (!list.length) return;
   const first = list[0], last = list[list.length - 1];
   const active = shadow.activeElement;
   const inside = active && ov.contains(active);
   if (e.shiftKey) { if (!inside || active === first) { e.preventDefault(); last.focus(); } }
   else if (!inside || active === last) { e.preventDefault(); first.focus(); }
  }
  // 叠加弹窗按「后开先处理」顺序：ovAsk 可叠在任意面板之上，故排在最前
  function onModalTab(e) {
   if (e.key !== 'Tab') return;
   for (const ov of [el.ovAsk, el.ovSet, el.ovCfm, el.ovErr, el.ovOk]) {
    if (ov.style.display === 'flex') { trapModalTab(e, ov); return; }
   }
  }
  document.addEventListener('keydown', onModalTab, { signal, capture: true });

  // ---------- 自绘确认对话框 ----------
  // 原生 confirm() 会被部分站点的 CSP / 页面脚本拦截或改写，样式也无法跟随脚本主题，
  // 统一改为 shadow DOM 内自绘，返回 Promise<boolean>，复用既有焦点记忆与 Tab 循环。
  let askResolve = null;
  function askConfirm(opts) {
   const o = typeof opts === 'string' ? { message: opts } : (opts || {});
   return new Promise((resolve) => {
    // 同一时刻只允许一个未决询问；若有旧的先按取消结算，避免其 Promise 永久悬挂
    if (askResolve) { const prev = askResolve; askResolve = null; prev(false); }
    el.askTitle.textContent = o.title || '请确认';
    el.askMsg.textContent = o.message || '';
    el.askYes.textContent = o.okText || '确定';
    el.askNo.textContent = o.cancelText || '取消';
    el.askYes.className = 'nc-b ' + (o.danger ? 'nc-br' : 'nc-b1');
    askResolve = resolve;
    rememberFocus();
    el.ovAsk.style.display = 'flex';
    try { el.askYes.focus(); } catch (e) {   }
   });
  }
  function closeAsk(v) {
   if (!askResolve) return;
   const r = askResolve; askResolve = null;
   el.ovAsk.style.display = 'none';
   restoreFocus();
   r(v);
  }
  el.askYes.addEventListener('click', () => closeAsk(true), { signal });
  el.askNo.addEventListener('click', () => closeAsk(false), { signal });
  // 仅当点击落在遮罩本身才视为取消，避免面板内点击冒泡误触发
  el.ovAsk.addEventListener('click', (e) => { if (e.target === el.ovAsk) closeAsk(false); }, { signal });
  _cleanupFns.push(() => { if (askResolve) { const r = askResolve; askResolve = null; r(false); } });

  // ---------- 平台启用/配置判定 ----------
  const isNotionConfigured = () => !!(S.notionToken && S.notionDbId);
  const isFeishuConfigured = () => !!(S.fsAppId && S.fsAppSecret);
  const isObsidianConfigured = () => !!String(S.obsApiKey || '').trim();
  const getPlatformEnabled = (v, configured) => (v === null || v === undefined) ? configured : !!v;
  const isNotionEnabled = () => getPlatformEnabled(S.enableNotion, isNotionConfigured());
  const isFeishuEnabled = () => getPlatformEnabled(S.enableFeishu, isFeishuConfigured());
  const isObsidianEnabled = () => getPlatformEnabled(S.enableObsidian, isObsidianConfigured());

  // ---------- 进度条 ----------
  // 进度条冗余写守卫——sendToAll 多平台并发回调逐次写 width/textContent，
  // 值未变时跳过 DOM 写（签名短路，行为等价；show/hideProgress 复位签名保证状态切换必写）。
  let lastPgW = '0%', lastPgT;
  const resetProgress = (display) => { el.pg.style.display = display; el.pg.setAttribute('aria-valuenow', '0'); el.pgBar.style.width = '0'; lastPgW = '0%'; el.pgText.style.display = 'none'; lastPgT = undefined; };
  const showProgress = () => resetProgress('');
  const updateProgress = (pct, text) => {
   const w = Math.min(Math.max(pct | 0, 0), 100) + '%';
   if (w !== lastPgW) { el.pgBar.style.width = w; el.pg.setAttribute('aria-valuenow', String(Math.min(Math.max(pct | 0, 0), 100))); lastPgW = w; }
   if (text && text !== lastPgT) { el.pgText.style.display = ''; el.pgText.textContent = text; lastPgT = text; }
  };
  const hideProgress = () => resetProgress('none');

  // ===== 媒体资源探测 =====
  function realImgSrc(img) {
   if (!img) return null;
   const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
   if (srcset) {
    const candidates = srcset.split(',').map(s => s.trim()).filter(Boolean);
    let bestUrl = null, bestW = 0;
    for (const c of candidates) {
     const parts = c.split(/\s+/);
     const u = resolveImgURL(parts[0]);
     const w = parseInt(parts[1]?.replace('w','') || '0', 10) || 0;
     if (u && w > bestW) { bestW = w; bestUrl = u; }
    }
    if (bestUrl) return bestUrl;
    if (candidates.length) { const u = resolveImgURL(candidates[0].split(/\s+/)[0]); if (u) return u; }
   }
   for (const attr of ['src', 'data-gif', 'data-animated', 'data-original', 'data-actualsrc', 'data-src']) {
    const raw = attr === 'src' ? img.src : img.getAttribute(attr);
    const url = resolveImgURL(raw);
    if (url && !url.includes('placeholder')) return url;
   }
   return null;
  }
  const hasClassInAncestry = (node, re, depth = 3) => {
   let p = node?.parentElement;
   for (let i = 0; i < depth && p; i++, p = p.parentElement) {
    const pc = typeof p.className === 'string' ? p.className : '';
    if (re.test(pc)) return true;
   }
   return false;
  };
  // 廉价判定（className / src 正则、祖先 class）前置，昂贵的 getBoundingClientRect() 延后。
  // 该函数在 removeAvatarImgs / walk 中按图片循环调用，原先每张图片必触发一次尺寸读取——
  // 页面布局脏时即为强制同步回流（布局抖动），批量图片下开销显著。各命中条件为「或」语义，重排不改变结果。
  function isAvatar(img) {
   if (!img) return true;
   const src = img.src || img.getAttribute('data-src') || '';
   if (/\.(gif|webp)($|\?|&)/i.test(src)) return false;
   const cls = typeof img.className === 'string' ? img.className : '';
   if (/avatar|icon|emoji|face/i.test(cls)) return true;
   if (/avatar|emoji|icon/i.test(src)) return true;
   if (/_(is|xs|s)\.(jpg|jpeg|png|webp)/i.test(src)) return true;
   if (hasClassInAncestry(img, /avatar|icon|emoji|face/i)) return true;
   const r = img.getBoundingClientRect();
   if (r.width > 0 && r.height > 0 && (r.width <= 80 || r.height <= 80)) return true;
   return false;
  }
  function isZhihuMember(img) {
   if (!isZhihu) return false;
   const combined = [typeof img.className === 'string' ? img.className : '', img.src || '', img.getAttribute('data-src') || '', img.alt || '', img.title || ''].join(' ');
   if (/member|vip|盐选|pay|lock/i.test(combined)) return true;
   if (hasClassInAncestry(img, /member|vip|pay|lock|盐选/i)) return true;
   return false;
  }
  function videoSrc(v) {
   if (!v) return null;
   const d = normOrSafe(v.src);
   if (d) return d;
   for (const s of v.querySelectorAll('source')) { const u = normOrSafe(s.src); if (u) return u; }
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
  const pageMainImage = () => document.querySelector('meta[property="og:image"]')?.content || document.querySelector('meta[name="twitter:image"]')?.content || '';
  function pageIcon() {
   if (cachedIcon !== null) return cachedIcon;
   let best = '', bestArea = 0;
   for (const link of document.querySelectorAll('link[rel="apple-touch-icon"],link[rel="apple-touch-icon-precomposed"],link[rel="mask-icon"],link[rel="icon"],link[rel="shortcut icon"]')) {
    const href = link.href;
    if (!href || href.startsWith('data:')) continue;
    if (link.type === 'image/svg+xml' || href.endsWith('.svg')) { cachedIcon = href; return href; }
    const sizes = link.getAttribute('sizes');
    if (sizes) {
     for (const part of sizes.trim().split(/\s+/)) {
      const m = part.match(/^(\d+)x(\d+)$/i);
      if (m) { const area = +m[1] * +m[2]; if (area > bestArea) { bestArea = area; best = href; } }
      else if (part.toLowerCase() === 'any') { cachedIcon = href; return href; }
     }
    } else {
     const assumed = /apple-touch-icon/.test(link.rel) ? 32400 : 256;
     if (assumed > bestArea) { bestArea = assumed; best = href; }
    }
   }
   cachedIcon = best || location.origin + '/favicon.ico';
   return cachedIcon;
  }
  function detectLang(pre) {
   let l = (pre.getAttribute('data-language') || pre.getAttribute('data-lang') || '').trim();
   if (!l) {
    const cls = `${typeof pre.className === 'string' ? pre.className : ''} ${pre.querySelector('code')?.className || ''}`;
    const m = cls.match(/(?:language|lang|highlight)-([\w#+.-]+)/i);
    if (m) l = m[1];
   }
   return l;
  }

  // ===== 页面内容解析为块 =====
  function parseBlocks(fragment, depth = 0) {
   if (depth > C.WALK_DEPTH_MAX) return [];
   let result = [], frags = [];
   const preHosts = new Set();
   for (const pre of fragment.querySelectorAll('pre')) {
    let p = pre.parentElement;
    while (p && p !== fragment && p.nodeType === Node.ELEMENT_NODE) { preHosts.add(p); p = p.parentElement; }
   }
   // 相邻同 link + annotations 的片段合并为一个 rich_text item——逐 frag 建项，
   // 高格式段落（大量行内代码/加粗）易触 RT_ITEMS_MAX=100 被 capRT 截断丢内容；合并后渲染结果不变。
   function fragsToRT(list) {
    const rt = [];
    const bufArr = [];
    let lastKey = null, lastNode = null;
    const flushBuf = () => { if (bufArr.length) { rt.push({ type: 'text', text: { content: bufArr.join('') } }); bufArr.length = 0; lastKey = null; lastNode = null; } };
    for (const f of list) {
     if (!f || !f.text) continue;
     if (!f.link && !f.annot) { bufArr.push(f.text); continue; }
     flushBuf();
     const key = (f.link || '') + '|' + (f.annot ? JSON.stringify(f.annot) : '');
     if (lastNode && key === lastKey) { lastNode.text.content += f.text; continue; }
     const node = { type: 'text', text: { content: f.text } };
     const u = safeURL(f.link);
     if (u) node.text.link = { url: u };
     if (f.annot) node.annotations = f.annot;
     rt.push(node);
     lastKey = key; lastNode = node;
    }
    flushBuf();
    return capRT(rt);
   }
   function takeRich() {
    const nonEmpty = frags.filter(f => f.text.trim());
    frags = [];
    return nonEmpty.length ? fragsToRT(nonEmpty) : [];
   }
   const hasText = (rt) => rt.some(t => (t.text?.content || '').trim());
   const appendRTText = (rt, t) => rt.concat([{ type: 'text', text: { content: (hasText(rt) ? '\n' : '') + t } }]);
   const flush = () => { const rt = takeRich(); if (rt.length && hasText(rt)) result.push(mkBlockRT('paragraph', rt)); };
   function listItemBlock(li, ordered, allowKids, hoist, depth = 0) {
    if (depth > C.WALK_DEPTH_MAX) { const t = innerText(li).replace(/\s+/g, ' ').trim(); return t ? mkBlockRT(ordered ? 'numbered_list_item' : 'bulleted_list_item', toRich(t)) : null; }
    const savedRes = result, savedFrags = frags;
    result = []; frags = [];
    const nestedLists = [];
    for (const c of li.childNodes) {
     if (c.nodeType === Node.ELEMENT_NODE && (c.tagName === 'UL' || c.tagName === 'OL')) nestedLists.push(c);
     else walk(c, null, 0);
    }
    flush();
    const own = result;
    result = savedRes; frags = savedFrags;
    const type = ordered ? 'numbered_list_item' : 'bulleted_list_item';
    let rt = [];
    const kids = [];
    const rest = own.slice();
    if (rest.length && rest[0].type === 'paragraph') { rt = rest[0].paragraph.rich_text; rest.shift(); }
    for (const b of rest) {
     if (allowKids) kids.push(b);
     else if (b.type === 'paragraph') { const t = rtStr(b.paragraph.rich_text).trim(); if (t) rt = appendRTText(rt, t); }
     else hoist.push(b);
    }
    for (const nl of nestedLists) {
     if (allowKids) {
      for (const sub of nl.children) {
       if (sub.tagName !== 'LI') continue;
       kids.push(listItemBlock(sub, nl.tagName === 'OL', false, kids, depth + 1));
      }
     } else {
      const t = innerText(nl).trim();
      if (t) rt = appendRTText(rt, t);
     }
    }
    const blk = mkBlockRT(type, rt.length ? capRT(rt) : null);
    const cleanKids = stripDeep(kids).slice(0, C.BATCH_SIZE);
    if (cleanKids.length) blk[type].children = cleanKids;
    return blk;
   }
   function walk(node, parentAnnot, depth) {
    if (depth > C.WALK_DEPTH_MAX) return;
    if (node.nodeType === Node.TEXT_NODE) { frags.push({ text: node.textContent, link: null, annot: parentAnnot }); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (SKIP_TAGS.has(tag)) return;
    if (node.classList?.contains('GifPlayer')) {
     flush();
     const m = gifMedia(node);
     if (m) { const b = mkMedia(m.type, m.url); if (b) result.push(b); }
     else for (const c of node.childNodes) walk(c, parentAnnot, depth + 1);
     return;
    }
    if (tag === 'TABLE') {
     flush();
     const rows = [];
     let hdr = false;
     const tblRows = node.rows || node.querySelectorAll('tr');
     for (const tr of tblRows) {
      const cells = [];
      const tblCells = tr.cells || tr.querySelectorAll('td,th');
      for (const td of tblCells) cells.push(innerText(td).trim());
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
      children.push(...blocksFromClone(c.cloneNode(true), depth + 1));
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
     for (const c of node.childNodes) walk(c, merged, depth + 1);
     return;
    }
    if (tag === 'BR') { frags.push({ text: '\n', link: null, annot: parentAnnot }); return; }
    if (tag === 'IMG') {
     if (!isAvatar(node) && !isZhihuMember(node)) { flush(); const b = mkMedia('image', realImgSrc(node)); if (b) result.push(b); }
     return;
    }
    if (tag === 'VIDEO') { flush(); result.push(...mediaBlocks('video', videoSrc(node))); return; }
    if (tag === 'IFRAME') { flush(); result.push(...mediaBlocks('embed', normOrSafe(node.src))); return; }
    const hm = HEADING_RE.exec(tag);
    if (hm) {
     flush();
     for (const c of node.childNodes) {
      if (c.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(c.tagName)) frags.push({ text: innerText(c), link: null, annot: parentAnnot });
      else walk(c, parentAnnot, depth + 1);
     }
     const rt = takeRich();
     if (rt.length && hasText(rt)) result.push(mkBlockRT(`heading_${Math.min(+hm[1], 3)}`, rt));
     return;
    }
    if (tag === 'LI') {
     flush();
     const hoist = [];
     const item = listItemBlock(node, node.parentElement?.tagName === 'OL', true, hoist, depth);
     result.push(item);
     for (const h of hoist) result.push(h);
     return;
    }
    if (tag === 'BLOCKQUOTE') {
     flush();
     let hasBlock = false;
     for (const c of node.children) { if (BLOCK_TAGS.has(c.tagName)) { hasBlock = true; break; } }
     if (hasBlock) { const t = innerText(node).trim(); if (t) result.push(mkQuote(t)); }
     else { for (const c of node.childNodes) walk(c, parentAnnot, depth + 1); const rt = takeRich(); if (rt.length && hasText(rt)) result.push(mkBlockRT('quote', rt)); }
     return;
    }
    if (tag === 'PRE') { flush(); result.push(mkCode(node.textContent || '', detectLang(node))); return; }
    if (tag === 'DIV' && preHosts.has(node) && !node.querySelector('p,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,details,article,section')) {
     flush();
     const pre = node.querySelector('pre');
     result.push(mkCode(pre.textContent || '', detectLang(pre)));
     return;
    }
    if (tag === 'FIGURE') { flush(); for (const c of node.childNodes) walk(c, parentAnnot, depth + 1); return; }
    if (BLOCK_TAGS.has(tag)) { flush(); for (const c of node.childNodes) walk(c, parentAnnot, depth + 1); flush(); }
    else for (const c of node.childNodes) walk(c, parentAnnot, depth + 1);
   }
   for (const c of fragment.childNodes) walk(c, null, 0);
   flush();
   return result
    .filter(b => {
     if (!b) return false;
     if (b.type === 'paragraph') return paraHasText(b);
     return true;
    })
    .map(b => {
     const body = b[b.type];
     if (body && Array.isArray(body.children)) body.children = stripDeep(body.children);
     return b;
    });
  }

  // ===== 知乎页面适配 =====
  const removeAvatarImgs = (root) => root.querySelectorAll('img').forEach(img => { if (isAvatar(img) || isZhihuMember(img)) img.remove(); });
  function cleanZhihu(clone) { clone.querySelectorAll(ZHIHU_REMOVE).forEach(n => n.remove()); removeAvatarImgs(clone); return clone; }
  function zhihuAuthor(root) {
   for (const s of ['.UserLink', '.AuthorInfo-name', '.AnswerItem-authorInfo .UserLink', '.ContentItem-authorInfo .UserLink', '.Post-Author .UserLink', '.AuthorInfo .UserLink', '.AnswerItem-authorInfo a[href*="/people/"]', '.ContentItem-authorInfo a[href*="/people/"]']) {
    const found = root.querySelector(s) || root.closest('.AnswerItem')?.querySelector(s);
    if (found) return found.textContent.trim().replace(/\s+/g, ' ');
   }
   return null;
  }
  function zhihuQuestionTitle(root) {
   const q = (s) => (s || '').trim().replace(/\s+/g, ' ');
   const ok = (t) => t && t.length >= 4 && t.length <= 200 && !/^(查看全部|展开|收起|广告|更多|写回答|关注|登录|注册|发私信)/.test(t) && !/^(\d+个?回答|\d+条?评论)/.test(t);
   if (location.pathname.includes('/question/')) {
    for (const sel of ['.QuestionHeader-title', 'h1.QuestionHeader-title', '.QuestionHeader h1', '.QuestionHeader-content h1']) {
     const h = document.querySelector(sel);
     if (h) { const t = q(h.textContent); if (ok(t)) return t; }
    }
   }
   const container = root.closest('.ContentItem') || root.closest('.Card') || root.closest('[itemprop="suggestedAnswer"]') || root;
   for (const sel of ['.ContentItem-title', '.QuestionItem-title', 'h2.ContentItem-title', 'h2 a[href*="/question/"]']) {
    const found = container.querySelector(sel);
    if (found) { const t = q(found.textContent); if (ok(t)) return t; }
   }
   return null;
  }
  function zhihuSourceURL(root) {
   const link = root.querySelector('h2 a[href*="/question/"]') || root.querySelector('.ContentItem-title a[href*="/question/"]') || root.querySelector('.QuestionItem-title a');
   if (link?.href) return safeURL(link.href);
   const m = location.pathname.match(/\/question\/(\d+)/);
   if (m) return `https://www.zhihu.com/question/${m[1]}`;
   return safeURL(location.href);
  }
  const ZHIHU_COMMENT_ITEM = '.CommentItemV2, .CommentItem';
  const ZHIHU_REPLY_ITEM = '.ReplyItem';
  const ZHIHU_COMMENT_BOX = '.CommentsV2, .CommentListV2, .Comments-container, [class*="CommentList"]';
  const ZHIHU_COMMENT_REMOVE = [
   '[class*="VoteButton"]', 'button[aria-label*="赞"]', 'button[aria-label*="回复"]', '[class*="CommentItemV2-meta"]', '[class*="CommentItem-meta"]',
   '[class*="CommentItemV2-footer"]', '[class*="CommentItem-footer"]', '[class*="ReplyItem-footer"]', '[class*="MoreButton"]', '[class*="more-button"]',
   '[class*="toolbar"]', '[class*="Toolbar"]', '.CommentItemV2-avatar', '.CommentItem-avatar', '[class*="CommentAvatar"]', '[class*="comment-avatar"]',
   '[class*="authorInfo"]', '[class*="AuthorInfo"]',
  ].join(',');
  function zhihuCommentAuthor(item) {
   const a = item.querySelector('a[href*="/people/"]');
   if (!a) return { name: '', url: null };
   return { name: a.textContent.trim().replace(/\s+/g, ' '), url: safeURL(a.href) };
  }
  function zhihuCommentMeta(item) {
   let like = '', time = '';
   const likeEl = item.querySelector('[class*="VoteButton"], button[aria-label*="赞"]');
   if (likeEl) {
    const m = likeEl.textContent.replace(/[^\d万千.]/g, '');
    if (m) like = '👍 ' + m;
   }
   const footText = ((item.querySelector('[class*="footer"], [class*="Footer"], [class*="meta"], [class*="Meta"]') || {}).textContent || '').replace(/\s+/g, ' ');
   const tm = footText.match(/\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2})?|\d+\s*(?:小时|分钟|天)前|刚刚|昨天/);
   if (tm) time = tm[0];
   return [like, time].filter(Boolean).join(' · ');
  }
  function zhihuCommentReplyTo(item) {
   const metaLine = ((item.querySelector('[class*="meta"], [class*="Meta"]') || {}).textContent || '').replace(/\s+/g, ' ');
   const m = metaLine.match(/回复\s*@?([^\s：:]+)/);
   if (m) return m[1].trim();
   const content = item.querySelector('.CommentItemV2-content, .CommentContent, [class*="CommentContent"], .ReplyItem-content, .RichText');
   if (content) {
    const t = (content.textContent || '').trim();
    const m2 = t.match(/^回复\s*@?([^：:]{1,40})[：:]\s*/);
    if (m2) return m2[1].trim();
   }
   return '';
  }
  function zhihuCommentContentBlocks(item, skipNestedReplies) {
   const sels = ['.CommentItemV2-content', '.CommentContent', '[class*="CommentContent"]', '.ReplyItem-content', '.RichText'];
   let contentEl = null;
   for (const sel of sels) {
    const candidates = item.querySelectorAll(sel);
    for (const c of candidates) {
     if (skipNestedReplies && c.closest(ZHIHU_REPLY_ITEM) && !item.matches(ZHIHU_REPLY_ITEM)) continue;
     if ((c.textContent || '').trim() || c.querySelector('img')) { contentEl = c; break; }
    }
    if (contentEl) break;
   }
   if (!contentEl) contentEl = item;
   const clone = contentEl.cloneNode(true);
   if (skipNestedReplies) clone.querySelectorAll(ZHIHU_REPLY_ITEM).forEach(n => n.remove());
   clone.querySelectorAll(ZHIHU_COMMENT_REMOVE).forEach(n => n.remove());
   removeAvatarImgs(clone);
   return blocksFromClone(clone);
  }
  function zhihuCommentBullet(item, isReply) {
   const { name, url } = zhihuCommentAuthor(item);
   const bodyBlocks = zhihuCommentContentBlocks(item, !isReply);
   const hasBody = bodyBlocks.some(b => (b.type === 'paragraph' ? paraHasText(b) : true));
   if (!hasBody && !name) return null;
   const headerRT = [];
   if (name) {
    const nameNode = { type: 'text', text: { content: name }, annotations: { bold: true } };
    if (url) nameNode.text.link = { url };
    headerRT.push(nameNode);
   }
   if (isReply) {
    const to = zhihuCommentReplyTo(item);
    if (to) headerRT.push({ type: 'text', text: { content: ' 回复 ' + to } });
   }
   if (!isReply) {
    const meta = zhihuCommentMeta(item);
    if (meta) headerRT.push({ type: 'text', text: { content: ' · ' + meta } });
   }
   const blk = mkBlockRT('bulleted_list_item', headerRT.length ? capRT(headerRT) : null);
   const kids = [];
   for (const b of bodyBlocks) {
    if (b.type === 'paragraph' && isReply) {
     const first = b.paragraph?.rich_text?.[0];
     if (first?.text?.content) {
      first.text.content = first.text.content.replace(/^回复\s*@?[^：:]{0,40}[：:]\s*/, '');
      if (!(first.text.content || '').trim() && (b.paragraph.rich_text.length === 1)) continue;
     }
    }
    kids.push(b);
   }
   if (!isReply) {
    for (const r of item.querySelectorAll(ZHIHU_REPLY_ITEM)) {
     const rb = zhihuCommentBullet(r, true);
     if (rb) kids.push(rb);
    }
   }
   const cleanKids = stripDeep(kids).slice(0, C.BATCH_SIZE);
   if (cleanKids.length) blk.bulleted_list_item.children = cleanKids;
   return blk;
  }
  function zhihuComments(root) {
   let items = [];
   const singleReply = root.matches(ZHIHU_REPLY_ITEM);
   if (singleReply || root.matches(ZHIHU_COMMENT_ITEM)) items = [root];
   else items = [...root.querySelectorAll(ZHIHU_COMMENT_ITEM)].filter(elm => !elm.parentElement?.closest(ZHIHU_COMMENT_ITEM));
   const bullets = [];
   for (const it of items) {
    const b = zhihuCommentBullet(it, singleReply);
    if (b) bullets.push(b);
   }
   if (!bullets.length) return [];
   const out = [ mkH(3, bullets.length === 1 ? '💬 知乎评论' : `💬 评论区（${bullets.length} 条）`) ];
   const srcUrl = safeURL(location.href);
   if (srcUrl) out.push(mkRichPara([{ type: 'text', text: { content: '🔗 原文链接', link: { url: srcUrl } } }]));
   out.push(...bullets);
   return out;
  }

  // ===== X(Twitter) 页面适配 =====
  const upgradeTwImg = (u) => {
   if (!u) return u;
   if (/[?&]name=(small|medium|large|360x360|900x900)\b/i.test(u)) return u.replace(/([?&])name=(?:small|medium|large|360x360|900x900)\b/i, '$1name=orig');
   if (/^https?:\/\/[^/?#]*\btwimg\.com\//i.test(u) && !/[?&]name=/i.test(u) && !/\.(png|jpe?g|gif|webp)([?#]|$)/i.test(u)) return u + (u.includes('?') ? '&' : '?') + 'name=orig';
   return u;
  };
  function twMediaBlocks(tweet) {
   const out = [], seen = new Set();
   const pushImg = (raw) => {
    const url = upgradeTwImg(normOrSafe(raw));
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
     const u = normOrSafe(s.src);
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
  function twAuthorHeader(tw) {
   const un = tw.querySelector('[data-testid="User-Name"]');
   const timeEl = tw.querySelector('time');
   const link = safeURL(timeEl?.closest('a')?.href || '');
   const handle = ((un?.textContent || '').match(/@[A-Za-z0-9_]+/) || [])[0] || '';
   let name = '';
   if (un) {
    for (const sp of un.querySelectorAll('span')) {
     const t = sp.textContent.trim();
     if (t && !t.startsWith('@') && t !== '·') { name = t; break; }
    }
   }
   if (!name) name = handle || '匿名用户';
   const nameNode = { type: 'text', text: { content: name }, annotations: { bold: true } };
   if (link) nameNode.text.link = { url: link };
   const rt = [nameNode];
   const meta = [handle, (timeEl?.textContent || '').trim()].filter(Boolean).join(' · ');
   if (meta) rt.push({ type: 'text', text: { content: ' ' + meta } });
   return mkRichPara(rt);
  }
  function twTextBlocks(tw) {
   if (tw.getElementsByTagName('*').length > C.CLONE_NODE_MAX) return [];
   const clone = tw.cloneNode(true);
   clone.querySelectorAll('[data-testid="app-text-transition-container"],button[data-testid="reply"],button[data-testid="retweet"],button[data-testid="like"],button[data-testid="unlike"],button[data-testid="bookmark"],button[data-testid="share"]').forEach(n => n.remove());
   clone.querySelectorAll('img,video,[data-testid="tweetPhoto"],[data-testid="videoPlayer"]').forEach(n => n.remove());
   return blocksFromClone(clone);
  }
  function twConversation() {
   if (!isTwitterStatus()) return null;
   const main = document.querySelector('main[role="main"]') || document.querySelector('div[data-testid="primaryColumn"]') || document.body;
   const tweets = [...main.querySelectorAll('article[data-testid="tweet"]')].slice(0, C.TW_CONV_MAX);
   if (!tweets.length) return null;
   const curId = (location.pathname.match(/\/status\/(\d+)/) || [])[1] || '';
   let focal = tweets.findIndex(tw => {
    const a = tw.querySelector('time')?.closest('a');
    return !!(a && curId && (a.href || '').includes('/status/' + curId));
   });
   if (focal < 0) focal = 0;
   const tweetBlocks = (tw) => {
    const text = twTextBlocks(tw);
    const media = twMediaBlocks(tw);
    if (!text.length && !media.length) return null;
    return [twAuthorHeader(tw), ...text, ...media];
   };
   const out = [];
   if (focal > 0) {
    const ctx = [];
    for (let i = 0; i < focal; i++) { const b = tweetBlocks(tweets[i]); if (b) ctx.push(...b, mkDivider()); }
    if (ctx.length) { if (ctx[ctx.length - 1].type === 'divider') ctx.pop(); out.push(mkH(3, '⬆️ 上文'), ...ctx, mkDivider()); }
   }
   const mainBlocks = tweetBlocks(tweets[focal]);
   if (mainBlocks) out.push(...mainBlocks);
   const replyGroups = [];
   for (let i = focal + 1; i < tweets.length; i++) { const b = tweetBlocks(tweets[i]); if (b) replyGroups.push(b); }
   if (replyGroups.length) {
    out.push(mkDivider(), mkH(3, `💬 评论（${replyGroups.length}）`));
    replyGroups.forEach((g, i) => { if (i > 0) out.push(mkDivider()); out.push(...g); });
   }
   return out.length ? out : null;
  }
  function safeClone(target) {
   const count = target.getElementsByTagName('*').length;
   if (count > C.CLONE_NODE_MAX) {
    console.warn(`[NC] 节点数量 ${count} 超过上限 ${C.CLONE_NODE_MAX}，跳过克隆`);
    toast(`内容过大（${count} 个节点），已跳过`, 'error');
    return null;
   }
   return target.cloneNode(true);
  }

  // ---------- 内容提取入口 ----------
  // 克隆体先挂到离屏 DocumentFragment 再交给 parseBlocks——直接传游离节点可安全遍历，但
  // 统一入口后 5 处调用点不再各自重复 createDocumentFragment + appendChild 三连。
  const blocksFromClone = (node, depth) => { const frag = document.createDocumentFragment(); frag.appendChild(node); return parseBlocks(frag, depth); };
  function extractBlocks(target, opts) {
   const title = pageTitle();
   const tag = target.tagName;
   if (tag === 'IMG') {
    if (isAvatar(target) || isZhihuMember(target)) return { blocks: [], title };
    let url = realImgSrc(target);
    if (url && isTwitter && !DATA_IMG_RE.test(url)) url = upgradeTwImg(url);
    const b = mkMedia('image', url);
    return { blocks: b ? [b] : [], title };
   }
   if (tag === 'VIDEO') { return { blocks: mediaBlocks('video', videoSrc(target)), title }; }
   if (tag === 'IFRAME') { return { blocks: mediaBlocks('embed', normOrSafe(target.src)), title }; }
   if (target.classList?.contains('GifPlayer')) { const m = gifMedia(target); if (m) { const b = mkMedia(m.type, m.url); return { blocks: b ? [b] : [], title }; } }
   if (isTwitter) {
    const twConv = opts?.altClick ? null : twConversation();
    if (twConv) return { blocks: twConv, title };
    const article = target.closest('article[data-testid="tweet"]');
    if (article) return { blocks: [twAuthorHeader(article), ...twTextBlocks(article), ...twMediaBlocks(article)], title };
   }
   if (isZhihu && target.matches && (target.matches(ZHIHU_REPLY_ITEM) || target.matches(ZHIHU_COMMENT_ITEM) || target.matches(ZHIHU_COMMENT_BOX))) {
    const cb = zhihuComments(target);
    if (cb.length) return { blocks: cb, title };
   }
   const clone = safeClone(target);
   if (!clone) return { blocks: [], title };
   if (isZhihu) {
    const qTitle = zhihuQuestionTitle(target);
    const srcUrl = zhihuSourceURL(target);
    if (qTitle) for (const s of ['.ContentItem-title', 'h2.ContentItem-title']) clone.querySelectorAll(s).forEach(n => n.remove());
    cleanZhihu(clone);
    const body = blocksFromClone(clone);
    const prefix = [];
    if (qTitle) prefix.push(mkH(2, qTitle));
    const author = zhihuAuthor(target);
    if (author) prefix.push(mkPara(`作者：${author}`));
    if (srcUrl) prefix.push(mkRichPara([{ type: 'text', text: { content: qTitle ? '🔗 问题链接' : '🔗 原文链接', link: { url: srcUrl } } }]));
    return { blocks: [...prefix, ...body], title: qTitle || title };
   }
   return { blocks: blocksFromClone(clone), title };
  }
  function findTarget(node) {
   if (!node || node === document.body || node === document.documentElement || isOwn(node)) return null;
   const tag = node.tagName;
   if (tag === 'IMG') return (!isAvatar(node) && !isZhihuMember(node) && realImgSrc(node)) ? node : null;
   if (tag === 'VIDEO' && videoSrc(node)) return node;
   if (tag === 'IFRAME' && normOrSafe(node.src)) return node;
   if (node.classList?.contains('GifPlayer')) return node;
   if (isZhihu) {
    const cReply = node.closest(ZHIHU_REPLY_ITEM);
    if (cReply) return cReply;
    const cItem = node.closest(ZHIHU_COMMENT_ITEM);
    if (cItem) return cItem;
    const cBox = node.closest(ZHIHU_COMMENT_BOX);
    if (cBox) { const cr = cBox.getBoundingClientRect(); if (cr.width > 50 && cr.height > 100) return cBox; }
    for (const s of ['.AnswerItem', '.PostIndex-answerItem', '.List-item', '.QuestionAnswer-content', '[itemprop="suggestedAnswer"]', '.ContentItem', '.Card', '.RichContent', '.RichContent-inner', '.Answer', '.Post-RichTextContainer', '[itemprop="text"]', '.RichText', 'article']) {
     const card = node.closest(s);
     if (card) { const r = card.getBoundingClientRect(); if (r.width > 50 && r.height > 100) return card; }
    }
   }
   if (isTwitter) { const tw = node.closest('article[data-testid="tweet"]'); if (tw) return tw; }
   let cur = node;
   while (cur && cur !== document.body && cur !== document.documentElement) {
    if (BLOCK_TAGS.has(cur.tagName)) {
     const r = cur.getBoundingClientRect();
     if (r.width > 20 && r.height > 20) return cur;
    }
    cur = cur.parentElement;
   }
   const fb = node.closest('p,div,li,blockquote');
   if (fb) { const fr = fb.getBoundingClientRect(); if (fr.width > 0 && fr.height > 0) return fb; }
   return null;
  }
  function describeElement(elm) {
   if (!elm) return '';
   const tag = elm.tagName.toLowerCase();
   const cls = typeof elm.className === 'string' ? elm.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
   const id = elm.id ? '#' + elm.id : '';
   return tag + (id ? id : cls ? '.' + cls : '');
  }

  // ===== 选取候选与范围 =====
  function buildCandidates(best) {
   const cands = [best];
   let cur = best.parentElement;
   while (cur && cur !== document.body && cur !== document.documentElement) {
    if (BLOCK_TAGS.has(cur.tagName)) {
     const r = cur.getBoundingClientRect();
     if (r.width > 20 && r.height > 20) cands.push(cur);
    }
    cur = cur.parentElement;
   }
   return cands;
  }
  // 选取提示变更检测——每次鼠标帧回调都重写 el.tip.textContent，
  // 同一目标上移动鼠标时为纯冗余 DOM 写入；签名（元素描述+索引+候选数）未变时跳过。
  // positionHL 仍每帧执行（元素位置可能随页面变化），仅文本写入被短路。
  // 元素描述串随候选集重建时缓存（selDesc），签名比对不再逐帧 describeElement
  // （原实现每帧对当前目标做 className split/拼接）；锚点不变时 selDesc 稳定，行为等价。
  let tipSig = '', selDesc = '';
  function applySelection() {
   const t = selCands[selIdx];
   if (!t) return;
   hlTarget = t;
   positionHL(t);
   const sig = `${selDesc}|${selIdx}/${selCands.length}`;
   if (sig !== tipSig) {
    tipSig = sig;
    el.tip.textContent = `🔍 ${selDesc} — 单击提取 · ↑↓ 调整范围 (${selIdx + 1}/${selCands.length})`;
   }
  }

  // ===== 悬浮球位置与拖拽 =====
  const clampPos = (l, t) => ({ left: Math.max(0, Math.min(l, innerWidth - C.BTN_SIZE)), top: Math.max(0, Math.min(t, innerHeight - C.BTN_SIZE)) });
  function fullFromHidden(edge, l, t) {
   if (edge === 'left') l = 0; if (edge === 'right') l = innerWidth - C.BTN_SIZE;
   if (edge === 'top') t = 0; if (edge === 'bottom') t = innerHeight - C.BTN_SIZE;
   return clampPos(l, t);
  }
  function hiddenPos(edge, l, t) {
   if (edge === 'left') l = -C.BTN_SIZE + C.VISIBLE_PART;
   if (edge === 'right') l = innerWidth - C.VISIBLE_PART;
   if (edge === 'top') t = -C.BTN_SIZE + C.VISIBLE_PART;
   if (edge === 'bottom') t = innerHeight - C.VISIBLE_PART;
   return { left: l, top: t };
  }
  // right / bottom 写一次即可——拖拽期间 mousemove 以 ~60Hz 调用 applyPos，
  // 原实现每次写 4 个样式属性（每次写入都使样式失效触发重算），实际 left/top 变化、right/bottom 恒为 'auto'。
  // 写一次守卫将高频样式写入从 4 次降为 2 次。
  let btnPosAutoWritten = false;
  function applyPos(l, t) {
   const p = clampPos(l, t);
   el.btn.style.left = p.left + 'px';
   el.btn.style.top = p.top + 'px';
   if (!btnPosAutoWritten) { el.btn.style.right = 'auto'; el.btn.style.bottom = 'auto'; btnPosAutoWritten = true; }
  }
  const showFull = () => { el.btn.classList.remove('edge'); hidden = false; hiddenEdge = ''; };
  const hideTo = (e) => { el.btn.classList.add('edge'); hidden = true; hiddenEdge = e; };
  function revealFromEdge() {
   if (!hidden) return;
   const r = el.btn.getBoundingClientRect();
   const fp = fullFromHidden(hiddenEdge, r.left, r.top);
   applyPos(fp.left, fp.top); showFull();
  }
  // 悬浮球存储位置内存缓存——大图隐藏 / 恢复与窗口 resize 路径每次同步 GM_getValue × 2，
  // 高频命中下反复跨上下文读取；缓存由 savePos/loadPos 维护，首次未缓存时才读存储，行为等价。
  let memBtnPos = null;
  function savePos() {
   const r = el.btn.getBoundingClientRect();
   let fl = r.left, ft = r.top;
   if (hidden) { const p = fullFromHidden(hiddenEdge, fl, ft); fl = p.left; ft = p.top; }
   const c = clampPos(fl, ft);
   memBtnPos = c;
   GM_setValue(STORAGE.BTN_LEFT, c.left);
   GM_setValue(STORAGE.BTN_TOP, c.top);
   GM_setValue(STORAGE.BTN_HIDDEN, hidden);
   GM_setValue(STORAGE.BTN_EDGE, hiddenEdge);
  }
  const storedBtnPos = () => {
   if (memBtnPos) return memBtnPos;
   const l = GM_getValue(STORAGE.BTN_LEFT, null), t = GM_getValue(STORAGE.BTN_TOP, null);
   memBtnPos = (l === null || t === null) ? null : clampPos(l, t);
   return memBtnPos;
  };
  function applyHiddenAt(edge, l, t) { const hp = hiddenPos(edge, l, t); applyPos(hp.left, hp.top); hideTo(edge); }
  function loadPos() {
   const c = storedBtnPos();
   if (!c) return;
   const edge = GM_getValue(STORAGE.BTN_EDGE, '');
   if (GM_getValue(STORAGE.BTN_HIDDEN, false) && edge) applyHiddenAt(edge, c.left, c.top);
   else { applyPos(c.left, c.top); showFull(); }
  }
  function snap(l, t) {
   // 大图隐藏期间悬浮球为 display:none，rect 读得全零——据此计算会把存储位置覆写成视口左上角并误判贴边
   if (hiddenForImg) return;
   let edge = '';
   if (l < C.SNAP_THRESHOLD) edge = 'left';
   else if (l + C.BTN_SIZE > innerWidth - C.SNAP_THRESHOLD) edge = 'right';
   else if (t < C.SNAP_THRESHOLD) edge = 'top';
   else if (t + C.BTN_SIZE > innerHeight - C.SNAP_THRESHOLD) edge = 'bottom';
   if (edge) { const hp = hiddenPos(edge, l, t); applyPos(hp.left, hp.top); hideTo(edge); }
   else { applyPos(l, t); showFull(); }
   savePos();
  }
  el.btn.addEventListener('mouseenter', () => {
   if (dragging || hiddenForImg) return;
   clearTimeout(hoverTimer);
   revealFromEdge();
  }, { signal });
  el.btn.addEventListener('mouseleave', () => {
   if (dragging || hidden) return;
   hoverTimer = setTimeout(() => {
    const r = el.btn.getBoundingClientRect(); snap(r.left, r.top);
   }, 500);
  }, { signal });
  _cleanupFns.push(() => clearTimeout(hoverTimer));
  _cleanupFns.push(() => clearTimeout(okAutoCloseTimer));

  // ---------- 完成面板自动关闭倒计时 ----------
  // 面板 10s 后自动消失，此前无任何提示，用户常以为内容未保存而重复发送；
  // 倒计时文案与 okAutoCloseTimer 同源，任一路径关闭都会 stop。
  const OK_AUTO_CLOSE_MS = 10000;
  let okCountdownTimer = null;
  function stopOkCountdown() {
   if (okCountdownTimer) { clearInterval(okCountdownTimer); okCountdownTimer = null; }
   if (el.okTip) el.okTip.style.display = 'none';
  }
  function startOkCountdown(sec) {
   stopOkCountdown();
   if (!el.okTip) return;
   let left = Math.max(1, sec | 0);
   el.okTip.style.display = '';
   el.okTip.textContent = `${left} 秒后自动关闭`;
   okCountdownTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) { stopOkCountdown(); return; }
    el.okTip.textContent = `${left} 秒后自动关闭`;
   }, 1000);
  }
  _cleanupFns.push(stopOkCountdown);
  el.btn.addEventListener('mousedown', (e) => {
   if (e.button === 2) return;
   e.preventDefault(); e.stopPropagation();
   dragging = true; el.btn.style.transition = 'none';
   revealFromEdge();
   const r = el.btn.getBoundingClientRect();
   dragSX = e.clientX; dragSY = e.clientY; dragIL = r.left; dragIT = r.top;
  }, { signal });
  let dragResetTimer = null;
  const clearDragReset = () => { if (dragResetTimer) { clearTimeout(dragResetTimer); dragResetTimer = null; } };
  function dragEnd(e) {
   if (!dragging) return;
   dragging = false; el.btn.style.transition = '';
   clearDragReset();
   const dx = e.clientX - dragSX, dy = e.clientY - dragSY;
   dragDist = Math.sqrt(dx * dx + dy * dy);
   if (dragDist <= C.DRAG_CLICK_PX) { savePos(); return; }
   const r = el.btn.getBoundingClientRect(); snap(r.left, r.top);
   dragResetTimer = setTimeout(() => { dragResetTimer = null; dragDist = 0; }, 300);
  }
  function cancelDrag() { if (!dragging) return; dragging = false; dragDist = 0; el.btn.style.transition = ''; clearDragReset(); }
  el.btn.addEventListener('click', (e) => {
   if (dragDist > C.DRAG_CLICK_PX) { e.preventDefault(); e.stopPropagation(); dragDist = 0; return; }
   if (hidden) { e.preventDefault(); e.stopPropagation(); revealFromEdge(); savePos(); dragDist = 0; return; }
   e.stopPropagation(); startPickFlow(); dragDist = 0;
  }, { signal });
  el.btn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); openSettings(); }, { signal });
  // 大图隐藏期间（display:none）窗口 resize 会读到全零 rect 并把悬浮球重定位到 (0,0)，故直接跳过该期间的重定位；
  // 恢复时按当前坐标收敛到视口内即可（窗口可能在隐藏期间缩小），无需重读存储，省去 4 次 GM 读取。
  function onResize() {
   if (hiddenForImg) return;
   if (hidden) {
    const c = storedBtnPos();
    if (c) applyHiddenAt(hiddenEdge, c.left, c.top);
   } else {
    const r = el.btn.getBoundingClientRect(); applyPos(r.left, r.top);
   }
  }
  window.addEventListener('resize', onResize, { signal });
  function isLargeImg(img) {
   const r = img.getBoundingClientRect();
   return r.width >= innerWidth * C.LARGE_IMG_RATIO || r.height >= innerHeight * C.LARGE_IMG_RATIO;
  }
  let largeImgRafId = null;
  let largeImgLastX = 0, largeImgLastY = 0;
  function onDocMouseMove(e) {
   largeImgLastX = e.clientX; largeImgLastY = e.clientY;
   if (dragging) { e.preventDefault(); applyPos(dragIL + e.clientX - dragSX, dragIT + e.clientY - dragSY); return; }
   if (selecting) { onHoverMove(e); return; }
   const now = Date.now();
   const throttle = (hidden || hiddenForImg) ? 500 : C.IMG_CHECK_MS;
   if (now - imgCheckTs < throttle) return;
   imgCheckTs = now;
   if (largeImgRafId) return;
   largeImgRafId = requestAnimationFrame(() => {
    largeImgRafId = null;
    const t = document.elementFromPoint(largeImgLastX, largeImgLastY);
    if (t?.tagName === 'IMG' && isLargeImg(t)) {
     if (!hiddenForImg) { hiddenForImg = true; el.btn.style.display = 'none'; }
    } else if (hiddenForImg) {
     hiddenForImg = false; el.btn.style.display = '';
     // 隐藏期间未改动 left / top（onResize 已跳过），恢复只需按当前坐标收敛到视口内，无需重读存储重定位。
     if (hidden) { const c = storedBtnPos(); if (c) applyHiddenAt(hiddenEdge, c.left, c.top); }
     else { const r = el.btn.getBoundingClientRect(); applyPos(r.left, r.top); }
    }
   });
  }
  function onDocMouseUp(e) { if (dragging) dragEnd(e); }
  document.addEventListener('mousemove', onDocMouseMove, { signal, capture: true });
  document.addEventListener('mouseup', onDocMouseUp, { signal, capture: true });
  // 鼠标在视口外（浏览器工具栏 / 另一窗口 / 屏幕边缘）松手时，mouseup 不会派发到本页文档，
  // dragging 会一直停在 true：此后无按键移动也会跟随鼠标，且捕获阶段 preventDefault 抑制文本选择。
  // window.blur 只覆盖切换窗口，补 mouseleave 覆盖「拖出视口即松手」。
  document.addEventListener('mouseleave', cancelDrag, { signal });
  window.addEventListener('blur', cancelDrag, { signal });
  _cleanupFns.push(() => { if (largeImgRafId) cancelAnimationFrame(largeImgRafId); });
  _cleanupFns.push(() => { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } });

  // ===== 高亮与选取交互 =====
  // 高亮框几何签名：选取期间 applySelection 逐帧调用 positionHL，而鼠标常驻同一元素时矩形不变，
  // 逐帧重写 4 个样式属性纯属冗余；clearHL 复位签名以保证 display:block 下次必写。
  let hlSig = '';
  function positionHL(target) {
   const r = target.getBoundingClientRect();
   const sig = `${r.left}|${r.top}|${r.width}|${r.height}`;
   if (sig === hlSig) return;
   hlSig = sig;
   el.hl.style.display = 'block';
   el.hl.style.width = r.width + 'px';
   el.hl.style.height = r.height + 'px';
   el.hl.style.transform = `translate(${r.left}px,${r.top}px)`;
  }
  function clearHL() { el.hl.style.display = 'none'; hlTarget = null; selAnchor = null; hlSig = ''; }
  // 遮罩属本脚本 shadow 子树，页面侧命中测试只暴露 host，按 isOwn 过滤即得遮罩下的顶层页面元素；
  // 替代「临时关遮罩 pointer-events 再还原」的写法，免去每次命中的两次样式写与随之而来的样式重算。
  function topPageElementAt(x, y) {
   for (const n of document.elementsFromPoint(x, y)) if (!isOwn(n)) return n;
   return null;
  }
  let hoverX = 0, hoverY = 0;
  function onHoverMove(e) {
   hoverX = e.clientX; hoverY = e.clientY;
   if (rafId) return;
   rafId = requestAnimationFrame(() => {
    rafId = null;
    if (!selecting) return;
    const t = topPageElementAt(hoverX, hoverY);
    if (!t) { clearHL(); return; }
    const best = findTarget(t);
    if (best) {
     if (best !== selAnchor) {
      selAnchor = best;
      selCands = buildCandidates(best);
      selIdx = 0;
      selDesc = describeElement(best);
     }
     applySelection();
    } else clearHL();
   });
  }
  function onScroll() {
   if (!selecting || !hlTarget) return;
   if (!document.contains(hlTarget)) { clearHL(); return; }
   positionHL(hlTarget);
  }
  el.mask.addEventListener('click', (e) => {
   e.preventDefault(); e.stopPropagation();
   const t = topPageElementAt(e.clientX, e.clientY);
   if (!t) return;
   const best = (hlTarget && document.contains(hlTarget)) ? hlTarget : findTarget(t);
   if (!best) return;
   try {
    const { blocks: b, title } = extractBlocks(best, { altClick: e.altKey });
    if (!b.length) { toast('所选元素未提取到有效内容', 'error'); return; }
    if (b.length > C.BLOCKS_WARN) toast(`提取了 ${b.length} 个块，内容较多，发送可能较慢`, 'info');
    stopSelect();
    if (appendMode) {
     appendMode = false;
     blocks = blocks.concat(b);
     refreshPreview();
     openConfirm();
     toast(`已追加 ${b.length} 个块`, 'success');
    } else {
     blocks = b; showConfirm(title);
    }
   } catch (err) {
    console.error('[NC] 提取失败:', err.message || '未知错误');
    toast('内容提取失败: ' + (err.message || '未知错误'), 'error');
   }
  }, { signal });
  function onEsc(e) {
   if (e.key !== 'Escape') return;
   e.preventDefault();
   if (!selecting) return;
   const wasAppend = appendMode;
   appendMode = false;
   stopSelect();
   if (wasAppend) openConfirm();
  }
  function onSelKey(e) {
   if (!selecting || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
   e.preventDefault(); e.stopPropagation();
   if (!selCands.length) return;
   selIdx = Math.min(Math.max(selIdx + (e.key === 'ArrowUp' ? 1 : -1), 0), selCands.length - 1);
   applySelection();
  }
  function startSelect() {
   if (selecting) stopSelect();
   selecting = true;
   if (modeAc) { modeAc.abort(); modeAc = null; }
   modeAc = new AbortController();
   selCands = []; selIdx = 0; selAnchor = null; tipSig = ''; selDesc = '';
   el.tip.textContent = appendMode ? '🔍 追加模式：悬停高亮元素，单击追加 (↑↓调范围 · Esc返回)' : `🔍 悬停高亮元素，单击提取内容 (↑↓调整范围 · Esc取消${isTwitterStatus() ? ' · Alt+单击仅本条' : ''})`;
   el.tip.style.display = 'block';
   el.mask.style.display = 'block';
   document.body.style.cursor = 'crosshair';
   document.addEventListener('keydown', onEsc, { signal: modeAc.signal, capture: true });
   document.addEventListener('keydown', onSelKey, { signal: modeAc.signal, capture: true });
   document.addEventListener('scroll', onScroll, { signal: modeAc.signal, capture: true, passive: true });
  }
  function stopSelect() {
   if (!selecting) return;
   selecting = false;
   el.tip.style.display = 'none';
   el.mask.style.display = 'none';
   document.body.style.cursor = '';
   clearHL();
   if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
   if (modeAc) { modeAc.abort(); modeAc = null; }
   selCands = []; selIdx = 0; selAnchor = null; tipSig = ''; selDesc = '';
  }

  // ===== 预览渲染 =====
  function renderPreview(block, container, idx, depth = 0) {
   if (depth > C.PREVIEW_DEPTH_MAX) return;
   const wrap = document.createElement('div');
   wrap.className = 'nc-pi';
   if (idx >= 0) { wrap.dataset.index = idx; const del = document.createElement('button'); del.className = 'nc-pd'; del.textContent = '❌'; del.title = '删除此块'; wrap.appendChild(del); }
   let content = null;
   const type = block.type;
   if (type === 'paragraph') {
    const p = document.createElement('p');
    for (const rt of block.paragraph?.rich_text || []) {
     // 渲染层协议复验：链接来源链路均经 safeURL，此处兜底再拦一道，防上游改动引入 javascript: 等协议
     const linkUrl = rt.text?.link ? safeURL(rt.text.link.url) : null;
     if (linkUrl) { const a = document.createElement('a'); a.href = linkUrl; a.textContent = rt.text.content; a.target = '_blank'; a.rel = 'noopener noreferrer'; p.appendChild(a); }
     else p.appendChild(document.createTextNode(rt.text?.content || ''));
    }
    content = p;
   } else if (/^heading_[1-6]$/.test(type)) {
    const h = document.createElement(`h${type.split('_')[1]}`);
    h.textContent = rtStr(block[type]?.rich_text);
    content = h;
   } else if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
    const li = document.createElement('li');
    li.textContent = rtStr(block[type]?.rich_text);
    // 有序列表预览用数字序号，与发送后 Notion / 飞书观感一致
    if (type === 'numbered_list_item') li.style.listStyleType = 'decimal';
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
    const src = block.image?.external?.url || '';
    img.loading = 'lazy'; img.decoding = 'async';
    img.src = src;
    img.onerror = () => {
     img.onerror = null; img.style.display = 'none';
     const ph = document.createElement('div'); ph.className = 'nc-pv-img-err'; ph.textContent = '🖼️ 图片加载失败';
     img.after(ph);
    };
    content = img;
   } else if (type === 'video') {
    const div = document.createElement('div'); div.className = 'nc-mp';
    div.textContent = `🎬 视频: ${block.video?.external?.url || ''}`;
    content = div;
   } else if (type === 'embed') {
    const div = document.createElement('div'); div.className = 'nc-mp';
    div.textContent = `📺 嵌入: ${block.embed?.url || ''}`;
    content = div;
   } else if (type === 'table') {
    // 表格外观全部由 PANEL_CSS 的 .nc-pv table / td / th 规则承载，无需逐单元格内联样式
    const table = document.createElement('table');
    const rows = block.table?.children || [];
    rows.forEach((row, ri) => {
     const tr = document.createElement('tr');
     const isHeader = ri === 0 && !!block.table?.has_column_header;
     for (const cell of row.table_row?.cells || []) {
      const td = document.createElement(isHeader ? 'th' : 'td');
      td.textContent = cellText(cell);
      tr.appendChild(td);
     }
     table.appendChild(tr);
    });
    content = table;
   } else if (type === 'divider') {
    const hr = document.createElement('hr'); // 样式由 .nc-pv hr 提供，内联色不随暗色主题切换
    content = hr;
   } else if (type === 'toggle') {
    const det = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = rtStr(block.toggle?.rich_text);
    det.appendChild(sum);
    for (const child of block.toggle?.children || []) {
     const cd = document.createElement('div'); cd.style.marginLeft = '1em';
     renderPreview(child, cd, -1, depth + 1);
     det.appendChild(cd);
    }
    content = det;
   }
   if (content) wrap.appendChild(content);
   if (type !== 'toggle' && type !== 'table') {
    const kids = block[type]?.children;
    if (Array.isArray(kids) && kids.length && kids[0]?.type) {
     const kd = document.createElement('div');
     kd.className = 'nc-pv-kids';
     kids.forEach(k => renderPreview(k, kd, -1, depth + 1));
     wrap.appendChild(kd);
    }
   }
   container.appendChild(wrap);
  }
  function textFromBlocks(bks) {
   const parts = [];
   const collectLines = (arr) => {
    for (const b of arr) {
     if (!b) continue;
     const rt = b[b.type]?.rich_text;
     if (rt) parts.push(rt.map(t => t.text?.content || '').join(''));
     else if (b.type === 'image') { const u = b.image?.external?.url || ''; parts.push('[图片: ' + (DATA_IMG_RE.test(u) ? '内嵌图片' : u) + ']'); }
     else if (b.type === 'video') parts.push('[视频: ' + (b.video?.external?.url || '') + ']');
     else if (b.type === 'embed') parts.push('[嵌入: ' + (b.embed?.url || '') + ']');
     else if (b.type === 'divider') parts.push('---');
     else if (b.type === 'table') {
      for (const row of b.table?.children || []) {
       const line = (row.table_row?.cells || []).map(cellText).join(' | ');
       if (line.trim()) parts.push(line);
      }
     }
     const kids = b[b.type]?.children;
     if (Array.isArray(kids) && kids.length) collectLines(kids);
    }
   };
   collectLines(bks);
   return parts.join('\n');
  }
  // DocumentFragment 批量渲染——逐块直接 append 到可见容器，
  // 每次插入都可能触发样式/布局计算；离屏 Fragment 组装完成后单次挂载，
  // 数百块内容的预览刷新（含删除单块后的全量重建）显著减少布局抖动。
  function refreshPreview() {
   el.pv.innerHTML = '';
   if (!blocks.length) { el.pv.innerHTML = '<div class="nc-empty"><b>无内容</b>重新选取页面元素即可添加</div>'; el.pvCount.textContent = ''; return; }
   const frag = document.createDocumentFragment();
   blocks.forEach((b, i) => renderPreview(b, frag, i));
   el.pv.appendChild(frag);
   el.pvCount.textContent = `共 ${blocks.length} 个块`;
  }
  el.pv.addEventListener('click', (e) => {
   const del = e.target.closest('.nc-pd');
   if (!del) return;
   e.preventDefault(); e.stopPropagation();
   const item = del.closest('.nc-pi');
   if (!item) return;
   const idx = parseInt(item.dataset.index, 10);
   if (!isNaN(idx) && idx >= 0 && idx < blocks.length) { blocks.splice(idx, 1); refreshPreview(); }
  }, { signal });
  if (el.pvExpand) el.pvExpand.addEventListener('click', (e) => {
   e.preventDefault();
   setPvExpanded(!el.pv.classList.contains('expanded'));
  }, { signal });
  function showConfirm(title) {
   el.title.value = title || pageTitle();
   el.tags.value = matchDomainTags(S.domainTags, location.hostname) || GM_getValue(STORAGE.LAST_TAGS, '');
   refreshPreview();
   hideProgress();
   restoreConfirmModal();
   openConfirm();
  }
  function restoreConfirmModal() {
   el.modalCfm.classList.remove('minimized');
   el.btnMin.textContent = '🔽';
   el.btnMin.title = '最小化';
   setPvExpanded(false);
  }
  // 预览展开态由面板复位统一收敛——「重选 / 追加 / 重试」等路径都会走 restoreConfirmModal，
  // 避免上一次展开的大预览残留到下一次剪藏。
  function setPvExpanded(on) {
   if (!el.pvExpand) return;
   el.pv.classList.toggle('expanded', !!on);
   el.pvExpand.textContent = on ? '收起' : '展开';
   el.pvExpand.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function openConfirm() {
   if (modeAc) { modeAc.abort(); modeAc = null; }
   modeAc = new AbortController();
   document.addEventListener('keydown', onConfirmKey, { signal: modeAc.signal, capture: true });
   rememberFocus();
   el.ovCfm.style.display = 'flex';
   confirmOpen = true;
   renderPlatBadges();
   el.title.focus();
  }
  const closeConfirm = () => { if (modeAc) { modeAc.abort(); modeAc = null; } el.ovCfm.style.display = 'none'; confirmOpen = false; restoreFocus(); };
  function onConfirmKey(e) {
   if (!confirmOpen) return;
   if (el.modalCfm.classList.contains('minimized')) return;
   if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSend(); return; }
   if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
    const sa = shadow.activeElement;
    if (sa && (sa.tagName === 'INPUT' || sa.tagName === 'TEXTAREA')) return;
    const ae = (e.composedPath && e.composedPath()[0]) || e.target;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
    e.preventDefault(); el.pv.focus();
    const sel = window.getSelection();
    if (sel) {
     const range = document.createRange(); range.selectNodeContents(el.pv);
     sel.removeAllRanges(); sel.addRange(range);
    }
   }
  }
  // 返回 Promise<boolean>：调用方一律用 .then(ok => ...)，不可直接取布尔值
  async function tryCloseSettings() {
   if (!settingsDirty) return true;
   const ok = await askConfirm({
    title: '放弃未保存的更改？',
    message: '设置面板中有尚未保存的修改，关闭后将丢失。',
    okText: '放弃并关闭', cancelText: '返回继续编辑', danger: true,
   });
   if (!ok) return false;
   settingsDirty = false;
   if (el.dirtyFlag) el.dirtyFlag.style.display = 'none';
   return true;
  }
  function onModalEsc(e) {
   if (e.key !== 'Escape') return;
   const ov = [el.ovAsk, el.ovSet, el.ovCfm, el.ovErr, el.ovOk].find((o) => o.style.display === 'flex');
   if (!ov) return;
   e.preventDefault();
   e.stopImmediatePropagation();
   if (ov === el.ovAsk) { closeAsk(false); return; }
   // 设置面板有未保存改动时先弹二次确认；用户选择保留则由询问框接管后续 Esc
   if (ov === el.ovSet) { tryCloseSettings().then((ok) => { if (ok) closeSettings(); }); return; }
   if (ov === el.ovCfm) { closeConfirm(); return; }
   ov.style.display = 'none';
  }
  document.addEventListener('keydown', onModalEsc, { signal, capture: true });
  // ===== 发送历史与设置弹窗 =====
  // 单遍替换——串 4 次全文正则遍历（&、<、>、" 各一次）
  // 改为一次遍历 + 查表映射；发送历史渲染对每条记录调用，文本越长收益越大。转义顺序问题不复存在（单遍无二次转义风险）。
  const _ESC_MAP = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' });
  function escHtml(s) { return String(s).replace(/[&<>"]/g, ch => _ESC_MAP[ch]); }
  function readSendHistory() {
   try { const list = JSON.parse(GM_getValue(STORAGE.HISTORY, '[]')); return Array.isArray(list) ? list : []; }
   catch { return []; }
  }
  function recordSendHistory(title, platforms) {
   try {
    const list = readSendHistory();
    list.unshift({ t: Date.now(), title: String(title || '').slice(0, 120), p: (platforms || []).slice(0, 4) });
    GM_setValue(STORAGE.HISTORY, JSON.stringify(list.slice(0, C.HISTORY_MAX)));
   } catch {   }
  }
  function renderSendHistory() {
   if (!el.histList) return;
   const recent = readSendHistory().slice(0, 5);
   el.histList.innerHTML = recent.length ? recent.map((h) => {
    const d = new Date(h.t || 0);
    const time = isNaN(d.getTime()) ? '—' : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const plats = Array.isArray(h.p) ? h.p.join('、') : '';
    return `<div class="nc-hist-item"><span class="nc-hist-time">${escHtml(time)}</span><span class="nc-hist-title" title="${escHtml(h.title || '')}">${escHtml(h.title || '(无标题)')}</span><span class="nc-hist-plat">${escHtml(plats)}</span></div>`;
   }).join('') : '<div class="nc-hist-empty">暂无发送记录</div>';
  }
  // tab 由调用方指定（如点击平台徽章直达对应分区），缺省沿用上次所在分区
  function openSettings(tab) {
   refreshSettings();
   switchTab(tab && SET_TABS.includes(tab) ? tab : (GM_getValue(STORAGE.SET_TAB, SET_TABS[0]) || SET_TABS[0]));
   for (const f of FORM_FIELDS) f.input.value = S[f.snap];
   el.ckNotion.checked = isNotionEnabled();
   el.ckFeishu.checked = isFeishuEnabled();
   el.ckObsidian.checked = isObsidianEnabled();
   syncSectionState();
   el.sendProfile.value = (S.sendProfile === 'standard') ? 'standard' : 'gentle';
   for (const { input, btn } of [{ input: el.tok, btn: el.tokTglNotion }, { input: el.fsSecret, btn: el.tokTglFeishu }, { input: el.obsApiKey, btn: el.tokTglObsidian }]) {
    input.type = 'password'; btn.textContent = '👁️';
   }
   settingsDirty = false;
   if (el.dirtyFlag) el.dirtyFlag.style.display = 'none';
   renderSendHistory();
   rememberFocus();
   el.ovSet.style.display = 'flex';
   el.blocklist.focus();
   if (!settingsListenersAttached) {
    const inputs = FORM_FIELDS.map(f => f.input).concat([el.ckNotion, el.ckFeishu, el.ckObsidian, el.sendProfile]);
    const onInputChange = () => { settingsDirty = true; if (el.dirtyFlag) el.dirtyFlag.style.display = 'block'; };
    for (const type of ['change', 'input']) inputs.forEach(inp => inp.addEventListener(type, onInputChange, { signal }));
    for (const ck of [el.ckNotion, el.ckFeishu, el.ckObsidian]) ck.addEventListener('change', syncSectionState, { signal });
    // 凭据字段边输入边刷新指示灯，让 warn ↔ on 的切换与用户所见同步；
    // 这几处只在设置面板内触发，不在 60Hz 高频路径上。
    for (const inp of [el.tok, el.db, el.fsAppId, el.fsSecret, el.obsApiKey]) {
     inp.addEventListener('input', syncSectionState, { signal });
    }
    settingsListenersAttached = true;
   }
  }

  // ===== 配置导入导出 =====
  const BACKUP_KEYS = [STORAGE.ENABLE_NOTION, STORAGE.TOKEN, STORAGE.DB_ID, STORAGE.TAGS_PROP, STORAGE.FS_APP_ID, STORAGE.FS_APP_SECRET, STORAGE.FS_FOLDER, STORAGE.ENABLE_OBSIDIAN, STORAGE.OBSIDIAN_API_URL, STORAGE.OBSIDIAN_API_KEY, STORAGE.OBSIDIAN_FOLDER, STORAGE.BLOCKLIST, STORAGE.DOMAIN_TAGS, STORAGE.SEND_PROFILE, STORAGE.THEME];
  // 设置表单文本字段清单：「打开回填(snap) / 保存落盘(save 可选转换，默认 trim) / 导入回填(imp 可选转换)」
  const FORM_FIELDS = [
   { key: STORAGE.TOKEN, input: el.tok, snap: 'notionToken' },
   { key: STORAGE.DB_ID, input: el.db, snap: 'notionDbId', save: parseDbId },
   { key: STORAGE.TAGS_PROP, input: el.tag, snap: 'notionTagsProp', imp: (v) => String(v ?? '') || 'Tags' },
   { key: STORAGE.FS_APP_ID, input: el.fsAppId, snap: 'fsAppId' },
   { key: STORAGE.FS_APP_SECRET, input: el.fsSecret, snap: 'fsAppSecret' },
   { key: STORAGE.FS_FOLDER, input: el.fsFolder, snap: 'fsFolder' },
   { key: STORAGE.OBSIDIAN_API_URL, input: el.obsApiUrl, snap: 'obsApiUrl', imp: (v) => String(v ?? '') || 'http://127.0.0.1:27123' },
   { key: STORAGE.OBSIDIAN_API_KEY, input: el.obsApiKey, snap: 'obsApiKey' },
   { key: STORAGE.OBSIDIAN_FOLDER, input: el.obsFolder, snap: 'obsFolder' },
   { key: STORAGE.BLOCKLIST, input: el.blocklist, snap: 'blocklist' },
   { key: STORAGE.DOMAIN_TAGS, input: el.domainTags, snap: 'domainTags' },
   { key: STORAGE.THEME, input: el.theme, snap: 'theme', imp: (v) => (v === 'light' || v === 'dark') ? v : 'auto' },
  ];
  const toBool = (v) => v === true || v === 'true';
  el.expBtn.addEventListener('click', async () => {
   if (settingsDirty && !(await askConfirm({
    title: '导出不包含未保存的修改',
    message: '当前有未保存的表单修改，导出内容不包含这些修改。',
    okText: '仍要导出', cancelText: '返回',
   }))) return;
   const hasSecret = !!(GM_getValue(STORAGE.TOKEN, '') || GM_getValue(STORAGE.FS_APP_SECRET, '') || GM_getValue(STORAGE.OBSIDIAN_API_KEY, ''));
   if (hasSecret && !(await askConfirm({
    title: '导出文件包含敏感信息',
    message: '导出文件将包含 Token / Secret 明文，请确认保存位置安全。',
    okText: '继续导出', cancelText: '取消', danger: true,
   }))) return;
   const settings = {};
   for (const k of BACKUP_KEYS) settings[k] = GM_getValue(k, '');
   const payload = { app: 'notion-feishu-obsidian-clipper', version: SCRIPT_VERSION, exportedAt: new Date().toISOString(), settings };
   const a = document.createElement('a');
   a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
   a.download = 'clipper-config.json';
   document.body.appendChild(a); a.click(); a.remove();
   setTimeout(() => URL.revokeObjectURL(a.href), 4000);
   toast('✅ 配置已导出为 clipper-config.json', 'success');
  }, { signal });
  el.impBtn.addEventListener('click', () => el.impFile.click(), { signal });
  el.impFile.addEventListener('change', async () => {
   const file = el.impFile.files && el.impFile.files[0];
   el.impFile.value = '';
   if (!file) return;
   if (file.size > 1024 * 1024) { toast('❌ 导入失败：文件超过 1MB，不是有效的配置文件', 'error'); return; }
   try {
    const data = JSON.parse(await file.text());
    const inc = (data && typeof data === 'object' && data.settings && typeof data.settings === 'object') ? data.settings : data;
    if (!inc || typeof inc !== 'object' || Array.isArray(inc)) throw new Error('文件缺少 settings 字段');
    const get = (k) => (inc[k] === undefined || inc[k] === null) ? '' : inc[k];
    for (const f of FORM_FIELDS) f.input.value = f.imp ? f.imp(get(f.key)) : String(get(f.key));
    el.ckNotion.checked = toBool(get(STORAGE.ENABLE_NOTION));
    el.ckFeishu.checked = toBool(get(STORAGE.ENABLE_FEISHU));
    el.ckObsidian.checked = toBool(get(STORAGE.ENABLE_OBSIDIAN));
    el.sendProfile.value = get(STORAGE.SEND_PROFILE) === 'standard' ? 'standard' : 'gentle';
    syncSectionState();
    settingsDirty = true;
    if (el.dirtyFlag) el.dirtyFlag.style.display = 'block';
    toast('✅ 已回填导入配置，请核对后点击「保存设置」生效（Obsidian API 地址：' + el.obsApiUrl.value + '）', 'success');
   } catch (e) {
    toast('❌ 导入失败：' + (e?.message === '文件缺少 settings 字段' ? e.message : '文件不是有效的配置 JSON'), 'error');
   }
  }, { signal });
  el.histClear.addEventListener('click', async () => {
   if (!(await askConfirm({
    title: '清空发送历史？',
    message: '将删除本地保存的全部发送记录，此操作不可撤销。',
    okText: '清空', cancelText: '取消', danger: true,
   }))) return;
   GM_setValue(STORAGE.HISTORY, '[]');
   renderSendHistory();
   toast('已清空发送历史', 'success');
  }, { signal });

  // 覆盖层可见性判定——弹窗激活时不开启全新剪藏，防草稿 / 重试上下文被静默清空。
  // 快捷键与悬浮球点击共用同一套守卫：此前只有快捷键有，面板打开时点悬浮球会进入
  // 「选取模式已激活 + 确认面板仍显示」的叠加态。
  const ovVisible = (ov) => ov.style.display === 'flex';
  const startPickFlow = () => {
   if (ovVisible(el.ovErr) || ovVisible(el.ovOk) || ovVisible(el.ovSet)) return;
   if (ovVisible(el.ovCfm)) { appendMode = true; closeConfirm(); startSelect(); toast('追加模式：选取内容将并入当前剪藏', 'info'); }
   else triggerClipper();
  };
  function triggerClipper() {
   if (selecting) stopSelect();
   refreshSettings();
   cachedIcon = null;
   imgDL = new Map(); imgDLBytes = 0; imgFailTs.clear();
   cachedSend = null;
   appendMode = false;
   const useNotion = isNotionEnabled() && isNotionConfigured();
   const useFeishu = isFeishuEnabled() && isFeishuConfigured();
   const useObsidian = isObsidianEnabled();
   if (!useNotion && !useFeishu && !useObsidian) {
    toast('请先在设置中启用并配置 Notion、飞书 或 Obsidian！', 'error');
    openSettings();
    return;
   }
   startSelect();
  }

  // ===== 网络请求与安全复核 =====
  function gmRequest({ method, url, headers, data, timeout, responseType }) {
   return new Promise((resolve, reject) => {
    // finalUrl 二次复核：缓解 302 重定向穿透与 DNS rebinding，对最终实际访问的 URL 再拦一道；
    let rawIsPrivate = false;
    try { rawIsPrivate = isPrivateURL(url); } catch (e) {   }
    GM_xmlhttpRequest({
     method, url,
     headers: headers || {},
     data: data ?? null,
     timeout: timeout || C.API_TIMEOUT,
     responseType: responseType || '',
     // 原始目标本身即私网（如 Obsidian 本机 API）时豁免复核，否则会确定性拒绝合法请求；
     onload: res => {
      if (!rawIsPrivate && res.finalUrl) {
       try { if (isPrivateURL(res.finalUrl)) { reject(Object.assign(new Error('finalUrl 命中私网，响应已丢弃'))); return; } } catch (e) {   }
      }
      resolve(res);
     },
     onerror: () => reject(Object.assign(new Error('网络错误'), { network: true })),
     ontimeout: () => reject(Object.assign(new Error('请求超时'), { network: true, isTimeout: true })),
    });
   });
  }

  async function apiReqNotion(method, url, data) {
   return withRetry(async (attempt) => {
    const res = await gmRequest({
     method, url,
     headers: { 'Authorization': `Bearer ${S.notionToken}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
     data: data ? JSON.stringify(data) : null,
    });
    if (res.status >= 200 && res.status < 300) {
     const json = tryParseJSON(res.responseText);
     if (json !== null) return json;
     throw Object.assign(new Error('响应解析失败'), { status: res.status });
    }
    const errJson = tryParseJSON(res.responseText);
    const msg = (errJson && errJson.message) || (res.responseText || 'Unknown').substring(0, 200);
    const err = new Error(`API ${res.status}: ${msg}`);
    err.status = res.status;
    err.retryAfter = parseInt(parseResponseHeader(res, 'Retry-After') || '0', 10) || 0;
    throw err;
   }, { retries: C.API_RETRY, retryOn: (err) => (String(method).toUpperCase() === 'GET' || !err.isTimeout) && isRetryableError(err) });
  }

  // ===== 飞书 API 与写入队列 =====
  // 飞书 tenant_access_token 鉴权：生产路径（getFeishuToken，带缓存与提前续期）与连接测试路径
  // （testFeishuConn，用表单值直连）原本各写一遍相同的请求与响应校验，收敛为具名函数。
  // 注意：测试路径此前错误文案少了 statusText 兜底，统一后仅在「接口返回无 msg 字段」时可见差异。
  async function fsAuthToken(appId, appSecret) {
   const res = await gmRequest({
    method: 'POST',
    url: 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    data: JSON.stringify({ app_id: appId, app_secret: appSecret }),
   });
   const json = tryParseJSON(res.responseText);
   if (json === null) throw new Error('飞书鉴权响应解析失败');
   if (res.status < 200 || res.status >= 300 || json.code !== 0)
    throw new Error(`飞书鉴权失败(${json.code ?? res.status}): ${json.msg || res.statusText || ''}`);
   return { token: json.tenant_access_token, expire: json.expire };
  }
  async function getFeishuToken(force) {
   const now = Date.now();
   if (!force && fsTokenCache.token && now < fsTokenCache.expiry) return fsTokenCache.token;
   const { token, expire } = await fsAuthToken(S.fsAppId, S.fsAppSecret);
   fsTokenCache = { token, expiry: now + (((expire | 0) || 7200) - 120) * 1000 };
   return fsTokenCache.token;
  }
  async function apiReqFeishu(method, url, data) {
   return withRetry(async (attempt, lastErr) => {
    const token = await getFeishuToken(!!(lastErr && lastErr.auth));
    const isForm = (typeof FormData !== 'undefined') && data instanceof FormData;
    const res = await gmRequest({
     method, url,
     headers: { 'Authorization': `Bearer ${token}`, ...(isForm ? {} : { 'Content-Type': 'application/json; charset=utf-8' }) },
     data: isForm ? data : (data ? JSON.stringify(data) : null),
     timeout: isForm ? C.FS_UPLOAD_TIMEOUT : C.API_TIMEOUT,
    });
    if (res.status === 401) { const e = new Error('飞书凭证失效(401)'); e.auth = true; throw e; }
    const json = tryParseJSON(res.responseText);
    if (json === null) { const e = new Error(`响应解析失败(HTTP ${res.status})`); e.status = res.status; throw e; }
    if (res.status >= 200 && res.status < 300 && json.code === 0) return json;
    const err = new Error(`HTTP ${res.status} code=${json.code}: ${String(json.msg || '').substring(0, 180)}`);
    err.status = res.status; err.code = json.code;
    if (json.code === 99991661 || json.code === 99991663 || json.code === 99991664) err.auth = true;
    throw err;
   }, { retries: C.API_RETRY, retryOn: (err) => {
    if (err.auth) return true;
    if (err.isTimeout && String(method).toUpperCase() !== 'GET') return false;
    return isRetryableError(err) || err.code === 99991400 || err.code === 99991401;
   } });
  }

  let fsWriteChain = Promise.resolve();
  async function fsWrite(method, url, data) {
   const task = async () => {
    const wait = getProfile().apiGapMs - (Date.now() - fsLastWrite);
    if (wait > 0) await sleep(wait);
    fsLastWrite = Date.now();
    return apiReqFeishu(method, url, data);
   };
   fsWriteChain = fsWriteChain.then(task, task);
   return fsWriteChain;
  }

  // ---------- 图片下载（带 LRU 缓存 + 重试） ----------
  async function fetchImage(url) {
   if (DATA_IMG_RE.test(url)) {
    const d = decodeDataURL(url);
    if (!d) return null;
    d.ct = sniffImageType(d.buf) || 'image/png';
    if (!IMG_EXT[d.ct]) return null;
    return d;
   }
   if (isPrivateURL(url)) {
    console.warn('[NC] 拒绝下载内网图片 URL');
    return null;
   }
   if (imgFailTs.has(url)) {
    if (Date.now() - imgFailTs.get(url) < C.IMG_FAIL_TTL) return null;
    imgFailTs.delete(url);
   }
   if (imgDL.has(url)) {
    const cached = imgDL.get(url);
    imgDL.delete(url); imgDL.set(url, cached);
    return cached;
   }
   const result = await withRetry(async (attempt) => {
    const res = await gmRequest({ method: 'GET', url, responseType: 'arraybuffer', timeout: C.IMG_DL_TIMEOUT });
    if (res.status >= 200 && res.status < 300 && res.response) {
     const buf = res.response;
     if (!buf.byteLength || buf.byteLength > C.IMG_UP_MAX) return null;
     let ct = parseResponseHeader(res, 'content-type').toLowerCase();
     if (!IMG_EXT[ct]) ct = sniffImageType(buf) || '';
     if (!IMG_EXT[ct]) return null;
     return { buf, ct };
    }
    if (res.status === 429 || res.status >= 500) {
     const e = new Error(`HTTP ${res.status}`); e.status = res.status;
     e.retryAfter = parseFloat(parseResponseHeader(res, 'retry-after') || '0') || 0;
     throw e;
    }
    return null;
   }, { retries: C.IMG_DL_RETRY + 1, retryOn: isRetryableError });
   if (!result) {
    imgFailTs.set(url, Date.now());
    while (imgFailTs.size > C.IMG_FAIL_MAX) imgFailTs.delete(imgFailTs.keys().next().value);
    return null;
   }
   const evictOldest = () => {
    const oldest = imgDL.keys().next().value;
    if (oldest === undefined) return false;
    imgDLBytes -= imgDL.get(oldest)?.buf?.byteLength || 0;
    imgDL.delete(oldest);
    return true;
   };
   while (imgDL.size >= C.IMG_DL_CACHE_MAX && evictOldest()) {   }
   while (imgDL.size && imgDLBytes + result.buf.byteLength > C.IMG_DL_CACHE_BYTES && evictOldest()) {   }
   imgDL.set(url, result);
   imgDLBytes += result.buf.byteLength;
   imgFailTs.delete(url);
   return result;
  }

  async function mapLimit(items, limit, fn) {
   const ret = new Array(items.length);
   if (!items.length) return ret;
   let i = 0;
   const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; ret[idx] = await fn(items[idx], idx); }
   });
   await Promise.all(workers);
   return ret;
  }
  async function feishuUploadImage(info, blockId) {
   const attempt = async () => {
    const fd = new FormData();
    fd.append('file_name', info.name);
    fd.append('parent_type', 'docx_image');
    fd.append('parent_node', blockId);
    fd.append('size', String(info.size));
    fd.append('file', info.blob, info.name);
    const json = await fsWrite('POST', 'https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', fd);
    const token = json?.data?.file_token || null;
    if (!token) throw new Error('未返回 file_token');
    return token;
   };
   let lastErr = null;
   for (let i = 0; i <= C.FS_REL_RETRY; i++) {
    if (i > 0) {
     console.warn(`[NC] 飞书图片素材关联校验未就绪（1770013），${C.FS_REL_RETRY_WAIT * i}ms 后第 ${i}/${C.FS_REL_RETRY} 次重试上传`);
     await sleep(C.FS_REL_RETRY_WAIT * i);
    }
    try { return await attempt(); } catch (e) { if (e.code !== 1770013) throw e; lastErr = e; }
   }
   throw lastErr;
  }

  /**
   * 递归插入块树：根级与子级统一走 /blocks/{parentBlockId}/children；
   * 嵌套任务在父块创建成功后以其 block_id 递归插入，失败自动降级为根级追加（内容不丢）；
   * 图片上传/回退均以父块局部索引定位，互不干扰。
   */
  // 与 notionCountChildren 同用途：飞书侧失败时读回文档根级子块数，校正断点续传的批次边界。
  // 仅在根级（parentBlockId === docId）对账——嵌套层的批次索引不参与续传。
  async function fsCountChildren(docId, blockId) {
   let total = 0, token = null;
   for (let guard = 0; guard < 100; guard++) {
    const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${blockId}/children?page_size=500` + (token ? `&page_token=${encodeURIComponent(token)}` : '');
    const res = await fsWrite('GET', url);
    const items = Array.isArray(res?.data?.items) ? res.data.items : [];
    total += items.length;
    if (!res?.data?.has_more || !res?.data?.page_token) break;
    token = res.data.page_token;
   }
   return total;
  }
  async function fsInsertTree(docId, ctx, parentBlockId, onProgress, state, tokenByUrl = new Map(), startBatch = 0) {
   const batches = []; let cur = [], curImg = 0, curStart = 0;
   ctx.out.forEach((b, i) => {
    const isImg = b.block_type === FS_BLK.IMAGE;
    if (cur.length >= C.FS_BATCH || (isImg && curImg >= C.FS_IMG_PER_REQ)) { batches.push({ blocks: cur, start: curStart }); curStart = i; cur = []; curImg = 0; }
    if (isImg) curImg++; cur.push(b);
   });
   if (cur.length) batches.push({ blocks: cur, start: curStart });
   const failed = [];
   let imgFails = 0;
   let rootDegradeAppended = 0; // 嵌套降级为根级追加的块数——不经 batches 计划，断点对账时须扣除
   const batchDenom = Math.max(batches.length, 1);
   for (let bi = startBatch; bi < batches.length; bi++) {
    const batch = batches[bi];
    if (onProgress && parentBlockId === docId) onProgress(10 + Math.round(bi / batchDenom * 60), `飞书块 ${batch.start + 1}/${ctx.out.length}`);
    let res;
    try {
     res = await fsWrite('POST', `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${parentBlockId}/children`, { children: batch.blocks });
    } catch (e) {
     let done = bi;
     if (parentBlockId === docId) {
      try {
       const written0 = await fsCountChildren(docId, docId);
       const written = Math.max(0, written0 - rootDegradeAppended); // 扣除嵌套降级块，否则边界前移导致重试丢块
       let k = startBatch;
       for (; k < batches.length; k++) {
        const b = batches[k];
        if (written >= b.start + b.blocks.length) continue;
        break;
       }
       done = k;
      } catch (e2) { console.warn('[NC] 飞书子块数读回失败，退回按批次起点续传:', e2?.message || e2); }
     }
     e.doneBatches = done; e.totalBatches = batches.length; throw e;
    }
    if (state) state.appendedAny = true;
    const created = res?.data?.children || [];
    for (const job of ctx.jobs) {
     const local = job.index - batch.start;
     if (local < 0 || local >= batch.blocks.length) continue;
     if (local >= created.length) { failed.push({ index: job.index, info: job.info }); continue; }
     const blockId = created[local]?.block_id;
     if (!blockId) { failed.push({ index: job.index, info: job.info }); continue; }
     try {
      if (onProgress) onProgress(70 + Math.round(bi / batchDenom * 15), `上传图片…`);
      let bound = false;
      const cached = tokenByUrl.get(job.info.url);
      if (cached) {
       try {
        await fsWrite('PATCH', `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${blockId}`, { replace_image: { token: cached } });
        bound = true;
       } catch (e) {
        if (e.code !== 1770013) throw e;
        if (tokenByUrl.get(job.info.url) === cached) tokenByUrl.delete(job.info.url);
        console.warn('[NC] 飞书图片素材跨块复用被拒（1770013），改为当前块独立上传:', job.info.name);
       }
      }
      if (!bound) {
       const fileToken = await feishuUploadImage(job.info, blockId);
       tokenByUrl.set(job.info.url, fileToken);
       await fsWrite('PATCH', `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${blockId}`, { replace_image: { token: fileToken } });
      }
     } catch (e) { console.error('[NC] 飞书图片上传失败:', e.message || '未知错误'); failed.push({ index: job.index, info: job.info, blockId }); }
    }
    for (const nj of ctx.nest) {
     const local = nj.index - batch.start;
     if (local < 0 || local >= batch.blocks.length) continue;
     const nestParent = created[local]?.block_id;
     if (!nestParent) continue;
     try {
      const sub = await fsInsertTree(docId, nj.ctx, nestParent, null, state, tokenByUrl);
      imgFails += sub.imgFails;
     } catch (e) {
      console.warn('[NC] 嵌套插入失败，降级为根级追加:', e?.message || e);
      try {
       const sub = await fsInsertTree(docId, nj.ctx, docId, null, state, tokenByUrl);
       imgFails += sub.imgFails;
       rootDegradeAppended += nj.ctx.out.length;
      } catch (e2) {
       // 降级也失败：剥离嵌套运行携带的 doneBatches（相对嵌套批次，误用于根级续传会丢块），
       // 让外层按无断点处理（重试新建文档，不在旧文档上误续传）
       if (e2 && typeof e2 === 'object') delete e2.doneBatches;
       throw e2;
      }
     }
    }
   }
   for (const f of failed.sort((a, b) => b.index - a.index)) {
    if (!f.blockId) continue;
    try {
     await fsWrite('DELETE', `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${parentBlockId}/children/batch_delete`, { start_index: f.index, end_index: f.index + 1 });
     const fbUrl = f.info.url;
     const fbBlock = DATA_IMG_RE.test(fbUrl) ? { block_type: FS_BLK.TEXT, text: { elements: [{ text_run: { content: '🖼️ [内嵌图片上传失败，已略过]' } }] } } : fsLinkPara(`🖼️ 图片: ${fbUrl}`, fbUrl);
     await fsWrite('POST', `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${parentBlockId}/children`, { index: f.index, children: [fbBlock] });
    } catch (e) { console.error('[NC] 飞书图片回退处理失败:', e.message || '未知错误'); }
   }
   imgFails += failed.length;
   return { imgFails };
  }

  // ===== Obsidian 发送 =====
  let obsWriteChain = Promise.resolve();
  const obsWrite = (task) => { obsWriteChain = obsWriteChain.then(task, task); return obsWriteChain; };

  // 三处发送路径（Obsidian / Notion / 飞书）以同一规则定标题，收敛为具名函数；
  // 复制路径与发送历史保持原样——它们对超长标题的处理语义不同，不参与收敛。
  const resolveSendTitle = (t) => t || pageTitle() || 'Untitled';
  const sendTitleOf = (t) => resolveSendTitle(t).substring(0, C.TITLE_MAX);
  function buildMarkdown(sendBlocks, sendTitle, sendTags) {
   const title = sendTitleOf(sendTitle);
   const tags = (sendTags || '').split(',').map(t => t.trim()).filter(Boolean);
   const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
   let fm = '---\n';
   fm += `title: "${esc(title)}"\n`;
   fm += `source: "${safeURL(location.href) || ''}"\n`;
   fm += `date: "${new Date().toISOString()}"\n`;
   if (tags.length) fm += `tags: [${tags.map(t => `"${esc(t)}"`).join(', ')}]\n`;
   fm += '---\n\n';
   return { md: fm + '# ' + title + '\n\n' + blocksToMarkdown(sendBlocks), title };
  }
  async function sendToObsidian(sendBlocks, sendTitle, sendTags, onProgress) {
   if (onProgress) onProgress(10, '正在生成 Markdown…');
   const { md: mdContent, title } = buildMarkdown(sendBlocks, sendTitle, sendTags);
   if (onProgress) onProgress(45, '准备写入 Obsidian…');
   // 逐段校验：encodeURIComponent('..') 仍是 '..'，仅去首尾斜杠挡不住路径穿越
   // （保存路径可经「导入配置」带入，属不可信输入）。合法性处理与 safeTitle 同款。
   const folder = String(S.obsFolder || '').split(/[\\/]+/)
    .map(s => s.trim())
    .filter(s => s && s !== '.' && s !== '..')
    .map(s => s.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, '_$1'))
    .slice(0, 8)
    .join('/');
   const safeTitle = (title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().substring(0, 120).replace(/[\s.]+$/g, '').replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, '_$1')) || 'Untitled';
   const relPath = folder ? `${folder}/${safeTitle}.md` : `${safeTitle}.md`;
   const encodedPath = relPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
   const baseUrl = normalizeObsidianBase(S.obsApiUrl);
   const apiKey = String(S.obsApiKey || '').trim();
   const fileStamp = () => {
    const d = new Date(), p3 = (n) => String(n).padStart(3, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}.${p3(d.getMilliseconds())}`;
   };

   const ensureUniquePath = async () => {
    if (!apiKey) throw new Error('未配置 Obsidian API Key（可在失败弹窗中复制 Markdown）');
    let exists = false;
    try {
     const probe = await gmRequest({ method: 'GET', url: `${baseUrl}/vault/${encodedPath}`, headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 8000 });
     exists = probe.status === 200;
    } catch {   }
    if (!exists) return encodedPath;
    const altRel = relPath.replace(/(\.md)$/i, ` ${fileStamp()}$1`);
    return altRel.split('/').filter(Boolean).map(encodeURIComponent).join('/');
   };

   let lastTargetPath = null;
   const executeWrite = () => withRetry(async () => {
    if (!apiKey) throw new Error('未配置 Obsidian API Key（可在失败弹窗中复制 Markdown）');
    if (lastTargetPath) {
     try {
      const reprobe = await gmRequest({ method: 'GET', url: `${baseUrl}/vault/${lastTargetPath}`, headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 8000 });
      if (reprobe.status === 200) return;
     } catch {   }
    }
    const targetPath = await ensureUniquePath();
    lastTargetPath = targetPath;
    const res = await gmRequest({ method: 'PUT', url: `${baseUrl}/vault/${targetPath}`, headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'text/markdown; charset=utf-8' }, data: mdContent, timeout: 15000 });
    if (res.status >= 200 && res.status < 300) return;
    if (res.status === 401) throw new Error('API Key 无效 (401)');
    if (res.status === 423) { const e = new Error('HTTP 423：笔记正在 Obsidian 中被编辑（文件锁定）'); e.status = res.status; throw e; }
    if (res.status === 500) { const e = new Error('HTTP 500：写入被拒绝（可能是保存路径文件夹不存在）'); e.status = res.status; throw e; }
    throw new Error(`HTTP ${res.status}`);
   }, {
    retries: C.OBS_RETRY,
    retryOn: (err) => err.network || err.status === 423 || err.status === 500,
   });

   if (onProgress) onProgress(65, '正在排队写入…');
   try {
    await obsWrite(async () => { await sleep(C.OBS_WRITE_GAP); return executeWrite(); });
   } catch (err) {
    if (err?.network) throw new Error('Obsidian 写入失败：无法连接 Local REST API（请确认插件已启动，或在弹窗中复制 Markdown）');
    throw new Error('Obsidian 写入失败: ' + (err?.message || '未知'));
   }
   if (onProgress) onProgress(100, 'Obsidian 写入成功');
   return {};
  }

  // ===== Notion 发送 =====
  // Notion 官方负载限制为「任意 block / rich_text 数组 ≤100 元素」且「单请求 ≤1000 块元素、
  // 500KB」（developers.notion.com/reference/request-limits）。原实现只按顶层块 100 个切分，嵌套 children
  // 不计入——嵌套内容多的页面单请求块元素总量可达数千，确定性 validation_error 400，且该阶段失败
  // 不设断点、重试原样复现。改为按「顶层块数 + 嵌套总量 + 估算字节」三重阈值规划分块。
  function notionBlockCount(b) {
   let n = 1;
   const body = b?.[b?.type];
   if (body && Array.isArray(body.children)) for (const c of body.children) n += notionBlockCount(c);
   return n;
  }
  function notionEstBytes(b) {
   let bytes = 600; // 每块 JSON 结构固定开销粗估
   const body = b?.[b?.type];
   const rt = body?.rich_text;
   if (Array.isArray(rt)) for (const t of rt) bytes += ((t?.text?.content || '').length + (t?.text?.link?.url || '').length) * 1.1 + 120;
   const kids = body?.children;
   if (Array.isArray(kids)) for (const c of kids) bytes += notionEstBytes(c);
   return bytes;
  }
  function notionPlanChunks(blks, startIdx = 0) {
   const ranges = [];
   let s = startIdx, count = 0, bytes = 2048;
   for (let i = startIdx; i < blks.length; i++) {
    const w = notionBlockCount(blks[i]), wb = notionEstBytes(blks[i]);
    if (i > s && (count + w > C.NOTION_REQ_BLOCKS_MAX || bytes + wb > C.NOTION_REQ_BYTES_MAX || i - s >= C.BATCH_SIZE)) {
     ranges.push({ start: s, end: i }); s = i; count = 0; bytes = 2048;
    }
    count += w; bytes += wb;
   }
   if (s < blks.length) ranges.push({ start: s, end: blks.length });
   return ranges;
  }
  // 断点续传对账：某一批可能因网络丢响应而「已落库但客户端判定失败」，此时若只按批次起点
  // 记录进度，重试会把同一批原样再写一遍（目标页出现重复段落）。故失败时读回服务端实际子块数，
  // 用真实边界校正续传进度；读回失败时退回原语义，不因对账阻断重试。
  async function notionCountChildren(pageId) {
   let total = 0, cursor = null;
   for (let guard = 0; guard < 100; guard++) {
    const url = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100` + (cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : '');
    const res = await apiReqNotion('GET', url);
    const arr = Array.isArray(res?.results) ? res.results : [];
    total += arr.length;
    if (!res?.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
   }
   return total;
  }
  async function appendChildren(pageId, blks, onProgress, base = 0) {
   const ranges = notionPlanChunks(blks, 0);
   for (let ri = 0; ri < ranges.length; ri++) {
    const { start, end } = ranges[ri];
    try {
     await apiReqNotion('PATCH', `https://api.notion.com/v1/blocks/${pageId}/children`, { children: blks.slice(start, end) });
     if (onProgress) onProgress(base + end, base + blks.length);
    } catch (e) {
     let confirmed = start;
     try {
      const written = await notionCountChildren(pageId);
      confirmed = Math.max(start, Math.min(end, written - base));
     } catch (e2) { console.warn('[NC] Notion 子块数读回失败，退回按批次起点续传:', e2?.message || e2); }
     e.sent = confirmed; throw e;
    }
    if (ri + 1 < ranges.length) await sleep(getProfile().apiGapMs);
   }
  }
  function notionSanitize(blks) {
   const sanitizeList = (arr) => (arr || []).map(b => {
    if (b && b.type === 'image' && DATA_IMG_RE.test(b.image?.external?.url || ''))
     return mkPara('🖼️ [页面内嵌图片(data:)，Notion 不支持，已略过]');
    const body = b?.[b.type];
    if (body && Array.isArray(body.children)) body.children = sanitizeList(body.children);
    return b;
   });
   return sanitizeList(blks);
  }
  const NOTION_URL_PROPS = [
   ['URL', () => safeURL(location.href)],
   ['Content Image', () => safeURL(pageMainImage())],
   ['Icon', () => safeURL(pageIcon())],
  ];
  async function sendToNotion(rawBlocks, sendTitle, sendTags, resume, onProgress) {
   const allBlocks = notionSanitize(structuredClone(rawBlocks));
   if (resume && resume.pageId) {
    lastNotionPageId = resume.pageId;
    const startIdx = resume.sent || 0;
    try {
     await appendChildren(resume.pageId, allBlocks.slice(startIdx), (sent, total) => { if (onProgress) onProgress(10 + Math.round(sent / total * 85), `Notion 块 ${sent}/${total}`); }, startIdx);
    } catch (e) {
     const err = new Error('页面已存在，剩余内容追加失败: ' + (e.message || '未知'));
     err.resume = { pageId: resume.pageId, sent: (resume.sent || 0) + (e.sent || 0) };
     throw err;
    }
    return;
   }
   const dbId = parseDbId(S.notionDbId);
   const title = sendTitleOf(sendTitle);
   const tags = (sendTags || '').split(',').map(t => t.trim()).filter(Boolean);
   const tagsProp = (S.notionTagsProp || 'Tags').trim();
   if (!dbId) throw new Error('Notion Database ID 格式不正确');
   if (onProgress) onProgress(5, '正在查询 Notion 数据库…');
   let props;
   if (notionDbCache.dbId === dbId && notionDbCache.props) props = notionDbCache.props;
   else {
    const dbInfo = await apiReqNotion('GET', `https://api.notion.com/v1/databases/${dbId}`);
    props = dbInfo.properties || {};
    notionDbCache = { dbId, props };
   }
   if (tagsProp && tags.length && !props[tagsProp]) {
    try { await apiReqNotion('PATCH', `https://api.notion.com/v1/databases/${dbId}`, { properties: { [tagsProp]: { multi_select: {} } } }); props[tagsProp] = { type: 'multi_select' }; } catch (e) { console.warn('[NC] 自动创建标签属性失败:', e.message || '未知'); }
   }
   let titleKey = 'Name';
   for (const k in props) if (props[k].type === 'title') { titleKey = k; break; }
   const properties = { [titleKey]: { title: [{ text: { content: title } }] } };
   if (tagsProp && tags.length && props[tagsProp]) {
    const t = props[tagsProp].type;
    if (t === 'select') properties[tagsProp] = { select: { name: tags[0].slice(0, C.TAG_NAME_MAX) } };
    else if (t === 'multi_select') properties[tagsProp] = { multi_select: tags.map(tg => ({ name: tg.slice(0, C.TAG_NAME_MAX) })) };
   }
   for (const [key, getter] of NOTION_URL_PROPS) {
    if (props[key]?.type === 'url') { const val = getter(); if (val) properties[key] = { url: val }; }
   }
   const firstRange = notionPlanChunks(allBlocks, 0)[0];
   const firstBatch = firstRange ? allBlocks.slice(firstRange.start, firstRange.end) : [];
   const payload = { parent: { database_id: dbId }, properties, children: firstBatch };
   const iconUrl = safeURL(pageIcon());
   if (iconUrl && !/\.svg($|\?)/i.test(iconUrl)) payload.icon = { type: 'external', external: { url: iconUrl } };
   if (onProgress) onProgress(10, '正在创建 Notion 页面…');
   const resp = await apiReqNotion('POST', 'https://api.notion.com/v1/pages', payload);
   lastNotionPageId = resp.id;
   if (firstRange && firstRange.end < allBlocks.length) {
    try {
     await appendChildren(resp.id, allBlocks.slice(firstRange.end), (sent, total) => { if (onProgress) onProgress(10 + Math.round(sent / total * 85), `Notion 块 ${sent}/${total}`); }, firstRange.end);
     if (onProgress) onProgress(95, 'Notion 完成');
    } catch (e) {
     const err = new Error('页面已创建，但部分内容追加失败: ' + (e.message || '未知'));
     err.resume = { pageId: resp.id, sent: firstRange.end + (e.sent || 0) };
     throw err;
    }
   }
  }

  // ===== 飞书发送 =====
  async function sendToFeishu(sendBlocks, sendTitle, onProgress, resume) {
   const folderToken = String(S.fsFolder || '').trim();
   const title = sendTitleOf(sendTitle);
   const canResume = !!(resume && typeof resume.docId === 'string' && resume.docId && Number.isInteger(resume.done) && resume.done >= 0);
   const startBatch = canResume ? resume.done : 0;
   let docId;
   if (canResume) {
    docId = resume.docId;
    lastFeishuDocId = docId;
    if (onProgress) onProgress(8, `飞书：复用已建文档，从第 ${startBatch + 1} 批继续…`);
   } else {
    if (onProgress) onProgress(0, '正在创建飞书文档…');
    const createRes = await fsWrite('POST', 'https://open.feishu.cn/open-apis/docx/v1/documents', folderToken ? { title, folder_token: folderToken } : { title });
    docId = createRes?.data?.document?.document_id;
    if (!docId) throw new Error('创建飞书文档失败：未获取到 document_id');
    lastFeishuDocId = docId;
    let docReady = false;
    for (let i = 0; i <= C.FS_INIT_RETRY; i++) {
     await sleep(C.FS_INIT_WAIT);
     try { const check = await fsWrite('GET', `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}`); if (check?.data?.document?.document_id) { docReady = true; break; } } catch {   }
    }
    if (!docReady) throw new Error('飞书文档初始化超时，请重试');
   }
   const imgSet = new Set();
   function collectImgUrls(arr) {
    for (const b of arr) {
     if (!b) continue;
     if (b.type === 'image') { const u = b.image?.external?.url; if (u) imgSet.add(u); }
     const body = b[b.type];
     if (body && Array.isArray(body.children)) collectImgUrls(body.children);
    }
   }
   collectImgUrls(sendBlocks);
   const imgUrls = [...imgSet];
   if (imgUrls.length > C.FS_IMG_WARN) toast(`共 ${imgUrls.length} 张图片，将全部上传（较多时耗时较长）`, 'info');
   const imgInfo = new Map();
   if (imgUrls.length) {
    if (onProgress) onProgress(5, `飞书：正在下载 ${imgUrls.length} 张图片…`);
    const infos = await mapLimit(imgUrls, getProfile().imgConc, async (url, i) => {
     try {
      const bin = await fetchImage(url);
      if (!bin) return null;
      const ext = IMG_EXT[bin.ct];
      if (!ext) return null;
      return { url, blob: new Blob([bin.buf], { type: bin.ct }), size: bin.buf.byteLength, name: `clip_${Date.now()}_${i}.${ext}` };
     } catch (e) {
      console.warn('[NC] 图片下载失败，降级为链接:', url, e?.message || e);
      return null;
     }
    });
    imgUrls.forEach((u, i) => imgInfo.set(u, infos[i] || null));
   }
   const ctx = { out: [], jobs: [], imgInfo, nest: [] };
   const srcUrl = safeURL(location.href);
   if (srcUrl) ctx.out.push(fsLinkPara(`🔗 原文链接: ${srcUrl}`, srcUrl));
   blocksToFeishu(sendBlocks, ctx);
   const state = { appendedAny: false };
   let imgFails = 0;
   try {
    const res = await fsInsertTree(docId, ctx, docId, onProgress, state, new Map(), startBatch);
    imgFails = res.imgFails;
   } catch (e) {
    if (!state.appendedAny && !canResume) {
     try { await fsWrite('POST', `https://open.feishu.cn/open-apis/drive/v1/files/${docId}/trash?type=docx`, {}); lastFeishuDocId = null; }
     catch (e2) { console.warn('[NC] 空文档回收站清理失败:', e2?.message || e2); }
    } else if (typeof e.doneBatches === 'number' && e.doneBatches >= 0) {
     e.resume = { docId, done: e.doneBatches };
     e.message = `文档已创建但部分内容追加失败（已完成 ${e.doneBatches}/${e.totalBatches || '?'} 批，重试将从断点续传）: ${(e.message || '未知').substring(0, 120)}`;
    }
    throw e;
   }
   if (onProgress) onProgress(100, '飞书 完成');
   return { docId, imgFails };
  }

  // ===== 发送编排 =====
  async function sendToAll(sendBlocks, sendTitle, sendTags, onlyPlatforms, notionResume, feishuResume) {
   refreshSettings();
   el.send.disabled = true; el.send.textContent = '发送中...'; el.send.classList.add('is-loading'); showProgress();
   const useNotion = isNotionEnabled() && isNotionConfigured();
   const useFeishu = isFeishuEnabled() && isFeishuConfigured();
   const useObsidian = isObsidianEnabled();
   const shouldNotion = useNotion && (!onlyPlatforms || onlyPlatforms.includes('notion'));
   const shouldFeishu = useFeishu && (!onlyPlatforms || onlyPlatforms.includes('feishu'));
   const shouldObsidian = useObsidian && (!onlyPlatforms || onlyPlatforms.includes('obsidian'));
   let notionOk = false, feishuOk = false, obsidianOk = false;
   let errors = [], failedPlatforms = [], successPlatforms = [], nextNotionResume = null, nextFeishuResume = null;

   const active = [];
   if (shouldNotion) active.push('notion');
   if (shouldFeishu) active.push('feishu');
   if (shouldObsidian) active.push('obsidian');
   const weight = active.length > 0 ? 100 / active.length : 100;

   const progMap = { notion: 0, feishu: 0, obsidian: 0 };
   const mkProgress = (name) => (pct, txt) => {
    progMap[name] = Math.max(progMap[name], Math.min(Math.max(pct | 0, 0), 100));
    const total = active.reduce((s, n) => s + progMap[n], 0);
    updateProgress(total * weight / 100, txt ? `${PLATFORM_LABELS[name] || name} · ${txt}` : undefined);
   };

   const fail = (name, key, err) => { errors.push(`${name}: ${(err?.message || '未知').substring(0, 200)}`); failedPlatforms.push(key); };

   const promises = [];
   const staggerMs = getProfile().staggerMs;
   let platSeq = 0;
   // 错峰红线：platSeq 依启用顺序自增 × staggerMs（Notion→飞书→Obsidian，仅计启用平台），该语义不可变。
   const platformJobs = [
    { enabled: shouldNotion, run: () => sendToNotion(sendBlocks, sendTitle, sendTags, notionResume || null, mkProgress('notion')), onSuccess: () => { notionOk = true; successPlatforms.push(PLATFORM_LABELS.notion); }, onFail: (err) => { if (err?.resume) nextNotionResume = err.resume; fail(PLATFORM_LABELS.notion, 'notion', err); } },
    { enabled: shouldFeishu, run: () => sendToFeishu(sendBlocks, sendTitle, mkProgress('feishu'), feishuResume || null), onSuccess: ({ docId, imgFails }) => { feishuOk = true; lastFeishuDocId = docId; successPlatforms.push(imgFails ? `${PLATFORM_LABELS.feishu}（${imgFails} 张图片回退）` : PLATFORM_LABELS.feishu); }, onFail: (err) => { if (err?.resume) nextFeishuResume = err.resume; fail(PLATFORM_LABELS.feishu, 'feishu', err); } },
    { enabled: shouldObsidian, run: () => sendToObsidian(sendBlocks, sendTitle, sendTags, mkProgress('obsidian')), onSuccess: () => { obsidianOk = true; successPlatforms.push(PLATFORM_LABELS.obsidian); }, onFail: (err) => fail(PLATFORM_LABELS.obsidian, 'obsidian', err) },
   ];
   for (const job of platformJobs) {
    if (!job.enabled) continue;
    const delay = (platSeq++) * staggerMs;
    promises.push(sleep(delay).then(job.run).then(job.onSuccess).catch(job.onFail));
   }

   if (!promises.length) { el.send.disabled = false; el.send.textContent = '发送'; el.send.classList.remove('is-loading'); hideProgress(); toast('没有可发送的平台', 'error'); return; }
   // 复位必须走 finally：此前复位语句在直线路径上，一旦中途抛错就会留下
   // 「sending 恒 true（beforeunload 永久拦截离页）+ 发送按钮恒 disabled」的卡死态。
   try {
    sending = true;
    await Promise.all(promises);

    const allSuccess = accSuccess.concat(successPlatforms);
    accSuccess = allSuccess;
    if (allSuccess.length > 0) recordSendHistory(sendTitle, allSuccess);

    if (errors.length > 0) {
     cachedSend = { blocks: sendBlocks, title: sendTitle, tags: sendTags, failedPlatforms, notionResume: nextNotionResume, feishuResume: nextFeishuResume };
     closeConfirm();
     // 走 class 而非内联色：内联色不随暗色主题切换，且 #e65100 在白底仅 3.79:1（不达 WCAG AA）
     if (allSuccess.length > 0) { el.errTitle.textContent = '⚠️ 部分发送失败'; el.errTitle.classList.add('is-warn'); el.errSucc.textContent = `✅ 已成功: ${allSuccess.join(', ')}`; el.errSucc.style.display = ''; }
     else { el.errTitle.textContent = '❌ 发送失败'; el.errTitle.classList.remove('is-warn'); el.errSucc.style.display = 'none'; }
     el.errDetail.textContent = errors.join('\n\n'); el.errMd.style.display = failedPlatforms.length ? '' : 'none'; el.ovErr.style.display = 'flex';
     el.retry.focus();
    } else {
     cachedSend = null; closeConfirm(); el.ovOk.style.display = 'flex';
     el.okOpenNotion.style.display = (notionOk || allSuccess.includes('Notion')) ? '' : 'none';
     el.okOpenFeishu.style.display = (feishuOk || allSuccess.some(s => s.startsWith('飞书'))) ? '' : 'none';
     el.okOpenObsidian.style.display = (obsidianOk || allSuccess.includes('Obsidian')) ? '' : 'none';
     el.okMsg.textContent = `已成功保存到 ${allSuccess.join(', ')}`;
     clearTimeout(okAutoCloseTimer);
     okAutoCloseTimer = setTimeout(() => { el.ovOk.style.display = 'none'; stopOkCountdown(); }, OK_AUTO_CLOSE_MS);
     startOkCountdown(OK_AUTO_CLOSE_MS / 1000);
     el.okClose.focus();
    }
   } finally {
    sending = false;
    el.send.disabled = false; el.send.textContent = '发送'; el.send.classList.remove('is-loading'); hideProgress();
   }
  }
  const doSend = () => {
   if (sending || el.send.disabled) return;
   const sendBlocks = blocks.slice();
   const sendTitle = resolveSendTitle(el.title.value);
   const sendTags = el.tags.value || '';
   GM_setValue(STORAGE.LAST_TAGS, sendTags);
   accSuccess = [];
   sendToAll(sendBlocks, sendTitle, sendTags, null, null, null)
    .catch((err) => { console.error('[NC] 发送流程异常:', err); toast('发送流程异常: ' + (err?.message || '未知'), 'error'); });
  };
  function doRetry() {
   if (!cachedSend) { toast('没有可重试的内容', 'error'); return; }
   const retryLabel = el.retry.textContent;
   el.retry.disabled = true; el.retry.textContent = '发送中...'; el.retry.classList.add('is-loading'); el.ovErr.style.display = 'none';
   el.title.value = cachedSend.title || pageTitle() || 'Untitled'; el.tags.value = cachedSend.tags || '';
   restoreConfirmModal();
   showProgress();
   openConfirm();
   sendToAll(cachedSend.blocks, cachedSend.title, cachedSend.tags, cachedSend.failedPlatforms, cachedSend.notionResume || null, cachedSend.feishuResume || null)
    .catch((err) => { console.error('[NC] 重试流程异常:', err); toast('发送流程异常: ' + (err?.message || '未知'), 'error'); })
    .finally(() => { el.retry.disabled = false; el.retry.textContent = retryLabel; el.retry.classList.remove('is-loading'); });
  }

  // ===== 密码可见性切换 =====
  function createPasswordToggle(input, button) {
   return () => {
    const show = input.type !== 'text';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? '🙈' : '👁️';
   };
  }
  el.tokTglNotion.addEventListener('click', createPasswordToggle(el.tok, el.tokTglNotion), { signal });
  el.tokTglFeishu.addEventListener('click', createPasswordToggle(el.fsSecret, el.tokTglFeishu), { signal });
  el.tokTglObsidian.addEventListener('click', createPasswordToggle(el.obsApiKey, el.tokTglObsidian), { signal });

  // ===== 连接测试 =====
  async function runConnTest(btn, fn, opts = {}) {
   if (btn.disabled) return false;
   btn.disabled = true; const orig = btn.textContent; btn.textContent = '⏳ 测试中';
   try { const msg = await fn(); if (!opts.silent) toast('✅ ' + msg, 'success'); return true; }
   catch (e) { if (!opts.silent) toast('❌ ' + (e?.message || '测试失败'), 'error'); return false; }
   finally { btn.disabled = false; btn.textContent = orig; }
  }
  function testNotionConn() {
   const token = el.tok.value.trim();
   const dbId = parseDbId(el.db.value.trim());
   if (!token) return Promise.reject(new Error('请先填写 Notion Integration Token'));
   if (!dbId) return Promise.reject(new Error('Notion Database ID 格式不正确（应包含 32 位字符）'));
   return withRetry(async () => {
    const res = await gmRequest({ method: 'GET', url: `https://api.notion.com/v1/databases/${dbId}`, headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' } });
    if (res.status >= 200 && res.status < 300) {
     const info = tryParseJSON(res.responseText);
     if (info) notionDbCache = { dbId, props: info.properties || {} };
     const dbName = (info?.title || []).map(t => t.plain_text || '').join('');
     return `Notion 连接成功${dbName ? '：' + dbName : ''}`;
    }
    if (res.status === 401) throw new Error('Token 无效或已过期 (401)');
    if (res.status === 404) throw new Error('数据库不存在，或未在数据库 Connections 中添加该 Integration (404)');
    if (res.status === 429 || res.status >= 500) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    throw new Error(`HTTP ${res.status}: ${(res.responseText || '').substring(0, 120)}`);
   }, { retries: 2, retryOn: isRetryableError });
  }
  async function testFeishuConn() {
   const appId = el.fsAppId.value.trim();
   const secret = el.fsSecret.value.trim();
   const folder = el.fsFolder.value.trim();
   if (!appId || !secret) throw new Error('请先填写飞书 App ID 与 App Secret');
   const { token } = await fsAuthToken(appId, secret);
   const createRes = await gmRequest({ method: 'POST', url: 'https://open.feishu.cn/open-apis/docx/v1/documents', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' }, data: JSON.stringify(folder ? { title: '连接测试', folder_token: folder } : { title: '连接测试' }) });
   const createJson = tryParseJSON(createRes.responseText);
   const docId = createJson?.data?.document?.document_id;
   if (!(createRes.status >= 200 && createRes.status < 300 && createJson?.code === 0 && docId))
    throw new Error(`文档创建失败(${createJson?.code ?? createRes.status}): ${String(createJson?.msg || createRes.statusText || '').substring(0, 120)}${folder ? '（请检查文件夹 Token 与应用云文档权限）' : '（请检查应用云文档权限）'}`);
   let cleaned = true;
   try {
    const trashRes = await gmRequest({ method: 'POST', url: `https://open.feishu.cn/open-apis/drive/v1/files/${docId}/trash?type=docx`, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' }, data: '{}' });
    if (trashRes.status < 200 || trashRes.status >= 300) cleaned = false;
   } catch { cleaned = false; }
   return `飞书连接成功（${folder ? '文件夹可写' : '文档权限正常'}${cleaned ? '' : '；测试文档清理失败，请手动删除'}）`;
  }
  async function testObsidianConn() {
   const apiKey = el.obsApiKey.value.trim();
   if (!apiKey) throw new Error('请先填写 Obsidian API Key');
   const baseUrl = normalizeObsidianBase(el.obsApiUrl.value);
   let res;
   try { res = await gmRequest({ method: 'GET', url: `${baseUrl}/vault/`, headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 8000 }); }
   catch (e) {
    if (e?.network) throw new Error('无法连接 Local REST API — 请确认插件已启动、端口正确，且地址在脚本 @connect 白名单内');
    throw e;
   }
   if (res.status >= 200 && res.status < 300) return 'Obsidian Local REST API 连接成功';
   if (res.status === 401) throw new Error('API Key 无效 (401)');
   throw new Error(`HTTP ${res.status} — 请确认 Local REST API 插件版本与端口`);
  }
  el.testNotion.addEventListener('click', () => runConnTest(el.testNotion, testNotionConn), { signal });
  el.testFeishu.addEventListener('click', () => runConnTest(el.testFeishu, testFeishuConn), { signal });
  el.testObsidian.addEventListener('click', () => runConnTest(el.testObsidian, testObsidianConn), { signal });
  el.testAll.addEventListener('click', async () => {
   if (el.testAll.disabled) return;
   el.testAll.disabled = true; const orig = el.testAll.textContent; el.testAll.textContent = '⏳ 巡检中';
   try {
    const jobs = [
     { label: PLATFORM_LABELS.notion, ready: !!(el.tok.value.trim() && parseDbId(el.db.value.trim())), run: () => runConnTest(el.testNotion, testNotionConn, { silent: true }) },
     { label: PLATFORM_LABELS.feishu, ready: !!(el.fsAppId.value.trim() && el.fsSecret.value.trim()), run: () => runConnTest(el.testFeishu, testFeishuConn, { silent: true }) },
     { label: PLATFORM_LABELS.obsidian, ready: !!el.obsApiKey.value.trim(), run: () => runConnTest(el.testObsidian, testObsidianConn, { silent: true }) },
    ];
    const okList = [], failList = [], skipList = [];
    for (const j of jobs) {
     if (!j.ready) { skipList.push(j.label); continue; }
     (await j.run() ? okList : failList).push(j.label);
    }
    if (!okList.length && !failList.length && !skipList.length) { toast('没有可测试的平台，请先填写凭证', 'error'); return; }
    const parts = [];
    if (okList.length) parts.push(`✅ ${okList.join('、')}`);
    if (failList.length) parts.push(`❌ ${failList.join('、')}`);
    if (skipList.length) parts.push(`⏭ 未配置跳过：${skipList.join('、')}`);
    toast(parts.join('　'), failList.length ? 'error' : 'success');
   } finally { el.testAll.disabled = false; el.testAll.textContent = orig; }
  }, { signal });

  // ===== 事件绑定 =====
  const closeSettings = () => {
   el.ovSet.style.display = 'none'; restoreFocus();
   // 关闭后指示灯/角标回落为已落盘状态（放弃的修改不应继续显示为生效）
   syncSectionState();
   // 设置里改过平台开关后回到仍打开的确认面板，徽章需按新配置重绘
   if (el.ovCfm && el.ovCfm.style.display === 'flex') renderPlatBadges();
  };
  $('#btn-sc').addEventListener('click', () => { tryCloseSettings().then((ok) => { if (ok) closeSettings(); }); }, { signal });
  $('#btn-ss').addEventListener('click', async () => {
   const notionToken = el.tok.value.trim(); const dbRaw = el.db.value.trim(); const notionDbId = parseDbId(dbRaw);
   if (notionToken && dbRaw && !notionDbId) { toast('Notion Database ID / 链接格式不正确（应包含 32 位字符）', 'error'); return; }
   const obsUrlToSave = el.obsApiUrl.value.trim();
   if (obsUrlToSave && !isLocalishTarget(obsUrlToSave)) {
    if (!(await askConfirm({
     title: '保存外部 API 地址？',
     message: 'Obsidian API 地址指向外部主机，启用后每次剪藏都会把页面全文发送到该地址。',
     okText: '确定保存', cancelText: '取消', danger: true,
    }))) return;
   }
   GM_setValue(STORAGE.ENABLE_NOTION, el.ckNotion.checked); GM_setValue(STORAGE.ENABLE_FEISHU, el.ckFeishu.checked);
   GM_setValue(STORAGE.ENABLE_OBSIDIAN, el.ckObsidian.checked);
   for (const f of FORM_FIELDS) GM_setValue(f.key, f.save ? f.save(f.input.value) : f.input.value.trim());
   GM_setValue(STORAGE.SEND_PROFILE, el.sendProfile.value === 'standard' ? 'standard' : 'gentle');
   refreshSettings();
   applyTheme(el.theme.value);
   syncSectionState();
   notionDbCache = { dbId: '', props: null };
   settingsDirty = false; if (el.dirtyFlag) el.dirtyFlag.style.display = 'none'; closeSettings(); toast('✅ 保存成功！');
  }, { signal });
  el.back.addEventListener('click', () => { closeConfirm(); blocks = []; hlTarget = null; imgDL = new Map(); imgDLBytes = 0; imgFailTs.clear(); startSelect(); }, { signal });
  el.btnAdd.addEventListener('click', () => { appendMode = true; closeConfirm(); startSelect(); }, { signal });
  $('#btn-cc').addEventListener('click', closeConfirm, { signal });
  el.send.addEventListener('click', doSend, { signal });
  el.btnCopy.addEventListener('click', (e) => { e.stopPropagation(); copyText(textFromBlocks(blocks), '📋 已复制到剪贴板'); }, { signal });
  // 确认弹窗「复制 Markdown」，与失败弹窗的 Markdown 复制能力对齐；两处共用同一生成/复制/报错流程
  const copyBlocksMd = (bks, title, tags) => {
   try { const { md } = buildMarkdown(bks, title, tags); copyText(md, '📋 已复制 Markdown 到剪贴板'); }
   catch (err) { toast('生成 Markdown 失败: ' + (err?.message || '未知'), 'error'); }
  };
  el.btnCopyMd.addEventListener('click', (e) => {
   e.stopPropagation();
   copyBlocksMd(blocks, resolveSendTitle(el.title.value), el.tags.value || '');
  }, { signal });
  el.btnMin.addEventListener('click', (e) => { e.stopPropagation(); const isMin = el.modalCfm.classList.toggle('minimized'); el.btnMin.textContent = isMin ? '🔼' : '🔽'; el.btnMin.title = isMin ? '还原' : '最小化'; confirmOpen = !isMin; }, { signal });
  el.okOpenNotion.addEventListener('click', () => { if (!lastNotionPageId) return; openTab(`https://www.notion.so/${lastNotionPageId.replace(/-/g, '')}`); }, { signal });
  el.okOpenFeishu.addEventListener('click', () => { if (!lastFeishuDocId) { openTab('https://www.feishu.cn/'); return; } openTab(`https://www.feishu.cn/docx/${lastFeishuDocId}`); }, { signal });
  el.okOpenObsidian.addEventListener('click', () => { const a = document.createElement('a'); a.href = 'obsidian://'; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove(); }, { signal });
  el.okClose.addEventListener('click', () => { clearTimeout(okAutoCloseTimer); stopOkCountdown(); el.ovOk.style.display = 'none'; cachedSend = null; }, { signal });
  el.retry.addEventListener('click', doRetry, { signal });
  el.errCopy.addEventListener('click', () => { copyText(el.errDetail.textContent || '', '已复制错误详情'); }, { signal });
  el.errMd.addEventListener('click', () => {
   if (!cachedSend) { toast('没有可复制的内容', 'error'); return; }
   copyBlocksMd(cachedSend.blocks, resolveSendTitle(cachedSend.title), cachedSend.tags || '');
  }, { signal });
  el.errClose.addEventListener('click', () => { el.ovErr.style.display = 'none'; cachedSend = null; }, { signal });
  // ===== 全局快捷键与生命周期 =====
  function onGlobalKey(e) {
   // closed Shadow DOM 下 document.activeElement 经重定向恒为本脚本宿主 DIV，输入框聚焦判定优先读 shadow.activeElement
   const active = shadow.activeElement || document.activeElement;
   if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
   if (e.altKey && e.shiftKey && e.code === 'KeyN') {
    if (e.repeat) { e.preventDefault(); return; }
    e.preventDefault(); e.stopPropagation();
    startPickFlow();
   }
  }
  // 确认弹窗存在未发送内容时（含最小化停放）离开页面同样警告，防剪藏草稿静默丢失
  window.addEventListener('beforeunload', (e) => { if (sending || (blocks.length && el.ovCfm.style.display === 'flex')) { e.preventDefault(); e.returnValue = ''; } }, { signal });
  window.addEventListener('pagehide', (e) => { if (e.persisted) return; if (window.__ncCleanup) window.__ncCleanup(); }, { signal });
  document.addEventListener('keydown', onGlobalKey, { signal, capture: true });
  // ===== 初始化收尾 =====
  applyTheme(S.theme);                 // 主题：auto 时不挂属性，交由 CSS 媒体查询跟随系统
  switchTab(GM_getValue(STORAGE.SET_TAB, SET_TABS[0]) || SET_TABS[0]);
  syncSectionState();                  // 顺带初始化悬浮球角标
  loadPos();
 }

 // ===== 脚本入口 =====
 try {
  if (document.body) ncInit();
  else document.addEventListener('DOMContentLoaded', () => { try { ncInit(); } catch (err) { console.error('[Notion & Feishu & Obsidian Web Clipper] 初始化失败:', err.message || '未知错误'); } }, { once: true });
 } catch (err) {
  console.error('[Notion & Feishu & Obsidian Web Clipper] 初始化失败:', err.message || '未知错误');
 }
})();
