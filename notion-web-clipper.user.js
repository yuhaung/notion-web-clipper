// ==UserScript==
// @name Notion & Feishu & Obsidian Web Clipper
// @namespace https://github.com/yuhaung/notion-web-clipper
// @version      5.7.1
// @description 悬停高亮 + 单击选取，保存至 Notion、飞书文档、Obsidian。v5.7.1：修复 Ctrl+Enter 连按重入导致整份内容向各平台双发（键盘路径此前无任何状态守卫）；修复 IPv6 内网地址（如 [::1]）绕过 SSRF 防护——WHATWG URL 的 hostname 含方括号，原 IPv6 正则全部漏配；Twitter 会话提取增规模护栏（60 条上限 + 单推节点上限），新增 Alt+单击仅剪藏当前推文；平台未配置时不再残留选取模式；失败弹窗「复制 Markdown」扩展至任意平台失败场景；坏图增 30 秒负缓存；Obsidian 写入重试幂等化（防超时歧义下换名双写）；@connect 补充 csdnimg/juejin/sspai/126.net 图床；防御性加固（win.opener 包裹 try、预览递归补传深度、Notion 页面图标跳过 SVG、响应头正则缓存）。v5.7.0：新增「发送节奏」档位（默认温和：三平台错峰启动 700ms、图片下载并发降为 2、API 写入间隔放宽至 550ms，显著降低瞬时并发以规避平台接口限流）；修复 window.open 带 noopener 恒返回 null 导致「弹窗被阻止」误报；Obsidian 未配置 API Key 时不再默认尝试发送（此前每次剪藏必附带一次注定失败的上传）；深层嵌套 DETAILS/列表递归增加深度护栏防栈溢出；Markdown front matter 补反斜杠与换行转义。v5.6.0：选取模式新增 ↑/↓ 调整选取范围（父子元素间切换，对齐官方 Clipper 体验）；设置面板新增「禁用站点」黑名单（命中则本脚本不启用）与「域名默认标签」（按站点自动预填标签，含子域匹配）。v5.5.0：修复确认弹窗 keydown 监听随剪藏次数累积泄漏、重试后快捷键失效、PRE/TABLE 悬停被外层容器抢占选取；复制/Markdown 补齐表格与折叠块内容并转义 URL 空格括号；推文正文剔除操作栏计数；图片缓存增总字节上限、去除上传双层重试叠加。新增「➕ 追加」多次选取合并、发送中防误关页面、进度条单调推进、重试保留已成功平台入口。
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
// @license MIT
// ==/UserScript==

(function () {
 'use strict';
 if (window.self !== window.top) return;

 // ---- 单实例清理：重复注入时先卸载旧实例 ----
 if (typeof window.__ncCleanup === 'function') { try { window.__ncCleanup(); } catch { /* 旧实例已失效 */ } }
 const _cleanupFns = [];
 window.__ncCleanup = () => { for (const fn of _cleanupFns) { try { fn(); } catch { /* 清理失败不致命 */ } } _cleanupFns.length = 0; };

 // ============================================================
 // 常量
 // ============================================================
 const C = Object.freeze({
  TEXT_SAFE: 1990, RT_ITEMS_MAX: 100, BATCH_SIZE: 100,
  TABLE_MAX_COLS: 5, TABLE_MAX_ROWS: 100, TAG_NAME_MAX: 100, URL_MAX: 2000,
  API_RETRY: 3, API_TIMEOUT: 30000, TITLE_MAX: 200, BTN_SIZE: 50,
  VISIBLE_PART: 25, SNAP_THRESHOLD: 30, LARGE_IMG_RATIO: 0.8, DRAG_CLICK_PX: 4,
  IMG_CHECK_MS: 250, TOAST_MS: 3000, TOAST_MAX: 3, WALK_DEPTH_MAX: 60,
  BLOCKS_WARN: 500, FS_BATCH: 50, FS_IMG_PER_REQ: 20,
  FS_UPLOAD_TIMEOUT: 60000, FS_INIT_WAIT: 500, FS_INIT_RETRY: 2,
  IMG_DL_TIMEOUT: 20000, IMG_DL_RETRY: 2,
  IMG_UP_MAX: 15 * 1024 * 1024, IMG_DL_CACHE_MAX: 50, IMG_DL_CACHE_BYTES: 50 * 1024 * 1024, FS_BLOCK_DEPTH_MAX: 40,
  CLONE_NODE_MAX: 5000, PREVIEW_DEPTH_MAX: 30, OBS_WRITE_GAP: 300, OBS_RETRY: 3,
  TW_CONV_MAX: 60, IMG_FAIL_TTL: 30000, // v5.7.1：Twitter 会话护栏 / 坏图负缓存 TTL
 });

 // v5.7.0：发送节奏档位——gentle（默认）降低瞬时并发与请求频率，规避平台接口限流；
 // standard 为较快节奏（错峰 300ms · 下载并发 3 · 写入间隔 350ms）。staggerMs=平台错峰启动间隔；imgConc=图片下载并发；apiGapMs=Notion/飞书写入最小间隔
 const SEND_PROFILES = Object.freeze({
  gentle: Object.freeze({ staggerMs: 700, imgConc: 2, apiGapMs: 550 }),
  standard: Object.freeze({ staggerMs: 300, imgConc: 3, apiGapMs: 350 }),
 });
 const getProfile = () => SEND_PROFILES[S.sendProfile] || SEND_PROFILES.gentle;

 const STORAGE = Object.freeze({
  ENABLE_NOTION: 'enable_notion', ENABLE_FEISHU: 'enable_feishu', TOKEN: 'notion_token',
  DB_ID: 'notion_db_id', TAGS_PROP: 'notion_tags_prop', FS_APP_ID: 'feishu_app_id',
  FS_APP_SECRET: 'feishu_app_secret', FS_FOLDER: 'feishu_folder', BTN_LEFT: 'nc_btn_left',
  BTN_TOP: 'nc_btn_top', BTN_HIDDEN: 'nc_btn_hidden', BTN_EDGE: 'nc_btn_edge',
  ENABLE_OBSIDIAN: 'enable_obsidian',
  OBSIDIAN_API_URL: 'obsidian_api_url', OBSIDIAN_API_KEY: 'obsidian_api_key',
  OBSIDIAN_FOLDER: 'obsidian_folder',
  LAST_TAGS: 'nc_last_tags',
  BLOCKLIST: 'nc_blocklist', // v5.6.0：用户自定义禁用站点（逗号/换行分隔）
  DOMAIN_TAGS: 'nc_domain_tags', // v5.6.0：域名默认标签（每行一条 域名=标签1,标签2）
  SEND_PROFILE: 'nc_send_profile', // v5.7.0：发送节奏档位 gentle|standard
});

 const FS_BLK = Object.freeze({ TEXT: 2, H1: 3, H2: 4, H3: 5, H4: 6, H5: 7, H6: 8, H7: 9, H8: 10, H9: 11, BULLET: 12, ORDERED: 13, CODE: 14, QUOTE: 15, DIVIDER: 22, IMAGE: 27 });
 // 可挂到父块下构成嵌套的飞书块类型（标题在部分 API 场景不可缩进，保守拍平）
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
 const IMG_EXT = Object.freeze({ 'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/bmp':'bmp','image/tiff':'tif','image/svg+xml':'svg','image/x-icon':'ico','image/vnd.microsoft.icon':'ico','image/heic':'heic','image/heif':'heif' });
 const SENSITIVE_DOMAINS = [/bank\./i,/-bank\./i,/\.bank\./i,/mail\./i,/outlook\./i,/gmail\./i,/\.mail\./i,/^pay\./i,/alipay\./i,/tenpay\./i,/paypal\./i,/^passport\./i,/^account\./i,/^auth\./i,/^login\./i,/^admin\./i,/^console\./i,/^manage\./i,/^dashboard\./i,/^localhost$/i,/^127\./,/^10\./,/^192\.168\./,/^172\.(1[6-9]|2\d|3[01])\./,/^169\.254\./,/^::1$/,/^fe80:/i,/^fc00:/i,/^fd00:/i];

 // ============================================================
 // 共享工具函数（模块级，无 DOM 依赖）
 // ============================================================
 const sleep = (ms) => new Promise(r => setTimeout(r, ms));

 /** 安全解析 JSON：解析失败返回 null（供多处响应解析复用，消除重复 try/catch） */
 function tryParseJSON(text) {
  try { return JSON.parse(text); } catch { return null; }
 }

 /** 从 GM_xmlhttpRequest 的 responseHeaders 字符串中提取指定响应头的值（不区分大小写） */
 const _hdrReCache = new Map(); // v5.7.1：按 header 名缓存编译结果，避免每次响应重复编译正则
 function parseResponseHeader(res, name) {
  const headers = String(res?.responseHeaders || '');
  let re = _hdrReCache.get(name);
  if (!re) { re = new RegExp(`${name}\\s*:\\s*([^\\r\\n;]+)`, 'i'); _hdrReCache.set(name, re); }
  const m = headers.match(re);
  return m ? m[1].trim() : '';
 }

 /** 通用可重试错误判定：网络错误 / 429 限流 / 5xx 服务端错误（各处重试逻辑的统一子集） */
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
  const total = Math.max(1, retries); // 防御 retries<=0 时循环体不执行却 throw lastErr(null)
  let lastErr = null;
  for (let attempt = 0; attempt < total; attempt++) {
   try { return await fn(attempt, lastErr); }
   catch (err) {
    lastErr = err;
    const retryable = retryOn ? retryOn(err, attempt) : isRetryableError(err);
    if (attempt < total - 1 && retryable) {
     const retryAfter = (err?.retryAfter || 0) * 1000;
     const backoff = baseDelay * (1 << attempt); // 2^attempt 指数退避
     const jitter = 0.75 + Math.random() * 0.5; // 抖动 0.75~1.25，避免多平台重试同步“惊群”
     await sleep(Math.max(retryAfter, backoff) * jitter);
     continue;
    }
    throw err;
   }
  }
  throw lastErr;
 }

 function isSensitiveHost(hostname) { const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, ''); for (const re of SENSITIVE_DOMAINS) if (re.test(h)) return true; return false; } // v5.7.1：剥 IPv6 方括号（WHATWG URL 的 hostname 形如 [::1]，原 ^::1$ 等正则全部漏配）

 // v5.6.0：用户自定义禁用站点匹配——条目支持 example.com（含任意子域）与 *.example.com（仅子域）
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

 // v5.6.0：域名默认标签匹配——每行「域名=标签1,标签2」，当前站点命中（含子域）即返回其标签串
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

 // 合并后的内网/元数据 IP 判定（IPv4 + IPv6 + 云元数据端点）
 const PRIVATE_IPV4_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.1[89]\.)/;
 const PRIVATE_IPV6_RE = /^(::1$|fe80:|fc00:|fd00:)/i;
 function isPrivateURL(urlStr) {
  try {
   const u = new URL(urlStr); const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase(); // v5.7.1：剥 IPv6 方括号，否则 PRIVATE_IPV6_RE 全部漏配（SSRF 防护失效）
   if (h === 'localhost' || h.endsWith('.localhost')) return true;
   if (PRIVATE_IPV4_RE.test(h)) {
    if (/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.test(h)) { const p = h.split('.').map(Number); if (p[0] === 255) return true; }
    return true;
   }
   if (PRIVATE_IPV6_RE.test(h)) return true;
   if (h === '169.254.169.254' || h === 'metadata.google.internal') return true;
   return false;
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
  return normURL(s) || safeURL(s);
 }
 function parseDbId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.replace(/-/g, '').match(/[a-f0-9]{32}/i);
  return m ? m[0] : '';
 }

 // ============================================================
 // 图片类型嗅探：表驱动签名匹配（替代长串 if-else）
 // ============================================================
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
  // SVG / XML 文本头
  if (b.length >= 5) {
   const head = String.fromCharCode(...Array.from(b.slice(0, 5))).toLowerCase();
   if (head.startsWith('<svg ') || head.startsWith('<?xml') || head.startsWith('<svg>')) return 'image/svg+xml';
  }
  // HEIC / HEIF ftyp box
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
   const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
   if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'heim') return 'image/heic';
   if (brand === 'heif' || brand === 'mif1' || brand === 'msf1') return 'image/heif';
  }
  return null;
 }

 function decodeDataURL(url) {
  // v5.2.0 修复：此前误引用 m[2]（正则仅一个捕获组），导致 b64 恒为 undefined 抛 TypeError
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

 // ============================================================
 // 设置快照：发送流程中一次性读取所有 GM_getValue，避免反复存储访问
 // v5.2.0：升级为模块级快照 S + refreshSettings()，所有热路径共享同一份
 // ============================================================
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
   blocklist: GM_getValue(STORAGE.BLOCKLIST, ''), // v5.6.0
   domainTags: GM_getValue(STORAGE.DOMAIN_TAGS, ''), // v5.6.0
   sendProfile: GM_getValue(STORAGE.SEND_PROFILE, 'gentle'), // v5.7.0：默认温和档（降低并发）
  };
}
 let S = readSettings();
 const refreshSettings = () => { S = readSettings(); };

 // ============================================================
 // 主初始化
 // ============================================================
 function ncInit() {
  if (isSensitiveHost(location.hostname)) return;
  // v5.6.0：用户自定义黑名单——命中则本站点不启用（设置保存后刷新页面生效）
  if (isUserBlocked(location.hostname, S.blocklist)) return;

  // 重复注入时移除旧 host
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

  // v5.2.0：优先 og:title 作为剪藏标题（避免站点在 document.title 追加营销后缀）
  const pageTitle = () => {
   const og = document.querySelector('meta[property="og:title"]')?.content?.trim();
   return og || document.title || '';
  };

  // ---------- 样式 ----------
  const style = document.createElement('style');
  style.textContent = `
:host{all:initial;--c-bg:#fff;--c-text:#333;--c-text-sec:#555;--c-border:#ddd;--c-input-bg:#fff;--c-bg-sec:#f0f0f0;--c-pv-bg:#fafafa;--c-pv-text:#333;--c-pv-border:#eee;--c-code-bg:#f0f0f0;--c-th-bg:#e8e8e8;--c-td-border:#ccc;--c-btn-sec-bg:#f0f0f0;--c-btn-sec-text:#333;--c-btn-ghost-bg:#fff;--c-btn-ghost-text:#2383e2;--c-btn-ghost-border:#2383e2;--c-help:#888;--c-kbd-bg:#f0f0f0;--c-kbd-border:#ccc;--c-progress-bg:#eee;--c-err-bg:#fff5f5;--c-err-border:#ffcdd2;--c-err-text:#d32f2f;--c-err-succ-bg:#f1f8e9;--c-err-succ-border:#c8e6c9;--c-err-succ-text:#2d7d46;--c-accent:#2383e2;--c-accent-hover:#1b6ec2}
*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.nc-btn{position:fixed;width:${C.BTN_SIZE}px;height:${C.BTN_SIZE}px;border-radius:50%;background:var(--c-accent);color:#fff;border:2px solid #fff;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);font-size:24px;display:flex;align-items:center;justify-content:center;transition:left .25s ease,top .25s ease,opacity .2s ease;user-select:none;touch-action:none;pointer-events:auto;left:auto;right:20px;top:auto;bottom:20px;will-change:left,top}
.nc-btn:hover{background:var(--c-accent-hover)}
.nc-btn.edge{opacity:.5}
.nc-tip{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;padding:10px 20px;border-radius:24px;font-size:14px;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.2);display:none;z-index:1;max-width:90vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nc-hl{position:fixed;top:0;left:0;width:0;height:0;border:3px solid var(--c-accent);background:rgba(35,131,226,.08);pointer-events:none;display:none;will-change:transform}
.nc-mask{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;display:none;cursor:crosshair;pointer-events:auto}
.nc-ov{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;pointer-events:auto}
.nc-ov.nc-ov-tr{background:transparent;align-items:flex-start;justify-content:flex-end;pointer-events:none;padding:20px}
.nc-ov.nc-ov-tr .nc-modal{pointer-events:auto;width:420px;max-width:calc(100vw - 40px);max-height:calc(100vh - 40px);box-shadow:0 8px 32px rgba(0,0,0,.15),0 2px 8px rgba(0,0,0,.08);animation:nc-slide-in .25s ease}
.nc-ov.nc-ov-tr .nc-modal.minimized{width:auto}
@keyframes nc-slide-in{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
.nc-modal{background:var(--c-bg);padding:24px;border-radius:12px;width:580px;max-width:92vw;max-height:88vh;overflow-y:auto;box-shadow:0 10px 25px rgba(0,0,0,.2);display:flex;flex-direction:column;gap:12px;color:var(--c-text)}
.nc-modal h2{font-size:18px;color:var(--c-text)}
.nc-modal-h2{display:flex;align-items:center;justify-content:space-between}
.nc-min{background:none;border:none;cursor:pointer;font-size:16px;color:#666;padding:2px 8px;line-height:1;border-radius:4px;transition:background .15s,color .15s}
.nc-min:hover{background:var(--c-bg-sec);color:var(--c-accent)}
.nc-modal.minimized{padding:12px 24px;gap:0;max-height:none;overflow:visible}
.nc-modal.minimized h2 ~ *{display:none !important}
.nc-modal h3{font-size:15px;color:var(--c-text-sec);margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--c-border);padding-bottom:4px}
.nc-modal label{font-size:13px;color:var(--c-text-sec);font-weight:600;margin-top:4px}
.nc-modal input,.nc-modal select,.nc-modal textarea{width:100%;padding:10px;border:1px solid var(--c-border);border-radius:6px;font-size:14px;background:var(--c-input-bg);color:var(--c-text)}
.nc-modal textarea{resize:vertical;min-height:56px;line-height:1.5;font-family:inherit}
.nc-row{display:flex;gap:10px;justify-content:flex-end;margin-top:12px;align-items:center}
.nc-b{padding:9px 18px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;transition:filter .15s,transform .1s;white-space:nowrap}
.nc-b:active{transform:scale(.97)}
.nc-b1{background:var(--c-accent);color:#fff}.nc-b1:hover{filter:brightness(0.9)}
.nc-b1:disabled{filter:brightness(1.2);cursor:not-allowed}
.nc-b2{background:var(--c-btn-sec-bg);color:var(--c-btn-sec-text)}.nc-b2:hover{filter:brightness(0.95)}
.nc-bk{background:var(--c-btn-ghost-bg);color:var(--c-btn-ghost-text);border:1.5px solid var(--c-btn-ghost-border)}.nc-bk:hover{filter:brightness(0.95)}
.nc-br{background:#d32f2f;color:#fff}.nc-br:hover{background:#b71c1c}
.nc-br:disabled{filter:brightness(1.2);cursor:not-allowed}
.nc-help{font-size:12px;color:var(--c-help);margin-top:-6px;line-height:1.4}
.nc-help a{color:var(--c-accent)}
.nc-tw{position:relative;display:flex;align-items:center}
.nc-tw input{flex:1;padding-right:40px}
.nc-tv{position:absolute;right:8px;background:none;border:none;cursor:pointer;font-size:16px;color:#666;padding:4px}
.nc-switch{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--c-text-sec);font-weight:400;cursor:pointer;white-space:nowrap}
.nc-switch input{width:auto;accent-color:var(--c-accent)}
.nc-pv{border:1px solid var(--c-pv-border);border-radius:8px;padding:12px;margin-top:8px;max-height:250px;overflow-y:auto;background:var(--c-pv-bg);font-size:13px;line-height:1.6;user-select:text;-webkit-user-select:text;outline:none}
.nc-pv img{max-width:100%;max-height:150px;display:block;margin:8px 0;border-radius:4px}
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
.nc-mp{color:var(--c-accent);font-weight:600;margin:8px 0;background:rgba(35,131,226,.1);padding:6px 10px;border-radius:4px}
.nc-pi{position:relative;margin:2px 0}
.nc-pd{position:absolute;top:2px;right:2px;width:20px;height:20px;background:#ff3b30;color:#fff;border:none;border-radius:50%;font-size:12px;line-height:20px;text-align:center;cursor:pointer;opacity:0;transition:opacity .15s;z-index:2;pointer-events:auto}
.nc-pi:hover .nc-pd{opacity:1}
.nc-ok{font-size:15px;color:#2d7d46;font-weight:600;text-align:center;margin:8px 0}
.nc-err{font-size:13px;color:var(--c-err-text);background:var(--c-err-bg);border:1px solid var(--c-err-border);border-radius:8px;padding:12px;margin:8px 0;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;line-height:1.5}
.nc-err-succ{font-size:13px;color:var(--c-err-succ-text);background:var(--c-err-succ-bg);border:1px solid var(--c-err-succ-border);border-radius:8px;padding:10px;margin:4px 0;line-height:1.5}
.nc-tc{position:fixed;top:20px;right:20px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.nc-t{padding:12px 20px;border-radius:6px;color:#fff;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.15);pointer-events:auto;animation:nc-in .3s ease;display:flex;align-items:center;gap:8px;max-width:300px;word-break:break-word}
.nc-ts{background:#2d7d46}.nc-te{background:#d32f2f}.nc-ti{background:#e65100}
.nc-info{font-size:12px;color:var(--c-help);text-align:right;margin-top:-8px}
.nc-progress{margin-top:8px;height:6px;background:var(--c-progress-bg);border-radius:3px;overflow:hidden;display:none}
.nc-progress-bar{height:100%;background:var(--c-accent);border-radius:3px;transition:width .3s ease;width:0}
.nc-shortcuts{font-size:12px;color:var(--c-help);margin-top:4px;line-height:1.6}
.nc-shortcuts kbd{background:var(--c-kbd-bg);border:1px solid var(--c-kbd-border);border-radius:3px;padding:1px 5px;font-size:11px;font-family:monospace}
.nc-dirty{font-size:12px;color:#e65100;margin-top:4px;display:none}
.nc-h3r{display:flex;align-items:center;gap:6px}
.nc-tb{padding:3px 10px;font-size:12px;border:1px solid var(--c-btn-ghost-border);background:var(--c-btn-ghost-bg);color:var(--c-btn-ghost-text);border-radius:4px;cursor:pointer;font-weight:600;transition:filter .15s}
.nc-tb:hover{filter:brightness(.95)}
.nc-tb:disabled{opacity:.6;cursor:wait}
@keyframes nc-in{from{opacity:0;transform:translateX(50px)}to{opacity:1;transform:translateX(0)}}
@media (prefers-color-scheme: dark) {
 :host{--c-bg:#1e1e1e;--c-text:#e0e0e0;--c-text-sec:#bbb;--c-border:#444;--c-input-bg:#2a2a2a;--c-bg-sec:#333;--c-pv-bg:#2a2a2a;--c-pv-text:#ddd;--c-pv-border:#444;--c-code-bg:#333;--c-th-bg:#383838;--c-td-border:#555;--c-btn-sec-bg:#333;--c-btn-sec-text:#e0e0e0;--c-btn-ghost-bg:#1e1e1e;--c-btn-ghost-text:#5b9fe6;--c-btn-ghost-border:#5b9fe6;--c-kbd-bg:#333;--c-kbd-border:#555;--c-progress-bg:#444;--c-err-bg:#3a1a1a;--c-err-border:#5c2828;--c-err-text:#ff6b6b;--c-err-succ-bg:#1a3a1a;--c-err-succ-border:#2d5c2d;--c-err-succ-text:#6bdf6b;--c-accent:#5b9fe6;--c-accent-hover:#4a8ed5}
}`;
  shadow.appendChild(style);

  // ---------- UI 模板 ----------
  const ui = document.createElement('div');
  ui.innerHTML = `
<button class="nc-btn" title="左键选取 / 右键设置 / Alt+Shift+N">✂️</button>
<div class="nc-tip">🔍 悬停高亮元素，单击提取内容 (Esc取消)</div>
<div class="nc-mask"></div><div class="nc-hl"></div>
<div class="nc-ov" id="ov-set"><div class="nc-modal">
 <h2>⚙️ Notion / 飞书 / Obsidian 配置</h2>
 <label>🚫 禁用站点（逗号分隔，命中则本脚本不启用）</label><input type="text" id="in-blocklist" placeholder="example.com, *.example.org" autocomplete="off">
 <div class="nc-help">支持 example.com（含子域）与 *.example.com（仅子域）。保存后刷新页面生效。</div>
 <label>🚦 发送节奏</label><select id="in-send-profile"><option value="gentle">温和 · 降低并发（推荐，规避平台接口限流）</option><option value="standard">标准 · 更快</option></select>
 <div class="nc-help">温和档：三平台错峰启动 700ms · 图片下载并发 2 · API 写入间隔 550ms；标准档：300ms / 3 / 350ms。</div>
 <h3><span>📕 Notion</span><span class="nc-h3r"><label class="nc-switch"><input type="checkbox" id="ck-notion"> 启用</label><button class="nc-tb" id="btn-test-notion" title="验证 Token 与数据库连通性（读取当前表单值，无需先保存）">🔌 测试</button></span></h3>
 <label>Integration Token</label><div class="nc-tw"><input type="password" id="in-tok" placeholder="secret_... 或 ntn_..." autocomplete="new-password"><button class="nc-tv nc-tv-notion" title="显示/隐藏">👁️</button></div>
 <label>Database ID</label><input type="text" id="in-db" placeholder="32 位 ID 或数据库链接" autocomplete="off">
 <div class="nc-help">⚠️ 必须在 Notion 数据库 Connections 中添加 Integration。</div>
 <label>标签属性名 (可选)</label><input type="text" id="in-tag" placeholder="Tags" autocomplete="off">
 <h3 style="margin-top:15px;"><span>🪁 飞书</span><span class="nc-h3r"><label class="nc-switch"><input type="checkbox" id="ck-feishu"> 启用</label><button class="nc-tb" id="btn-test-feishu" title="验证凭证 + 创建/回收测试文档（读取当前表单值）">🔌 测试</button></span></h3>
 <label>App ID</label><input type="text" id="in-fs-appid" placeholder="App ID" autocomplete="off">
 <label>App Secret</label><div class="nc-tw"><input type="password" id="in-fs-secret" placeholder="App Secret" autocomplete="new-password"><button class="nc-tv nc-tv-fs" title="显示/隐藏">👁️</button></div>
 <label>文件夹 Token</label><input type="text" id="in-fs-folder" placeholder="Folder Token" autocomplete="off">
 <div class="nc-help">⚠️ Token 明文存储于本地，请勿在公共电脑保存。</div>
 <h3 style="margin-top:15px;"><span>💎 Obsidian</span><span class="nc-h3r"><label class="nc-switch"><input type="checkbox" id="ck-obsidian"> 启用</label><button class="nc-tb" id="btn-test-obsidian" title="探测 Local REST API 连通性与 API Key（读取当前表单值）">🔌 测试</button></span></h3>
 <label>API Base URL</label><input type="text" id="in-obs-api-url" placeholder="http://127.0.0.1:27123" autocomplete="off">
 <label>API Key</label><div class="nc-tw"><input type="password" id="in-obs-api-key" placeholder="Local REST API 插件中获取" autocomplete="new-password"><button class="nc-tv nc-tv-obs" title="显示/隐藏">👁️</button></div>
 <label>保存路径</label><input type="text" id="in-obs-folder" placeholder="例如: Clippings" autocomplete="off">
 <div class="nc-help">💡 需安装 <b>Local REST API</b> 插件并启用 HTTP 端口(27123)。<br>💡 写入采用串行队列 + 自动重试；失败后可在弹窗中一键复制 Markdown 或重试。</div>
 <h3 style="margin-top:15px;"><span>🏷️ 域名默认标签</span></h3>
 <textarea id="in-domain-tags" rows="3" placeholder="每行一条：域名=标签1,标签2&#10;zhihu.com=阅读,知乎&#10;github.com=代码"></textarea>
 <div class="nc-help">发送前按当前站点域名（含子域）自动预填标签；手动输入优先于自动预填。</div>
 <div class="nc-shortcuts"><strong>快捷键</strong><br>🖱️ 左键拖拽 · 右键设置 · Alt+Shift+N 选取<br>⌨️ Esc 取消 · ↑/↓ 调整选取范围 · Ctrl+Enter 发送 · Ctrl+A 全选</div>
 <div class="nc-dirty" id="dirty-flag">⚠️ 有未保存的更改</div>
 <div class="nc-row"><button class="nc-b nc-b2" id="btn-sc">关闭</button><button class="nc-b nc-b1" id="btn-ss">保存设置</button></div>
</div></div>
<div class="nc-ov nc-ov-tr" id="ov-cfm"><div class="nc-modal" id="modal-cfm">
 <h2 class="nc-modal-h2"><span>✂️ 确认发送</span><button class="nc-min" id="btn-min" title="最小化">🔽</button></h2>
 <label>页面标题</label><input type="text" id="in-title" autocomplete="off">
 <label>内容预览</label><div class="nc-pv" id="pv" tabindex="0"></div><div class="nc-info" id="pv-count"></div>
 <div class="nc-progress" id="pg"><div class="nc-progress-bar" id="pg-bar"></div></div><div class="nc-info" id="pg-text" style="display:none"></div>
 <label>标签 (逗号分隔)</label><input type="text" id="in-tags" placeholder="阅读, 技术" autocomplete="off">
 <div class="nc-row"><button class="nc-b nc-bk" id="btn-back">↩ 重选</button><button class="nc-b nc-b2" id="btn-add" title="返回页面继续选取，追加到当前内容末尾">➕ 追加</button><button class="nc-b nc-b2" id="btn-copy">📋 复制</button><span style="flex:1"></span><button class="nc-b nc-b2" id="btn-cc">取消</button><button class="nc-b nc-b1" id="btn-cs">发送</button></div>
</div></div>
<div class="nc-ov nc-ov-tr" id="ov-ok"><div class="nc-modal" style="text-align:center;gap:16px">
 <h2>✅ 发送完成！</h2><p class="nc-ok" id="ok-msg"></p>
 <div class="nc-row" style="justify-content:center;flex-wrap:wrap"><button class="nc-b nc-b1" id="btn-oo-notion" style="display:none">打开 Notion</button><button class="nc-b nc-bk" id="btn-oo-feishu" style="display:none;background:#fff;color:#3370ff;border:1.5px solid #3370ff">打开飞书</button><button class="nc-b nc-bk" id="btn-oo-obsidian" style="display:none;background:#fff;color:#7c3aed;border:1.5px solid #7c3aed">打开 Obsidian</button><button class="nc-b nc-b2" id="btn-oc">关闭</button></div>
</div></div>
<div class="nc-ov nc-ov-tr" id="ov-err"><div class="nc-modal" style="text-align:center;gap:12px">
 <h2 id="err-title" style="color:#d32f2f">❌ 发送失败</h2><div class="nc-err-succ" id="err-succ" style="display:none"></div><div class="nc-err" id="err-detail"></div>
 <div class="nc-row" style="justify-content:center;flex-wrap:wrap"><button class="nc-b nc-br" id="btn-retry">🔄 重试</button><button class="nc-b nc-b2" id="btn-err-md" style="display:none">📋 复制 Markdown</button><button class="nc-b nc-b2" id="btn-err-copy">📋 复制错误</button><button class="nc-b nc-b2" id="btn-err-close">关闭</button></div>
</div></div>
<div class="nc-tc" id="tc"></div>`;
  shadow.appendChild(ui);

  // ---------- 元素引用 ----------
  const el = {
   btn: $('.nc-btn'), tip: $('.nc-tip'), mask: $('.nc-mask'), hl: $('.nc-hl'),
   ovSet: $('#ov-set'), ovCfm: $('#ov-cfm'), ovOk: $('#ov-ok'), ovErr: $('#ov-err'),
   pv: $('#pv'), pvCount: $('#pv-count'), errTitle: $('#err-title'), errDetail: $('#err-detail'),
   errSucc: $('#err-succ'), modalCfm: $('#modal-cfm'), btnMin: $('#btn-min'), ckNotion: $('#ck-notion'),
   ckFeishu: $('#ck-feishu'), tok: $('#in-tok'), db: $('#in-db'), tag: $('#in-tag'), tags: $('#in-tags'),
   fsAppId: $('#in-fs-appid'), fsSecret: $('#in-fs-secret'), fsFolder: $('#in-fs-folder'), title: $('#in-title'),
   okMsg: $('#ok-msg'), send: $('#btn-cs'), btnCopy: $('#btn-copy'), back: $('#btn-back'), btnAdd: $('#btn-add'),
   okOpenNotion: $('#btn-oo-notion'), okOpenFeishu: $('#btn-oo-feishu'), okOpenObsidian: $('#btn-oo-obsidian'), okClose: $('#btn-oc'),
   tokTglNotion: $('.nc-tv-notion'), tokTglFeishu: $('.nc-tv-fs'), tokTglObs: $('.nc-tv-obs'), toast: $('#tc'), retry: $('#btn-retry'),
   errCopy: $('#btn-err-copy'), errClose: $('#btn-err-close'), pg: $('#pg'), pgBar: $('#pg-bar'),
   pgText: $('#pg-text'), dirtyFlag: $('#dirty-flag'),
   ckObsidian: $('#ck-obsidian'), obsApiUrl: $('#in-obs-api-url'),
   obsApiKey: $('#in-obs-api-key'), obsFolder: $('#in-obs-folder'),
   testNotion: $('#btn-test-notion'), testFeishu: $('#btn-test-feishu'), testObs: $('#btn-test-obsidian'),
   errMd: $('#btn-err-md'),
   blocklist: $('#in-blocklist'), domainTags: $('#in-domain-tags'), sendProfile: $('#in-send-profile'),
  };

  // ---------- 运行时状态 ----------
  let selecting = false, confirmOpen = false, blocks = [], hlTarget = null;
  let dragging = false, dragSX = 0, dragSY = 0, dragIL = 0, dragIT = 0, dragDist = 0;
  let hidden = false, hiddenEdge = '', hiddenForImg = false, cachedIcon = null, rafId = null, imgCheckTs = 0;
  let hoverTimer = null, okAutoCloseTimer = null, lastNotionPageId = null, lastFeishuDocId = null;
  let cachedSend = null, fsTokenCache = { token: '', expiry: 0 }, fsLastWrite = 0, imgDL = new Map(), imgDLBytes = 0;
  const imgFailTs = new Map(); // v5.7.1：坏图负缓存（url → 失败时间戳），避免追加选取场景对同一坏图反复走超时×重试
  let settingsDirty = false, settingsListenersAttached = false;
  // v5.5.0：modeAc 为「选取/确认弹窗」模式级信号——每次进入模式重建、退出即 abort，
  // 根治此前 startSelect/showConfirm 每次重复挂载 keydown/scroll 监听且从不移除的泄漏
  let modeAc = null, appendMode = false;
  // v5.6.0：选取粒度调节——selCands 为「当前目标 + 合格块级祖先」候选链，↑ 扩大 / ↓ 缩小
  let selCands = [], selIdx = 0, selAnchor = null;
  let accSuccess = []; // v5.5.0：跨重试累计的成功平台（重试仅补发失败项，成功信息需保留）
  let sending = false; // v5.5.0：发送中标记（配合 beforeunload 防误关页面）
  let notionDbCache = { dbId: '', props: null }; // v5.2.0：数据库 schema 会话级缓存，省去每次发送一次 GET

  const isOwn = (node) => { let n = node; while (n) { if (n === host) return true; n = n.parentNode || n.host; } return false; };

  // ---------- Toast / 剪贴板 ----------
  function toast(msg, type = 'success', ms) {
   while (el.toast.children.length >= C.TOAST_MAX) el.toast.firstChild.remove();
   const t = document.createElement('div');
   t.className = `nc-t ${type === 'error' ? 'nc-te' : type === 'info' ? 'nc-ti' : 'nc-ts'}`;
   t.textContent = msg;
   el.toast.appendChild(t);
   // v5.3.0：错误类提示延长停留（6s），给长错误信息留阅读时间
   setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms || (type === 'error' ? 6000 : C.TOAST_MS));
  }
  function copyText(text, successMsg = '已复制') {
   if (!text) { toast('没有可复制的内容', 'error'); return; }
   try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text); toast(successMsg); return; } } catch { /* GM_API 不可用 */ }
   if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(successMsg), () => toast('复制失败', 'error'));
   else toast('当前环境不支持剪贴板操作', 'error');
  }

  // ---------- 平台启用/配置判定（v5.2.0：统一读快照 S） ----------
  const isNotionConfigured = () => !!(S.notionToken && S.notionDbId);
  const isFeishuConfigured = () => !!(S.fsAppId && S.fsAppSecret);
  // v5.7.0 修复：此前恒为 true → 未配置 API Key 的用户每次发送都会附带一次注定失败的
  // Obsidian 上传（Local REST API 必须鉴权）。现以「已填 API Key」作为配置完成判据；
  // 手动勾选「启用」仍可覆盖默认判定，行为与 Notion/飞书 的 enabled-默认逻辑对齐。
  const isObsidianConfigured = () => !!String(S.obsApiKey || '').trim();
  const getPlatformEnabled = (v, configured) => (v === null || v === undefined) ? configured : !!v;
  const isNotionEnabled = () => getPlatformEnabled(S.enableNotion, isNotionConfigured());
  const isFeishuEnabled = () => getPlatformEnabled(S.enableFeishu, isFeishuConfigured());
  const isObsidianEnabled = () => getPlatformEnabled(S.enableObsidian, isObsidianConfigured());

  // ---------- 进度条 ----------
  const showProgress = () => { el.pg.style.display = ''; el.pgBar.style.width = '0'; el.pgText.style.display = 'none'; };
  const updateProgress = (pct, text) => { el.pgBar.style.width = Math.min(Math.max(pct | 0, 0), 100) + '%'; if (text) { el.pgText.style.display = ''; el.pgText.textContent = text; } };
  const hideProgress = () => { el.pg.style.display = 'none'; el.pgBar.style.width = '0'; el.pgText.style.display = 'none'; };

  // ============================================================
  // Notion 块构造
  // ============================================================
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
  /**
   * v5.2.0 修复：超长富文本不再截断（此前 >1990 字符直接截断丢内容），
   * 改为分片——首片携带链接/样式，后续片为纯文本，与 toRich 语义对齐。
   */
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
  /**
   * v5.2.0：data: 内嵌图片不再在提取期降级为占位段落（原设计“发送时分平台路由”
   * 从未生效）。现在保留为图片块，由发送阶段分流：飞书实际上传、Notion 递归略过、
   * Obsidian 跳过，预览面板可直接显示。
   */
  function mkMedia(type, rawUrl) {
   const raw = String(rawUrl || '');
   if (type === 'image' && DATA_IMG_RE.test(raw)) return { object: 'block', type: 'image', image: { type: 'external', external: { url: raw } } };
   const url = safeURL(raw);
   if (!url) return null;
   if (type === 'image') return { object: 'block', type: 'image', image: { type: 'external', external: { url } } };
   if (type === 'video') return { object: 'block', type: 'video', video: { type: 'external', external: { url } } };
   return { object: 'block', type: 'embed', embed: { url } };
  }
  /**
   * v5.2.0：表格超宽不再静默丢列——超过 TABLE_MAX_COLS 的列合并进末列；
   * 单元格改用 toRich 分片，超长内容不再截断。
   */
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

  // ============================================================
  // 页面内容提取
  // ============================================================
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
   const combined = [typeof img.className === 'string' ? img.className : '', img.src || '', img.getAttribute('data-src') || '', img.alt || '', img.title || ''].join(' ').toLowerCase();
   if (/member|vip|盐选|pay|lock/.test(combined)) return true;
   let p = img.parentElement;
   for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
    if (/member|vip|pay|lock|盐选/.test((typeof p.className === 'string' ? p.className : '').toLowerCase())) return true;
   }
   return false;
  }
  function videoSrc(v) {
   if (!v) return null;
   const d = normURL(v.src) || safeURL(v.src);
   if (d) return d;
   for (const s of v.querySelectorAll('source')) { const u = normURL(s.src) || safeURL(s.src); if (u) return u; }
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

  // ============================================================
  // 块解析
  // ============================================================
  function parseBlocks(fragment, depth = 0) {
   if (depth > C.WALK_DEPTH_MAX) return []; // v5.7.0：DETAILS 嵌套递归的深度护栏（此前绕过 WALK_DEPTH_MAX，病态嵌套可致栈溢出）
   let result = [], frags = [];
   function innerText(node) { // v5.7.1：原 fastText + 别名 const innerText = fastText 合并为单一函数名，消除一跳间接
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName;
    if (tag === 'IMG' || tag === 'VIDEO' || tag === 'IFRAME') return '';
    if (tag === 'BR') return '\n';
    if (INLINE_TAGS.has(tag) || tag === 'A') {
     const parts = [];
     for (const c of node.childNodes) parts.push(innerText(c));
     return parts.join('');
    }
    const parts = [];
    for (const c of node.childNodes) parts.push(innerText(c));
    let s = parts.join('');
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
   function fragsToRT(list) {
    const rt = [];
    const bufArr = [];
    const flushBuf = () => { if (bufArr.length) { rt.push({ type: 'text', text: { content: bufArr.join('') } }); bufArr.length = 0; } };
    for (const f of list) {
     if (!f || !f.text) continue;
     if (!f.link && !f.annot) { bufArr.push(f.text); continue; }
     flushBuf();
     const node = { type: 'text', text: { content: f.text } };
     const u = safeURL(f.link);
     if (u) node.text.link = { url: u };
     if (f.annot) node.annotations = f.annot;
     rt.push(node);
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
   const flush = () => { const rt = takeRich(); if (rt.length && hasText(rt)) result.push(mkBlockRT('paragraph', rt)); };
   function listItemBlock(li, ordered, allowKids, hoist, depth = 0) {
    // v5.7.0：列表结构嵌套过深（li→ul→li… 无限递归链）时降级为纯文本项，防栈溢出
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
     else if (b.type === 'paragraph') { const t = rtStr(b.paragraph.rich_text).trim(); if (t) rt = rt.concat([{ type: 'text', text: { content: (hasText(rt) ? '\n' : '') + t } }]); }
     else hoist.push(b);
    }
    for (const nl of nestedLists) {
     if (allowKids) {
      for (const sub of nl.children) {
       if (sub.tagName !== 'LI') continue;
       kids.push(listItemBlock(sub, nl.tagName === 'OL', false, kids, depth + 1)); // v5.7.0：结构递归传递深度
      }
     } else {
      const t = innerText(nl).trim();
      if (t) rt = rt.concat([{ type: 'text', text: { content: (hasText(rt) ? '\n' : '') + t } }]);
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
      const frag = document.createDocumentFragment();
      frag.appendChild(c.cloneNode(true));
      children.push(...parseBlocks(frag, depth + 1)); // v5.7.0：向嵌套 DETAILS 传递深度
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
    if (tag === 'VIDEO') { flush(); const b = mkMedia('video', videoSrc(node)); if (b) result.push(b); return; }
    if (tag === 'IFRAME') { flush(); const b = mkMedia('embed', normURL(node.src) || safeURL(node.src)); if (b) result.push(b); return; }
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
     const item = listItemBlock(node, node.parentElement?.tagName === 'OL', true, hoist, depth); // v5.7.0：传入当前深度
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
    if (tag === 'DIV' && node.querySelector('pre') && !node.querySelector('p,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,details,article,section')) {
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
     if (b.type === 'paragraph') return (b.paragraph?.rich_text || []).some(t => (t.text?.content || '').trim());
     return true;
    })
    .map(b => {
     const body = b[b.type];
     if (body && Array.isArray(body.children)) body.children = stripDeep(body.children);
     return b;
    });
  }

  // ============================================================
  // 知乎
  // ============================================================
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
   // v5.3.4 修复：问题详情页标题以页面顶部 .QuestionHeader-title（h1）为准，
   // 不再从回答卡片内兜底 h2（此前会误取回答正文的二级标题作为“问题标题”）
   if (location.pathname.includes('/question/')) {
    for (const sel of ['.QuestionHeader-title', 'h1.QuestionHeader-title', '.QuestionHeader h1', '.QuestionHeader-content h1']) {
     const h = document.querySelector(sel);
     if (h) { const t = q(h.textContent); if (ok(t)) return t; }
    }
   }
   // 列表/搜索页：从卡片容器内取标题（去掉宽泛 h2 兜底）
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
  const ZH_COMMENT_ITEM = '.CommentItemV2, .CommentItem';
  const ZH_REPLY_ITEM = '.ReplyItem';
  const ZH_COMMENT_BOX = '.CommentsV2, .CommentListV2, .Comments-container, [class*="CommentList"]';
  const ZH_COMMENT_REMOVE = [
   '[class*="VoteButton"]', 'button[aria-label*="赞"]', 'button[aria-label*="回复"]', '[class*="CommentItemV2-meta"]', '[class*="CommentItem-meta"]',
   '[class*="CommentItemV2-footer"]', '[class*="CommentItem-footer"]', '[class*="ReplyItem-footer"]', '[class*="MoreButton"]', '[class*="more-button"]',
   '[class*="toolbar"]', '[class*="Toolbar"]', '.CommentItemV2-avatar', '.CommentItem-avatar', '[class*="CommentAvatar"]', '[class*="comment-avatar"]',
   '[class*="authorInfo"]', '[class*="AuthorInfo"]',
  ].join(',');
  function zhCommentAuthor(item) {
   const a = item.querySelector('a[href*="/people/"]');
   if (!a) return { name: '', url: null };
   return { name: a.textContent.trim().replace(/\s+/g, ' '), url: safeURL(a.href) };
  }
  function zhCommentMeta(item) {
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
  function zhCommentReplyTo(item) {
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
  function zhCommentContentBlocks(item, skipNestedReplies) {
   const sels = ['.CommentItemV2-content', '.CommentContent', '[class*="CommentContent"]', '.ReplyItem-content', '.RichText'];
   let contentEl = null;
   for (const sel of sels) {
    const candidates = item.querySelectorAll(sel);
    for (const c of candidates) {
     if (skipNestedReplies && c.closest(ZH_REPLY_ITEM) && !item.matches(ZH_REPLY_ITEM)) continue;
     if ((c.textContent || '').trim() || c.querySelector('img')) { contentEl = c; break; }
    }
    if (contentEl) break;
   }
   if (!contentEl) contentEl = item;
   const clone = contentEl.cloneNode(true);
   if (skipNestedReplies) clone.querySelectorAll(ZH_REPLY_ITEM).forEach(n => n.remove());
   clone.querySelectorAll(ZH_COMMENT_REMOVE).forEach(n => n.remove());
   removeAvatarImgs(clone);
   const frag = document.createDocumentFragment();
   frag.appendChild(clone);
   return parseBlocks(frag);
  }
  function zhCommentBullet(item, isReply) {
   const { name, url } = zhCommentAuthor(item);
   const bodyBlocks = zhCommentContentBlocks(item, !isReply);
   const hasBody = bodyBlocks.some(b => {
    if (b.type === 'paragraph') return (b.paragraph?.rich_text || []).some(t => (t.text?.content || '').trim());
    return true;
   });
   if (!hasBody && !name) return null;
   const headerRT = [];
   if (name) {
    const nameNode = { type: 'text', text: { content: name }, annotations: { bold: true } };
    if (url) nameNode.text.link = { url };
    headerRT.push(nameNode);
   }
   if (isReply) {
    const to = zhCommentReplyTo(item);
    if (to) headerRT.push({ type: 'text', text: { content: ' 回复 ' + to } });
   }
   if (!isReply) {
    const meta = zhCommentMeta(item);
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
    for (const r of item.querySelectorAll(ZH_REPLY_ITEM)) {
     const rb = zhCommentBullet(r, true);
     if (rb) kids.push(rb);
    }
   }
   const cleanKids = stripDeep(kids).slice(0, C.BATCH_SIZE);
   if (cleanKids.length) blk.bulleted_list_item.children = cleanKids;
   return blk;
  }
  function zhihuComments(root) {
   let items = [];
   const singleReply = root.matches(ZH_REPLY_ITEM);
   if (singleReply || root.matches(ZH_COMMENT_ITEM)) items = [root];
   else items = [...root.querySelectorAll(ZH_COMMENT_ITEM)].filter(elm => !elm.parentElement?.closest(ZH_COMMENT_ITEM));
   const bullets = [];
   for (const it of items) {
    const b = zhCommentBullet(it, singleReply);
    if (b) bullets.push(b);
   }
   if (!bullets.length) return [];
   const out = [ mkH(3, bullets.length === 1 ? '💬 知乎评论' : `💬 评论区（${bullets.length} 条）`) ];
   const srcUrl = safeURL(location.href);
   if (srcUrl) out.push(mkRichPara([{ type: 'text', text: { content: '🔗 原文链接', link: { url: srcUrl } } }]));
   out.push(...bullets);
   return out;
  }

  // ============================================================
  // X / Twitter
  // ============================================================
  const upgradeTwImg = (u) => u ? u.replace(/([?&])name=(small|medium|large|360x360|900x900)\b/i, '$1name=orig') : u;
  function twMediaBlocks(tweet) {
   const out = [], seen = new Set();
   const pushImg = (raw) => {
    const url = upgradeTwImg(normURL(raw) || safeURL(raw));
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
     const u = normURL(s.src) || safeURL(s.src);
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
   if (tw.getElementsByTagName('*').length > C.CLONE_NODE_MAX) return []; // v5.7.1：单推节点护栏（此前 Twitter 路径绕过 safeClone，病态节点可拖垮主线程）
   const clone = tw.cloneNode(true);
   // v5.5.0：剔除操作栏（回复/转推/点赞/书签/分享按钮内含计数文本）与浏览数容器，
   // 避免正文块中混入 "23"、"1.2K" 之类游离数字
   clone.querySelectorAll('[data-testid="app-text-transition-container"],button[data-testid="reply"],button[data-testid="retweet"],button[data-testid="like"],button[data-testid="unlike"],button[data-testid="bookmark"],button[data-testid="share"]').forEach(n => n.remove());
   clone.querySelectorAll('img,video,[data-testid="tweetPhoto"],[data-testid="videoPlayer"]').forEach(n => n.remove());
   const frag = document.createDocumentFragment();
   frag.appendChild(clone);
   return parseBlocks(frag);
  }
  function twConversation() {
   if (!isTwitterStatus()) return null;
   const main = document.querySelector('main[role="main"]') || document.querySelector('div[data-testid="primaryColumn"]') || document.body;
   const tweets = [...main.querySelectorAll('article[data-testid="tweet"]')].slice(0, C.TW_CONV_MAX); // v5.7.1：会话规模护栏，防长线程数百楼全量克隆卡顿
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
  function extractBlocks(target, opts) { // v5.7.1：新增 opts.altClick（Alt+单击 = Twitter 仅当前推文）
   // v5.4.0：pageTitle() 只在入口计算一次，各分支复用，避免重复 document.querySelector
   const title = pageTitle();
   const tag = target.tagName;
   if (tag === 'IMG') {
    if (isAvatar(target) || isZhihuMember(target)) return { blocks: [], title };
    let url = realImgSrc(target);
    if (url && isTwitter && !DATA_IMG_RE.test(url)) url = upgradeTwImg(url);
    const b = mkMedia('image', url);
    return { blocks: b ? [b] : [], title };
   }
   if (tag === 'VIDEO') { const b = mkMedia('video', videoSrc(target)); return { blocks: b ? [b] : [], title }; }
   if (tag === 'IFRAME') { const b = mkMedia('embed', normURL(target.src) || safeURL(target.src)); return { blocks: b ? [b] : [], title }; }
   if (target.classList?.contains('GifPlayer')) { const m = gifMedia(target); if (m) { const b = mkMedia(m.type, m.url); return { blocks: b ? [b] : [], title }; } }
   if (isTwitter) {
    const twConv = opts?.altClick ? null : twConversation(); // v5.7.1：Alt+单击 = 仅当前推文，跳过整线程会话模式
    if (twConv) return { blocks: twConv, title };
    const article = target.closest('article[data-testid="tweet"]');
    if (article) return { blocks: [twAuthorHeader(article), ...twTextBlocks(article), ...twMediaBlocks(article)], title };
   }
   if (isZhihu && target.matches && (target.matches(ZH_REPLY_ITEM) || target.matches(ZH_COMMENT_ITEM) || target.matches(ZH_COMMENT_BOX))) {
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
    const frag = document.createDocumentFragment();
    frag.appendChild(clone);
    const body = parseBlocks(frag);
    const prefix = [];
    if (qTitle) prefix.push(mkH(2, qTitle));
    const author = zhihuAuthor(target);
    if (author) prefix.push(mkPara(`作者：${author}`));
    if (srcUrl) prefix.push(mkRichPara([{ type: 'text', text: { content: qTitle ? '🔗 问题链接' : '🔗 原文链接', link: { url: srcUrl } } }]));
    return { blocks: [...prefix, ...body], title: qTitle || title };
   }
   const frag = document.createDocumentFragment();
   frag.appendChild(clone);
   return { blocks: parseBlocks(frag), title };
  }
  function findTarget(node) {
   if (!node || node === document.body || node === document.documentElement || isOwn(node)) return null;
   const tag = node.tagName;
   if (tag === 'IMG') return (!isAvatar(node) && !isZhihuMember(node) && realImgSrc(node)) ? node : null;
   if (tag === 'VIDEO' && videoSrc(node)) return node;
   if (tag === 'IFRAME' && (normURL(node.src) || safeURL(node.src))) return node;
   if (node.classList?.contains('GifPlayer')) return node;
   if (isZhihu) {
    const cReply = node.closest(ZH_REPLY_ITEM);
    if (cReply) return cReply;
    const cItem = node.closest(ZH_COMMENT_ITEM);
    if (cItem) return cItem;
    const cBox = node.closest(ZH_COMMENT_BOX);
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
     // v5.5.0 修复：命中即返回。此前 PRE/TABLE 仅记入 leaf 并继续上溯，
     // 导致悬停代码块/表格时被外层 DIV 等容器抢占（leaf 分支几乎永远不可达）
     if (r.width > 20 && r.height > 20) return cur;
    }
    cur = cur.parentElement;
   }
   return node.closest('p,div,li,blockquote') || null;
  }
  function describeElement(elm) {
   if (!elm) return '';
   const tag = elm.tagName.toLowerCase();
   const cls = typeof elm.className === 'string' ? elm.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
   const id = elm.id ? '#' + elm.id : '';
   return tag + (id ? id : cls ? '.' + cls : '');
  }

  // ============================================================
  // v5.6.0：选取粒度调节——↑ 扩大到外层容器 / ↓ 缩回内层目标
  // ============================================================
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
  function applySelection() {
   const t = selCands[selIdx];
   if (!t) return;
   hlTarget = t;
   positionHL(t);
   el.tip.textContent = `🔍 ${describeElement(t)} — 单击提取 · ↑↓ 调整范围 (${selIdx + 1}/${selCands.length})`;
  }

  // ============================================================
  // 悬浮按钮：拖拽 / 贴边 / 持久化
  // ============================================================
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
  function applyPos(l, t) {
   const p = clampPos(l, t);
   el.btn.style.left = p.left + 'px';
   el.btn.style.top = p.top + 'px';
   el.btn.style.right = 'auto';
   el.btn.style.bottom = 'auto';
  }
  const showFull = () => { el.btn.classList.remove('edge'); hidden = false; hiddenEdge = ''; };
  const hideTo = (e) => { el.btn.classList.add('edge'); hidden = true; hiddenEdge = e; };
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
    applyPos(hp.left, hp.top); hideTo(edge);
   } else {
    applyPos(c.left, c.top); showFull();
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
  el.btn.addEventListener('mouseenter', () => {
   if (dragging || hiddenForImg) return;
   clearTimeout(hoverTimer);
   if (hidden) { const r = el.btn.getBoundingClientRect(); const fp = fullFromHidden(hiddenEdge, r.left, r.top); applyPos(fp.left, fp.top); showFull(); }
  }, { signal });
  el.btn.addEventListener('mouseleave', () => {
   if (dragging || hidden) return;
   hoverTimer = setTimeout(() => {
    const r = el.btn.getBoundingClientRect(); snap(r.left, r.top);
   }, 500);
  }, { signal });
  _cleanupFns.push(() => clearTimeout(hoverTimer));
  _cleanupFns.push(() => clearTimeout(okAutoCloseTimer));
  el.btn.addEventListener('mousedown', (e) => {
   if (e.button === 2) return;
   e.preventDefault(); e.stopPropagation();
   dragging = true; el.btn.style.transition = 'none';
   if (hidden) { const r = el.btn.getBoundingClientRect(); const fp = fullFromHidden(hiddenEdge, r.left, r.top); applyPos(fp.left, fp.top); showFull(); }
   const r = el.btn.getBoundingClientRect();
   dragSX = e.clientX; dragSY = e.clientY; dragIL = r.left; dragIT = r.top;
  }, { signal });
  function dragEnd(e) {
   if (!dragging) return;
   dragging = false; el.btn.style.transition = '';
   const dx = e.clientX - dragSX, dy = e.clientY - dragSY;
   dragDist = Math.sqrt(dx * dx + dy * dy);
   if (dragDist <= C.DRAG_CLICK_PX) { savePos(); return; }
   const r = el.btn.getBoundingClientRect(); snap(r.left, r.top);
   setTimeout(() => { dragDist = 0; }, 300);
  }
  function cancelDrag() { if (!dragging) return; dragging = false; dragDist = 0; el.btn.style.transition = ''; }
  el.btn.addEventListener('click', (e) => {
   if (dragDist > C.DRAG_CLICK_PX) { e.preventDefault(); e.stopPropagation(); dragDist = 0; return; }
   if (hidden) { e.preventDefault(); e.stopPropagation(); const r = el.btn.getBoundingClientRect(); const fp = fullFromHidden(hiddenEdge, r.left, r.top); applyPos(fp.left, fp.top); showFull(); savePos(); dragDist = 0; return; }
   e.stopPropagation(); triggerClipper(); dragDist = 0;
  }, { signal });
  el.btn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); openSettings(); }, { signal });
  function onResize() {
   if (hidden) {
    const sl = GM_getValue(STORAGE.BTN_LEFT, null);
    const st = GM_getValue(STORAGE.BTN_TOP, null);
    if (sl !== null && st !== null) { const c = clampPos(sl, st); const hp = hiddenPos(hiddenEdge, c.left, c.top); applyPos(hp.left, hp.top); }
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
     if (hidden) {
      const sl = GM_getValue(STORAGE.BTN_LEFT, null);
      const st = GM_getValue(STORAGE.BTN_TOP, null);
      if (sl !== null && st !== null) { const c = clampPos(sl, st); const hp = hiddenPos(hiddenEdge, c.left, c.top); applyPos(hp.left, hp.top); hideTo(hiddenEdge); }
     } else loadPos();
    }
   });
  }
  function onDocMouseUp(e) { if (dragging) dragEnd(e); }
  document.addEventListener('mousemove', onDocMouseMove, { signal, capture: true });
  document.addEventListener('mouseup', onDocMouseUp, { signal, capture: true });
  window.addEventListener('blur', cancelDrag, { signal });
  _cleanupFns.push(() => { if (largeImgRafId) cancelAnimationFrame(largeImgRafId); });

  // ============================================================
  // 选取模式
  // ============================================================
  function positionHL(target) {
   const r = target.getBoundingClientRect();
   el.hl.style.display = 'block';
   el.hl.style.width = r.width + 'px';
   el.hl.style.height = r.height + 'px';
   el.hl.style.transform = `translate(${r.left}px,${r.top}px)`;
  }
  function clearHL() { el.hl.style.display = 'none'; hlTarget = null; selAnchor = null; }
  function onHoverMove(e) {
   if (rafId) cancelAnimationFrame(rafId);
   rafId = requestAnimationFrame(() => {
    el.mask.style.pointerEvents = 'none';
    const t = document.elementFromPoint(e.clientX, e.clientY);
    el.mask.style.pointerEvents = '';
    if (!t || isOwn(t)) { clearHL(); return; }
    const best = findTarget(t);
    if (best) {
     // v5.6.0：悬停目标变化时重建候选链；未变化则保留用户已调好的层级
     if (best !== selAnchor) {
      selAnchor = best;
      selCands = buildCandidates(best);
      selIdx = 0;
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
   el.mask.style.pointerEvents = 'none';
   const t = document.elementFromPoint(e.clientX, e.clientY);
   el.mask.style.pointerEvents = '';
   if (!t || isOwn(t)) return;
   // v5.6.0：优先提取当前高亮目标（保留用户用 ↑↓ 调好的层级），无高亮时回退即时计算
   const best = (hlTarget && document.contains(hlTarget)) ? hlTarget : findTarget(t);
   if (!best) return;
   try {
    const { blocks: b, title } = extractBlocks(best, { altClick: e.altKey }); // v5.7.1：透传 Alt 修饰键
    if (!b.length) { toast('所选元素未提取到有效内容', 'error'); return; }
    if (b.length > C.BLOCKS_WARN) toast(`提取了 ${b.length} 个块，内容较多，发送可能较慢`, 'info');
    stopSelect();
    if (appendMode) {
     // v5.5.0：追加模式——新块并入当前内容，保留标题/标签输入，回到确认弹窗
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
   const wasAppend = appendMode; // v5.5.0：追加模式下 Esc = 放弃本次追加并返回弹窗
   appendMode = false;
   stopSelect();
   if (wasAppend) openConfirm();
  }
  // v5.6.0：↑ 扩大选取范围（更外层容器）/ ↓ 缩小（更内层目标）
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
   selCands = []; selIdx = 0; selAnchor = null;
   el.tip.textContent = appendMode ? '🔍 追加模式：悬停高亮元素，单击追加 (↑↓调范围 · Esc返回)' : `🔍 悬停高亮元素，单击提取内容 (↑↓调整范围 · Esc取消${isTwitterStatus() ? ' · Alt+单击仅本条' : ''})`; // v5.7.1：推文页提示单条模式
   el.tip.style.display = 'block';
   el.mask.style.display = 'block';
   document.body.style.cursor = 'crosshair';
   // v5.5.0：监听挂到模式级 signal 上，stopSelect 时随 abort 一并移除（修复累积泄漏）
   document.addEventListener('keydown', onEsc, { signal: modeAc.signal, capture: true });
   document.addEventListener('keydown', onSelKey, { signal: modeAc.signal, capture: true });
   document.addEventListener('scroll', onScroll, { signal: modeAc.signal, capture: true });
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
   selCands = []; selIdx = 0; selAnchor = null; // v5.6.0
  }

  // ============================================================
  // 预览 / 确认弹窗
  // ============================================================
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
     if (rt.text?.link) { const a = document.createElement('a'); a.href = rt.text.link.url; a.textContent = rt.text.content; a.target = '_blank'; a.rel = 'noopener noreferrer'; p.appendChild(a); }
     else p.appendChild(document.createTextNode(rt.text?.content || ''));
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
    const src = block.image?.external?.url || '';
    img.src = src;
    img.onerror = () => { img.style.display = 'none'; img.onerror = null; };
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
    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:collapse;width:100%';
    const rows = block.table?.children || [];
    rows.forEach((row, ri) => {
     const tr = document.createElement('tr');
     const isHeader = ri === 0 && block.table.has_column_header;
     for (const cell of row.table_row?.cells || []) {
      const td = document.createElement(isHeader ? 'th' : 'td');
      td.textContent = cellText(cell);
      td.style.cssText = 'border:1px solid var(--c-td-border);padding:4px';
      if (isHeader) td.style.fontWeight = '700';
      tr.appendChild(td);
     }
     table.appendChild(tr);
    });
    content = table;
   } else if (type === 'divider') {
    const hr = document.createElement('hr');
    hr.style.cssText = 'border:none;border-top:1px dashed #ccc;margin:6px 0';
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
     kids.forEach(k => renderPreview(k, kd, -1, depth + 1)); // v5.7.1：补传深度，与 toggle 分支对齐，防未来嵌套结构绕过 PREVIEW_DEPTH_MAX
     wrap.appendChild(kd);
    }
   }
   container.appendChild(wrap);
  }
  function textFromBlocks(bks) {
   const parts = [];
   // v5.5.0：改为递归——补齐此前被整体丢弃的表格行、折叠块子内容与列表子块
   const walk = (arr) => {
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
     if (Array.isArray(kids) && kids.length) walk(kids);
    }
   };
   walk(bks);
   return parts.join('\n');
  }
  function refreshPreview() {
   el.pv.innerHTML = '';
   if (!blocks.length) { el.pv.textContent = '无内容'; el.pvCount.textContent = ''; return; }
   blocks.forEach((b, i) => renderPreview(b, el.pv, i));
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
  function showConfirm(title) {
   el.title.value = title || pageTitle();
   // v5.6.0：域名默认标签优先（含子域匹配），未命中回填上次使用的标签
   el.tags.value = matchDomainTags(S.domainTags, location.hostname) || GM_getValue(STORAGE.LAST_TAGS, '');
   refreshPreview();
   hideProgress();
   el.modalCfm.classList.remove('minimized');
   el.btnMin.textContent = '🔽';
   el.btnMin.title = '最小化';
   openConfirm();
  }
  // v5.5.0：统一「打开确认弹窗」入口——每次进入都重建模式信号并挂载 onConfirmKey。
  // 修复两处缺陷：① showConfirm 每次剪藏都追加一个从不移除的 keydown 监听（累积泄漏）；
  // ② doRetry 直接拉起弹窗却从未挂监听，导致重试后 Ctrl+Enter 发送失效。
  function openConfirm() {
   if (modeAc) { modeAc.abort(); modeAc = null; }
   modeAc = new AbortController();
   document.addEventListener('keydown', onConfirmKey, { signal: modeAc.signal, capture: true });
   el.ovCfm.style.display = 'flex';
   confirmOpen = true;
  }
  const closeConfirm = () => { if (modeAc) { modeAc.abort(); modeAc = null; } el.ovCfm.style.display = 'none'; confirmOpen = false; };
  function onConfirmKey(e) {
   if (!confirmOpen) return;
   // v5.7.1：Esc 统一由先注册的 onModalEsc 处理（其 stopImmediatePropagation 会阻断本监听，此处原 Esc 分支为不可达死代码，已删）
   if (el.modalCfm.classList.contains('minimized')) return;
   if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSend(); return; }
   if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
    const active = e.target;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    const docActive = document.activeElement;
    if (docActive && (docActive.tagName === 'INPUT' || docActive.tagName === 'TEXTAREA')) return;
    e.preventDefault(); el.pv.focus();
    const sel = window.getSelection();
    if (sel) {
     const range = document.createRange(); range.selectNodeContents(el.pv);
     sel.removeAllRanges(); sel.addRange(range);
    }
   }
  }
  function onModalEsc(e) {
   if (e.key !== 'Escape') return;
   for (const ov of [el.ovCfm, el.ovErr, el.ovOk, el.ovSet]) {
    if (ov.style.display === 'flex') {
     // v5.2.0：Esc 关闭设置面板前检查未保存更改（与“关闭”按钮行为对齐）
     if (ov === el.ovSet && settingsDirty) {
      if (!confirm('有未保存的更改，确定关闭？')) return;
      settingsDirty = false; if (el.dirtyFlag) el.dirtyFlag.style.display = 'none';
     }
     e.preventDefault();
     e.stopImmediatePropagation();
     // v5.5.0：确认弹窗改走 closeConfirm()，确保模式信号被 abort（监听随移除）
     if (ov === el.ovCfm) { closeConfirm(); return; }
     ov.style.display = 'none';
     return;
    }
   }
  }
  document.addEventListener('keydown', onModalEsc, { signal, capture: true });
  function openSettings() {
   refreshSettings();
   const s = S;
   el.tok.value = s.notionToken;
   el.db.value = s.notionDbId;
   el.tag.value = s.notionTagsProp;
   el.fsAppId.value = s.fsAppId;
   el.fsSecret.value = s.fsAppSecret;
   el.fsFolder.value = s.fsFolder;
   el.ckNotion.checked = isNotionEnabled();
   el.ckFeishu.checked = isFeishuEnabled();
   el.ckObsidian.checked = isObsidianEnabled();
   el.obsApiUrl.value = s.obsApiUrl;
   el.obsApiKey.value = s.obsApiKey;
   el.obsFolder.value = s.obsFolder;
   el.blocklist.value = s.blocklist || ''; // v5.6.0
   el.domainTags.value = s.domainTags || ''; // v5.6.0
   el.sendProfile.value = (s.sendProfile === 'standard') ? 'standard' : 'gentle'; // v5.7.0
   // 重置所有密码框为隐藏态
   for (const { input, btn } of [{ input: el.tok, btn: el.tokTglNotion }, { input: el.fsSecret, btn: el.tokTglFeishu }, { input: el.obsApiKey, btn: el.tokTglObs }]) {
    input.type = 'password'; btn.textContent = '👁️';
   }
   settingsDirty = false;
   if (el.dirtyFlag) el.dirtyFlag.style.display = 'none';
   el.ovSet.style.display = 'flex';
   if (!settingsListenersAttached) {
    const inputs = [el.tok, el.db, el.tag, el.fsAppId, el.fsSecret, el.fsFolder, el.ckNotion, el.ckFeishu, el.ckObsidian, el.obsApiUrl, el.obsApiKey, el.obsFolder, el.blocklist, el.domainTags, el.sendProfile];
    const onInputChange = () => { settingsDirty = true; if (el.dirtyFlag) el.dirtyFlag.style.display = 'block'; };
    inputs.forEach(inp => inp.addEventListener('change', onInputChange, { signal }));
    inputs.forEach(inp => inp.addEventListener('input', onInputChange, { signal }));
    settingsListenersAttached = true;
   }
  }
  function triggerClipper() {
   if (selecting) stopSelect(); // v5.7.1：未配置提前 return 前先复位选取态，避免 mask/十字光标残留
   refreshSettings(); // v5.2.0：单次快照，替代原先 5~6 次 readSettings 的存储风暴
   cachedIcon = null;
   imgDL = new Map(); imgDLBytes = 0; imgFailTs.clear(); // v5.5.0：字节计数随缓存一并重置；v5.7.1：负缓存一并重置
   cachedSend = null;
   appendMode = false; // v5.5.0：新一次剪藏退出追加模式
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

  // ============================================================
  // 底层请求
  // ============================================================
  function gmRequest({ method, url, headers, data, timeout, responseType }) {
   return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
     method, url,
     headers: headers || {},
     data: data ?? null,
     timeout: timeout || C.API_TIMEOUT,
     responseType: responseType || '',
     onload: res => resolve(res),
     onerror: () => reject(Object.assign(new Error('网络错误'), { network: true })),
     ontimeout: () => reject(Object.assign(new Error('请求超时'), { network: true })),
    });
   });
  }

  // Notion API：基于 withRetry 的统一退避（v5.2.0：令牌读快照 S）
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
   }, { retries: C.API_RETRY, retryOn: isRetryableError });
  }

  // ============================================================
  // 飞书 API
  // ============================================================
  async function getFeishuToken(force) {
   const now = Date.now();
   if (!force && fsTokenCache.token && now < fsTokenCache.expiry) return fsTokenCache.token;
   const res = await gmRequest({
    method: 'POST',
    url: 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    data: JSON.stringify({ app_id: S.fsAppId, app_secret: S.fsAppSecret }),
   });
   const json = tryParseJSON(res.responseText);
   if (json === null) throw new Error('飞书鉴权响应解析失败');
   if (res.status < 200 || res.status >= 300 || json.code !== 0)
    throw new Error(`飞书鉴权失败(${json.code ?? res.status}): ${json.msg || res.statusText || ''}`);
   fsTokenCache = { token: json.tenant_access_token, expiry: now + (((json.expire | 0) || 7200) - 120) * 1000 };
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
   }, { retries: C.API_RETRY, retryOn: (err) => err.auth || isRetryableError(err) || err.code === 99991400 || err.code === 99991401 });
  }

  // 飞书串行写入队列：保证顺序 & 速率限制
  let fsWriteChain = Promise.resolve();
  async function fsWrite(method, url, data) {
   const task = async () => {
    const wait = getProfile().apiGapMs - (Date.now() - fsLastWrite); // v5.7.0：间隔由发送节奏档位控制
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
   // v5.7.1：负缓存——TTL 内失败的 URL 直接短路返回，不再重复下载
   if (imgFailTs.has(url)) {
    if (Date.now() - imgFailTs.get(url) < C.IMG_FAIL_TTL) return null;
    imgFailTs.delete(url);
   }
   // LRU：命中则提升到最新
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
     const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e;
    }
    return null;
   }, { retries: C.IMG_DL_RETRY + 1, retryOn: isRetryableError });
   if (!result) { imgFailTs.set(url, Date.now()); return null; } // v5.7.1：失败写入负缓存
   // 写入 LRU 缓存（v5.5.0：条数与总字节双重上限——此前仅限条数，50×15MB 最坏可占 750MB）
   const evictOldest = () => {
    const oldest = imgDL.keys().next().value;
    if (oldest === undefined) return false;
    imgDLBytes -= imgDL.get(oldest)?.buf?.byteLength || 0;
    imgDL.delete(oldest);
    return true;
   };
   while (imgDL.size >= C.IMG_DL_CACHE_MAX && evictOldest()) { /* 逐出最旧 */ }
   while (imgDL.size && imgDLBytes + result.buf.byteLength > C.IMG_DL_CACHE_BYTES && evictOldest()) { /* 字节超限逐出 */ }
   imgDL.set(url, result);
   imgDLBytes += result.buf.byteLength;
   imgFailTs.delete(url); // v5.7.1：成功后清除负缓存
   return result;
  }

  async function mapLimit(items, limit, fn) {
   const ret = new Array(items.length);
   if (!items.length) return ret; // 空数组提前返回，避免创建空 worker 集的无意义开销
   let i = 0;
   const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; ret[idx] = await fn(items[idx], idx); }
   });
   await Promise.all(workers);
   return ret;
  }
  async function feishuUploadImage(info, blockId) {
   // v5.5.0：去掉外层 withRetry——fsWrite→apiReqFeishu 内部已有 3 次退避重试，
   // 双层叠加最坏 3×3=9 次尝试，持久性故障下徒增阻塞
   const fd = new FormData();
   fd.append('file_name', info.name);
   fd.append('parent_type', 'docx_image');
   fd.append('parent_node', blockId);
   fd.append('size', String(info.size));
   fd.append('file', info.blob, info.name);
   const json = await fsWrite('POST', 'https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', fd);
   const token = json?.data?.file_token || null;
   if (token) return token;
   throw new Error('未返回 file_token');
  }

  // ============================================================
  // 飞书块转换
  // ============================================================
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
  /**
   * v5.2.0：子弹/编号列表的子块不再拍平到同级——先在子上下文中构建，
   * 由 fsInsertTree 依据父块 block_id 递归插入，保留层级；
   * 子块含不可缩进类型（标题等）时保守回退拍平。
   */
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
       // 拍平：子块提升至当前层级（图片任务与嵌套任务随迁并修正索引）
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
     // 飞书块 API 无 toggle 类型，子块拍平为同级
     fsPushText(ctx.out, FS_BLK.TEXT, 'text', richToFeishuElements(block.toggle?.rich_text));
     const kids = block.toggle?.children;
     if (Array.isArray(kids) && kids.length) blocksToFeishu(kids, ctx, depth + 1);
    }
   }
  }

  /**
   * v5.2.0 新增：递归插入块树。
   * - 根级与子级统一走 /blocks/{parentBlockId}/children；
   * - 嵌套任务在父块创建成功后以其 block_id 递归插入，失败自动降级为根级追加（内容不丢）；
   * - 图片上传/回退均以“父块局部索引”定位，互不干扰。
   */
  async function fsInsertTree(docId, ctx, parentBlockId, onProgress, state) {
   const batches = []; let cur = [], curImg = 0, curStart = 0;
   ctx.out.forEach((b, i) => {
    const isImg = b.block_type === FS_BLK.IMAGE;
    if (cur.length >= C.FS_BATCH || (isImg && curImg >= C.FS_IMG_PER_REQ)) { batches.push({ blocks: cur, start: curStart }); curStart = i; cur = []; curImg = 0; }
    if (isImg) curImg++; cur.push(b);
   });
   if (cur.length) batches.push({ blocks: cur, start: curStart });
   const failed = [];
   let imgFails = 0;
   for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    if (onProgress && parentBlockId === docId) onProgress(10 + Math.round(bi / Math.max(batches.length, 1) * 60), `飞书块 ${batch.start + 1}/${ctx.out.length}`);
    const res = await fsWrite('POST', `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${parentBlockId}/children`, { children: batch.blocks });
    if (state) state.appendedAny = true;
    const created = res?.data?.children || [];
    for (const job of ctx.jobs) {
     const local = job.index - batch.start;
     if (local < 0 || local >= batch.blocks.length) continue;
     if (local >= created.length) { failed.push({ index: job.index, info: job.info }); continue; }
     const blockId = created[local]?.block_id;
     if (!blockId) { failed.push({ index: job.index, info: job.info }); continue; }
     try {
      if (onProgress) onProgress(70 + Math.round(bi / Math.max(batches.length, 1) * 15), `上传图片…`);
      const fileToken = await feishuUploadImage(job.info, blockId);
      await fsWrite('PATCH', `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${blockId}`, { replace_image: { token: fileToken } });
     } catch (e) { console.error('[NC] 飞书图片上传失败:', e.message || '未知错误'); failed.push({ index: job.index, info: job.info, blockId }); }
    }
    for (const nj of ctx.nest) {
     const local = nj.index - batch.start;
     if (local < 0 || local >= batch.blocks.length) continue;
     const nestParent = created[local]?.block_id;
     if (!nestParent) continue;
     try {
      const sub = await fsInsertTree(docId, nj.ctx, nestParent, null, state);
      imgFails += sub.imgFails;
     } catch (e) {
      // 嵌套插入失败 → 降级：挂到文档根级末尾，保证内容不丢
      console.warn('[NC] 嵌套插入失败，降级为根级追加:', e?.message || e);
      const sub = await fsInsertTree(docId, nj.ctx, docId, null, state);
      imgFails += sub.imgFails;
     }
    }
   }
   // 失败图片回退为链接/占位（在当前父块范围内替换，索引互不干扰）
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

  // ============================================================
  // Obsidian Markdown 转换
  // ============================================================
  // v5.5.0：Markdown 行内链接/图片的 URL 转义——空格与圆括号会截断 () 语法定界
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
  function blocksToMarkdown(blocks, indent = '') {
   let md = '';
   for (const b of blocks) {
    const type = b.type;
    if (type === 'paragraph') md += indent + richToMd(b.paragraph?.rich_text) + '\n\n';
    else if (type.startsWith('heading_')) { const lv = parseInt(type.split('_')[1], 10) || 1; md += indent + '#'.repeat(lv) + ' ' + richToMd(b[type]?.rich_text) + '\n\n'; }
    else if (type === 'bulleted_list_item') { md += indent + '- ' + richToMd(b[type]?.rich_text).replace(/\n/g, '\n  ') + '\n'; if (Array.isArray(b[type]?.children) && b[type].children.length) md += blocksToMarkdown(b[type].children, indent + '  '); }
    else if (type === 'numbered_list_item') { md += indent + '1. ' + richToMd(b[type]?.rich_text).replace(/\n/g, '\n   ') + '\n'; if (Array.isArray(b[type]?.children) && b[type].children.length) md += blocksToMarkdown(b[type].children, indent + '   '); }
    else if (type === 'quote') md += indent + '> ' + richToMd(b.quote?.rich_text).replace(/\n/g, '\n> ') + '\n\n';
    else if (type === 'code') { const lang = b.code?.language || ''; md += indent + '```' + lang + '\n' + rtStr(b.code?.rich_text) + '\n```\n\n'; }
    else if (type === 'image') { const url = b.image?.external?.url || ''; md += DATA_IMG_RE.test(url) ? indent + '🖼️ [内嵌图片(data:)，已略过]\n\n' : indent + `![](${mdUrl(url)})\n\n`; }
    else if (type === 'video' || type === 'embed') { const url = b[type]?.external?.url || b[type]?.url || ''; md += indent + `[媒体链接](${mdUrl(url)})\n\n`; }
    else if (type === 'table') {
     // v5.2.0：单元格转义竖线，避免破坏 Markdown 表格结构
     const mdCell = (cell) => cellText(cell).replace(/\|/g, '\\|');
     const rows = b.table?.children || [];
     if (rows.length > 0) {
      const firstRow = rows[0].table_row?.cells || [];
      md += indent + '| ' + firstRow.map(mdCell).join(' | ') + ' |\n';
      md += indent + '| ' + firstRow.map(() => '---').join(' | ') + ' |\n';
      for (let i = 1; i < rows.length; i++) { const cells = rows[i].table_row?.cells || []; md += indent + '| ' + cells.map(mdCell).join(' | ') + ' |\n'; }
      md += '\n';
     }
    }
    else if (type === 'divider') md += indent + '---\n\n';
    else if (type === 'toggle') md += indent + '<details>\n' + indent + '<summary>' + rtStr(b.toggle?.rich_text) + '</summary>\n\n' + blocksToMarkdown(b.toggle?.children || [], indent) + '\n' + indent + '</details>\n\n';
   }
   return md;
  }

  // ============================================================
  // Obsidian 串行写入队列
  // ============================================================
  let obsWriteChain = Promise.resolve();
  const obsWrite = (task) => { obsWriteChain = obsWriteChain.then(task, task); return obsWriteChain; };

  // v5.3.0：Obsidian 仅保留 Local REST API 模式；失败不再静默回退剪贴板，
  // 而是抛错进入失败弹窗（弹窗内提供“复制 Markdown”与“重试”）。
  const normalizeObsidianBase = (raw) => {
   let b = String(raw || '').trim() || 'http://127.0.0.1:27123';
   if (!/^https?:\/\//i.test(b)) b = 'http://' + b;
   return b.replace(/\/+$/, '').replace(/\/vault$/i, '');
  };
  function buildMarkdown(sendBlocks, sendTitle, sendTags) {
   const title = (sendTitle || pageTitle() || 'Untitled').substring(0, C.TITLE_MAX);
   const tags = (sendTags || '').split(',').map(t => t.trim()).filter(Boolean);
   // YAML front matter
   const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' '); // v5.7.0：补反斜杠与换行转义，防止破坏 YAML front matter
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
   const folder = String(S.obsFolder || '').trim().replace(/^\/+|\/+$/g, '');
   const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').trim().substring(0, 120) || 'Untitled';
   const relPath = folder ? `${folder}/${safeTitle}.md` : `${safeTitle}.md`;
   const encodedPath = relPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
   const baseUrl = normalizeObsidianBase(S.obsApiUrl);
   const apiKey = String(S.obsApiKey || '').trim();
   // 时间戳（同名已存在时换名另存用；用 - 代替 : 以兼容 Windows 文件名，毫秒保证唯一）
   const fileStamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0'), p3 = (n) => String(n).padStart(3, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.${p3(d.getMilliseconds())}`;
   };

   // v5.3.2：Local REST API 对已存在文件 PUT 会抛 "File already exists"（内部走 Vault.create）
   // 并被映射为 HTTP 500。策略为“永不覆盖”：探测目标已存在则换带时间戳的新文件名另存，旧文件保留不动。
   const ensureUniquePath = async () => {
    if (!apiKey) throw new Error('未配置 Obsidian API Key（可在失败弹窗中复制 Markdown）');
    let exists = false;
    try {
     const probe = await gmRequest({ method: 'GET', url: `${baseUrl}/vault/${encodedPath}`, headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 8000 });
     exists = probe.status === 200;
    } catch { /* 探测失败：按不存在处理，继续尝试 PUT 原名 */ }
    if (!exists) return encodedPath;
    // 已存在 → 永不覆盖，另存为带时间戳（毫秒）的新文件
    const altRel = relPath.replace(/(\.md)$/i, ` ${fileStamp()}$1`);
    return altRel.split('/').filter(Boolean).map(encodeURIComponent).join('/');
   };

   let lastTargetPath = null; // v5.7.1：重试幂等——上次尝试的路径若已存在，视为上次已写入成功，避免超时歧义下换时间戳名造成双份笔记
   const executeWrite = () => withRetry(async () => {
    if (!apiKey) throw new Error('未配置 Obsidian API Key（可在失败弹窗中复制 Markdown）');
    if (lastTargetPath) {
     try {
      const reprobe = await gmRequest({ method: 'GET', url: `${baseUrl}/vault/${lastTargetPath}`, headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 8000 });
      if (reprobe.status === 200) return; // 上次 PUT 实际已成功（响应丢失），幂等完成
     } catch { /* 探测失败 → 走正常重试 */ }
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

  // ============================================================
  // 发送：Notion
  // ============================================================
  async function appendChildren(pageId, blks, onProgress, base = 0) {
   for (let i = 0; i < blks.length; i += C.BATCH_SIZE) {
    try {
     await apiReqNotion('PATCH', `https://api.notion.com/v1/blocks/${pageId}/children`, { children: blks.slice(i, i + C.BATCH_SIZE) });
     if (onProgress) onProgress(base + Math.min(i + C.BATCH_SIZE, blks.length), base + blks.length);
    } catch (e) { e.sent = i; throw e; }
    if (i + C.BATCH_SIZE < blks.length) await sleep(getProfile().apiGapMs); // v5.7.0：间隔由发送节奏档位控制
   }
  }
  /** v5.2.0：递归清洗——子块（列表/折叠块 children）内的 data: 图片同样替换为占位 */
  function notionSanitize(blks) {
   const walk = (arr) => (arr || []).map(b => {
    if (b && b.type === 'image' && DATA_IMG_RE.test(b.image?.external?.url || ''))
     return mkPara('🖼️ [页面内嵌图片(data:)，Notion 不支持，已略过]');
    const body = b?.[b.type];
    if (body && Array.isArray(body.children)) body.children = walk(body.children);
    return b;
   });
   return walk(blks);
  }
  async function sendToNotion(rawBlocks, sendTitle, sendTags, resume, onProgress) {
   const allBlocks = notionSanitize(rawBlocks);
   if (resume && resume.pageId) {
    lastNotionPageId = resume.pageId;
    const startIdx = resume.sent || 0;
    try {
     // v5.2.0：断点续传进度以全量为基准，不再首拍即 100%
     await appendChildren(resume.pageId, allBlocks.slice(startIdx), (sent, total) => { if (onProgress) onProgress(10 + Math.round(sent / total * 85), `Notion 块 ${sent}/${total}`); }, startIdx);
    } catch (e) {
     const err = new Error('页面已存在，剩余内容追加失败: ' + (e.message || '未知'));
     err.resume = { pageId: resume.pageId, sent: (resume.sent || 0) + (e.sent || 0) };
     throw err;
    }
    return;
   }
   const dbId = parseDbId(S.notionDbId);
   const title = sendTitle || pageTitle() || 'Untitled';
   const tags = (sendTags || '').split(',').map(t => t.trim()).filter(Boolean);
   const tagsProp = (S.notionTagsProp || 'Tags').trim();
   if (!dbId) throw new Error('Notion Database ID 格式不正确');
   if (onProgress) onProgress(5, '正在查询 Notion 数据库…');
   // v5.2.0：数据库 schema 会话级缓存（含自动建标签属性后的增量更新），同页多次发送省一次 GET
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
   const properties = { [titleKey]: { title: [{ text: { content: title.substring(0, C.TITLE_MAX) } }] } };
   if (tagsProp && tags.length && props[tagsProp]) {
    const t = props[tagsProp].type;
    if (t === 'select') properties[tagsProp] = { select: { name: tags[0].slice(0, C.TAG_NAME_MAX) } };
    else if (t === 'multi_select') properties[tagsProp] = { multi_select: tags.map(tg => ({ name: tg.slice(0, C.TAG_NAME_MAX) })) };
   }
   for (const [key, getter] of Object.entries({ 'URL': () => safeURL(location.href), 'Content Image': () => safeURL(pageMainImage()), Icon: () => safeURL(pageIcon()) })) {
    if (props[key]?.type === 'url') { const val = getter(); if (val) properties[key] = { url: val }; }
   }
   const firstBatch = allBlocks.slice(0, C.BATCH_SIZE);
   const payload = { parent: { database_id: dbId }, properties, children: firstBatch };
   const iconUrl = safeURL(pageIcon());
   if (iconUrl && !/\.svg($|\?)/i.test(iconUrl)) payload.icon = { type: 'external', external: { url: iconUrl } }; // v5.7.1：跳过 SVG 图标（部分版本不接受，防整页创建失败；图标缺失不影响正文）
   if (onProgress) onProgress(10, '正在创建 Notion 页面…');
   const resp = await apiReqNotion('POST', 'https://api.notion.com/v1/pages', payload);
   lastNotionPageId = resp.id;
   if (allBlocks.length > C.BATCH_SIZE) {
    try {
     await appendChildren(resp.id, allBlocks.slice(C.BATCH_SIZE), (sent, total) => { if (onProgress) onProgress(10 + Math.round(sent / total * 85), `Notion 块 ${sent}/${total}`); }, C.BATCH_SIZE);
     if (onProgress) onProgress(95, 'Notion 完成');
    } catch (e) {
     const err = new Error('页面已创建，但部分内容追加失败: ' + (e.message || '未知'));
     err.resume = { pageId: resp.id, sent: C.BATCH_SIZE + (e.sent || 0) };
     throw err;
    }
   }
  }

  // ============================================================
  // 发送：飞书
  // ============================================================
  async function sendToFeishu(sendBlocks, sendTitle, onProgress) {
   const folderToken = String(S.fsFolder || '').trim();
   const title = (sendTitle || pageTitle() || 'Untitled').substring(0, C.TITLE_MAX);
   if (onProgress) onProgress(0, '正在创建飞书文档…');
   const createRes = await fsWrite('POST', 'https://open.feishu.cn/open-apis/docx/v1/documents', folderToken ? { title, folder_token: folderToken } : { title });
   const docId = createRes?.data?.document?.document_id;
   if (!docId) throw new Error('创建飞书文档失败：未获取到 document_id');
   lastFeishuDocId = docId;
   // 等待文档初始化就绪
   let docReady = false;
   for (let i = 0; i <= C.FS_INIT_RETRY; i++) {
    await sleep(C.FS_INIT_WAIT);
    try { const check = await fsWrite('GET', `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}`); if (check?.data?.document?.document_id) { docReady = true; break; } } catch { /* 文档尚未就绪，重试 */ }
   }
   if (!docReady) throw new Error('飞书文档初始化超时，请重试');
   // v5.2.0：递归收集图片 URL（含列表/折叠块子块中的图片），不再只扫顶层
   const imgSet = new Set();
   (function collectImgs(arr) {
    for (const b of arr) {
     if (!b) continue;
     if (b.type === 'image') { const u = b.image?.external?.url; if (u) imgSet.add(u); }
     const body = b[b.type];
     if (body && Array.isArray(body.children)) collectImgs(body.children);
    }
   })(sendBlocks);
   // v5.3.3：去掉图片数量上限——全部图片下载并上传；上传走 fsWrite 串行限流队列，分批不触发飞书 API 限流
   const imgUrls = [...imgSet];
   if (imgUrls.length > 30) toast(`共 ${imgUrls.length} 张图片，将全部上传（较多时耗时较长）`, 'info');
   const imgInfo = new Map();
   if (imgUrls.length) {
    if (onProgress) onProgress(5, `飞书：正在下载 ${imgUrls.length} 张图片…`);
    const infos = await mapLimit(imgUrls, getProfile().imgConc, async (url, i) => { // v5.7.0：下载并发由发送节奏档位控制（温和=2 / 标准=3）
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
    const res = await fsInsertTree(docId, ctx, docId, onProgress, state);
    imgFails = res.imgFails;
   } catch (e) {
    // v5.2.0：整体失败且未写入任何内容 → 尽力移入回收站，避免云空间残留空文档
    if (!state.appendedAny) {
     try { await fsWrite('POST', `https://open.feishu.cn/open-apis/drive/v1/files/${docId}/trash?type=docx`, {}); lastFeishuDocId = null; }
     catch (e2) { console.warn('[NC] 空文档回收站清理失败:', e2?.message || e2); }
    }
    throw e;
   }
   if (onProgress) onProgress(100, '飞书 完成');
   return { docId, imgFails };
  }

  // ============================================================
  // 发送调度
  // ============================================================
  async function sendToAll(sendBlocks, sendTitle, sendTags, onlyPlatforms, notionResume) {
   refreshSettings(); // v5.2.0：发送前刷新一次快照，全程复用
   el.send.disabled = true; el.send.textContent = '发送中...'; showProgress();
   const useNotion = isNotionEnabled() && isNotionConfigured();
   const useFeishu = isFeishuEnabled() && isFeishuConfigured();
   const useObsidian = isObsidianEnabled();
   const shouldNotion = useNotion && (!onlyPlatforms || onlyPlatforms.includes('notion'));
   const shouldFeishu = useFeishu && (!onlyPlatforms || onlyPlatforms.includes('feishu'));
   const shouldObsidian = useObsidian && (!onlyPlatforms || onlyPlatforms.includes('obsidian'));
   let notionOk = false, feishuOk = false, obsidianOk = false;
   let errors = [], failedPlatforms = [], successPlatforms = [], nextNotionResume = null;

   // 按启用顺序分配进度区间
   const active = [];
   if (shouldNotion) active.push('notion');
   if (shouldFeishu) active.push('feishu');
   if (shouldObsidian) active.push('obsidian');
   const weight = active.length > 0 ? 100 / active.length : 100;

   // v5.5.0：进度改为「各平台百分比加权求和」——此前直接叠加绝对刻度，
   // 多平台进度不同步时进度条会来回跳动；聚合后单调递增
   const progMap = { notion: 0, feishu: 0, obsidian: 0 };
   const mkProgress = (name) => (pct, txt) => {
    progMap[name] = Math.max(progMap[name], Math.min(Math.max(pct | 0, 0), 100));
    const total = active.reduce((s, n) => s + progMap[n], 0);
    updateProgress(total * weight / 100, txt ? `${name} · ${txt}` : undefined); // v5.7.1：文本带平台前缀，多平台并发时语义不再互相覆盖
   };

   // v5.4.0：统一平台失败记录逻辑，消除三处重复的 errors/failedPlatforms 拼接
   const fail = (name, key, err) => { errors.push(`${name}: ${(err?.message || '未知').substring(0, 200)}`); failedPlatforms.push(key); };

   // v5.7.0：平台错峰启动——按启用顺序依次延迟 staggerMs 再发起，峰值并发连接从「全并行」
   // 降至约 1~2，降低对目标 API 的瞬时压力，也避免多平台同时失败后同步重试形成惊群
   const promises = [];
   const staggerMs = getProfile().staggerMs;
   let platSeq = 0;
   if (shouldNotion) { const delay = (platSeq++) * staggerMs; promises.push(sleep(delay).then(() => sendToNotion(sendBlocks, sendTitle, sendTags, notionResume || null, mkProgress('notion'))).then(() => { notionOk = true; successPlatforms.push('Notion'); }).catch(err => { if (err?.resume) nextNotionResume = err.resume; fail('Notion', 'notion', err); })); }
   if (shouldFeishu) { const delay = (platSeq++) * staggerMs; promises.push(sleep(delay).then(() => sendToFeishu(sendBlocks, sendTitle, mkProgress('feishu'))).then(({ docId, imgFails }) => { feishuOk = true; lastFeishuDocId = docId; successPlatforms.push(imgFails ? `飞书（${imgFails} 张图片回退）` : '飞书'); }).catch(err => fail('飞书', 'feishu', err))); }
   if (shouldObsidian) { const delay = (platSeq++) * staggerMs; promises.push(sleep(delay).then(() => sendToObsidian(sendBlocks, sendTitle, sendTags, mkProgress('obsidian'))).then(() => { obsidianOk = true; successPlatforms.push('Obsidian'); }).catch(err => fail('Obsidian', 'obsidian', err))); }

   if (!promises.length) { el.send.disabled = false; el.send.textContent = '发送'; hideProgress(); toast('没有可发送的平台', 'error'); return; }
   sending = true; // v5.5.0：配合 beforeunload，发送期间拦截页面关闭
   await Promise.all(promises);
   sending = false;
   el.send.disabled = false; el.send.textContent = '发送'; hideProgress();

   // v5.5.0：合并历史成功平台——重试只补发失败项，此前的成功不能在提示中消失
   const allSuccess = accSuccess.concat(successPlatforms);
   accSuccess = allSuccess;

   if (errors.length > 0) {
    cachedSend = { blocks: sendBlocks, title: sendTitle, tags: sendTags, failedPlatforms, notionResume: nextNotionResume };
    closeConfirm();
    if (allSuccess.length > 0) { el.errTitle.textContent = '⚠️ 部分发送失败'; el.errTitle.style.color = '#e65100'; el.errSucc.textContent = `✅ 已成功: ${allSuccess.join(', ')}`; el.errSucc.style.display = ''; }
    else { el.errTitle.textContent = '❌ 发送失败'; el.errTitle.style.color = '#d32f2f'; el.errSucc.style.display = 'none'; }
    el.errDetail.textContent = errors.join('\n\n'); el.errMd.style.display = failedPlatforms.length ? '' : 'none'; el.ovErr.style.display = 'flex'; // v5.7.1：复制 Markdown 扩展至任意平台失败（buildMarkdown 不依赖任何平台）
   } else {
    cachedSend = null; closeConfirm(); el.ovOk.style.display = 'flex';
    el.okOpenNotion.style.display = (notionOk || allSuccess.includes('Notion')) ? '' : 'none';
    el.okOpenFeishu.style.display = (feishuOk || allSuccess.some(s => s.startsWith('飞书'))) ? '' : 'none';
    el.okOpenObsidian.style.display = (obsidianOk || allSuccess.includes('Obsidian')) ? '' : 'none';
    el.okMsg.textContent = `已成功保存到 ${allSuccess.join(', ')}`;
    clearTimeout(okAutoCloseTimer); okAutoCloseTimer = setTimeout(() => { el.ovOk.style.display = 'none'; }, 10000);
   }
  }
  const doSend = () => {
   if (sending || el.send.disabled) return; // v5.7.1：拦截 Ctrl+Enter 连按重入（按钮路径有 disabled 兜底，键盘路径此前无守卫，会整份内容双发）
   const sendBlocks = blocks.slice();
   const sendTitle = el.title.value || pageTitle() || 'Untitled';
   const sendTags = el.tags.value || '';
   GM_setValue(STORAGE.LAST_TAGS, sendTags); // v5.2.0：记忆标签
   accSuccess = []; // v5.5.0：全新发送重置成功累计
   sendToAll(sendBlocks, sendTitle, sendTags, null, null);
  };
  function doRetry() {
   if (!cachedSend) { toast('没有可重试的内容', 'error'); return; }
   el.retry.disabled = true; el.retry.textContent = '发送中...'; el.ovErr.style.display = 'none';
   el.title.value = cachedSend.title || pageTitle() || 'Untitled'; el.tags.value = cachedSend.tags || '';
   el.modalCfm.classList.remove('minimized'); el.btnMin.textContent = '🔽'; el.btnMin.title = '最小化';
   showProgress();
   openConfirm(); // v5.5.0：统一入口——修复此前直接拉起弹窗未挂 onConfirmKey、重试后 Ctrl+Enter 失效
   sendToAll(cachedSend.blocks, cachedSend.title, cachedSend.tags, cachedSend.failedPlatforms, cachedSend.notionResume || null)
    .finally(() => { el.retry.disabled = false; el.retry.textContent = '🔄 重新发送失败项'; });
  }

  // ============================================================
  // 密码可见性切换：工厂函数消除三处重复
  // ============================================================
  function createPasswordToggle(input, button) {
   return () => {
    const show = input.type !== 'text';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? '🙈' : '👁️';
   };
  }
  el.tokTglNotion.addEventListener('click', createPasswordToggle(el.tok, el.tokTglNotion), { signal });
  el.tokTglFeishu.addEventListener('click', createPasswordToggle(el.fsSecret, el.tokTglFeishu), { signal });
  el.tokTglObs.addEventListener('click', createPasswordToggle(el.obsApiKey, el.tokTglObs), { signal });

  // ============================================================
  // 连接测试（v5.3.0）：设置面板逐平台验证表单中的凭证（无需先保存）
  // ============================================================
  async function runConnTest(btn, fn) {
   if (btn.disabled) return;
   btn.disabled = true; const orig = btn.textContent; btn.textContent = '⏳ 测试中';
   try { toast('✅ ' + await fn(), 'success'); }
   catch (e) { toast('❌ ' + (e?.message || '测试失败'), 'error'); }
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
     if (info) notionDbCache = { dbId, props: info.properties || {} }; // 测试成功即预热会话缓存（键为表单 dbId，保存后一致则命中）
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
   const authRes = await gmRequest({ method: 'POST', url: 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', headers: { 'Content-Type': 'application/json; charset=utf-8' }, data: JSON.stringify({ app_id: appId, app_secret: secret }) });
   const authJson = tryParseJSON(authRes.responseText);
   if (authJson === null) throw new Error('飞书鉴权响应解析失败');
   if (authRes.status < 200 || authRes.status >= 300 || authJson.code !== 0)
    throw new Error(`飞书鉴权失败(${authJson.code ?? authRes.status}): ${authJson.msg || ''}`);
   const token = authJson.tenant_access_token;
   // 创建并回收一篇测试文档：同时验证 docx 创建权限与文件夹 Token（真实发送链路）
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
  el.testObs.addEventListener('click', () => runConnTest(el.testObs, testObsidianConn), { signal });

  // ============================================================
  // 弹窗事件
  // ============================================================
  $('#btn-sc').addEventListener('click', () => { if (settingsDirty) { if (!confirm('有未保存的更改，确定关闭？')) return; settingsDirty = false; if (el.dirtyFlag) el.dirtyFlag.style.display = 'none'; } el.ovSet.style.display = 'none'; }, { signal });
  $('#btn-ss').addEventListener('click', () => {
   const notionToken = el.tok.value.trim(); const dbRaw = el.db.value.trim(); const notionDbId = parseDbId(dbRaw);
   if (notionToken && dbRaw && !notionDbId) { toast('Notion Database ID / 链接格式不正确（应包含 32 位字符）', 'error'); return; }
   GM_setValue(STORAGE.ENABLE_NOTION, el.ckNotion.checked); GM_setValue(STORAGE.ENABLE_FEISHU, el.ckFeishu.checked);
   GM_setValue(STORAGE.TOKEN, notionToken); GM_setValue(STORAGE.DB_ID, notionDbId); GM_setValue(STORAGE.TAGS_PROP, el.tag.value.trim());
   GM_setValue(STORAGE.FS_APP_ID, el.fsAppId.value.trim()); GM_setValue(STORAGE.FS_APP_SECRET, el.fsSecret.value.trim()); GM_setValue(STORAGE.FS_FOLDER, el.fsFolder.value.trim());
   GM_setValue(STORAGE.ENABLE_OBSIDIAN, el.ckObsidian.checked);
   GM_setValue(STORAGE.OBSIDIAN_API_URL, el.obsApiUrl.value.trim()); GM_setValue(STORAGE.OBSIDIAN_API_KEY, el.obsApiKey.value.trim());
   GM_setValue(STORAGE.OBSIDIAN_FOLDER, el.obsFolder.value.trim());
   GM_setValue(STORAGE.BLOCKLIST, el.blocklist.value.trim()); // v5.6.0
   GM_setValue(STORAGE.DOMAIN_TAGS, el.domainTags.value.trim()); // v5.6.0
   GM_setValue(STORAGE.SEND_PROFILE, el.sendProfile.value === 'standard' ? 'standard' : 'gentle'); // v5.7.0
   refreshSettings(); // v5.2.0：保存后立即刷新快照，后续读取零延迟
   settingsDirty = false; if (el.dirtyFlag) el.dirtyFlag.style.display = 'none'; el.ovSet.style.display = 'none'; toast('✅ 保存成功！');
  }, { signal });
  el.back.addEventListener('click', () => { closeConfirm(); blocks = []; hlTarget = null; imgDL = new Map(); imgDLBytes = 0; startSelect(); }, { signal });
  // v5.5.0：「➕ 追加」——保留已选内容与标题/标签，回到页面继续选取并合并
  el.btnAdd.addEventListener('click', () => { appendMode = true; closeConfirm(); startSelect(); }, { signal });
  $('#btn-cc').addEventListener('click', closeConfirm, { signal });
  el.send.addEventListener('click', doSend, { signal });
  el.btnCopy.addEventListener('click', (e) => { e.stopPropagation(); copyText(textFromBlocks(blocks), '📋 已复制到剪贴板'); }, { signal });
  el.btnMin.addEventListener('click', (e) => { e.stopPropagation(); const isMin = el.modalCfm.classList.toggle('minimized'); el.btnMin.textContent = isMin ? '🔼' : '🔽'; el.btnMin.title = isMin ? '还原' : '最小化'; confirmOpen = !isMin; }, { signal });
  el.okOpenNotion.addEventListener('click', () => { if (!lastNotionPageId) return; const url = `https://www.notion.so/${lastNotionPageId.replace(/-/g, '')}`; /* v5.7.0 修复：按规范带 noopener 时 window.open 恒返回 null，旧写法必然误报「弹窗被阻止」；改为打开后手动切断 opener */ const win = window.open(url, '_blank'); if (win) { try { win.opener = null; } catch { /* v5.7.1：个别 WebView 跨域赋值防御 */ } } else { copyText(url, '📋 链接已复制（弹窗被阻止）'); } }, { signal });
  el.okOpenFeishu.addEventListener('click', () => { if (!lastFeishuDocId) { window.open('https://www.feishu.cn/', '_blank'); return; } const url = `https://www.feishu.cn/docx/${lastFeishuDocId}`; /* v5.7.0：同 Notion——不再依赖恒为 null 的 noopener 返回值 */ const win = window.open(url, '_blank'); if (win) { try { win.opener = null; } catch { /* v5.7.1：个别 WebView 跨域赋值防御 */ } } else { copyText(url, '📋 链接已复制（弹窗被阻止）'); } }, { signal });
  el.okOpenObsidian.addEventListener('click', () => { const a = document.createElement('a'); a.href = 'obsidian://'; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove(); }, { signal });
  el.okClose.addEventListener('click', () => { clearTimeout(okAutoCloseTimer); el.ovOk.style.display = 'none'; cachedSend = null; }, { signal });
  el.retry.addEventListener('click', doRetry, { signal });
  el.errCopy.addEventListener('click', () => { copyText(el.errDetail.textContent || '', '已复制错误详情'); }, { signal });
  el.errMd.addEventListener('click', () => {
   if (!cachedSend) { toast('没有可复制的内容', 'error'); return; }
   try { const { md } = buildMarkdown(cachedSend.blocks, cachedSend.title || pageTitle() || 'Untitled', cachedSend.tags || ''); copyText(md, '📋 已复制 Markdown 到剪贴板'); }
   catch (e) { toast('生成 Markdown 失败: ' + (e?.message || '未知'), 'error'); }
  }, { signal });
  el.errClose.addEventListener('click', () => { el.ovErr.style.display = 'none'; cachedSend = null; }, { signal }); // v5.7.1：与 okClose 统一 cachedSend 清理时机
  // ============================================================
  // 全局快捷键 & 生命周期
  // ============================================================
  function onGlobalKey(e) {
   const active = document.activeElement;
   if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
   if (e.altKey && e.shiftKey && e.code === 'KeyN') { e.preventDefault(); e.stopPropagation(); triggerClipper(); }
  }
  // v5.5.0：发送期间拦截页面关闭/刷新，避免 Notion/飞书写入中途断掉产生半截内容
  window.addEventListener('beforeunload', (e) => { if (sending) { e.preventDefault(); e.returnValue = ''; } }, { signal });
  // v5.5.0：pagehide 挂上同一 signal——重复注入触发旧实例清理（ac.abort）时，
  // 旧 pagehide 监听随 signal 一并移除，不再残留指向新实例 __ncCleanup 的陈旧句柄
  window.addEventListener('pagehide', (e) => { if (e.persisted) return; if (window.__ncCleanup) window.__ncCleanup(); }, { signal });
  document.addEventListener('keydown', onGlobalKey, { signal, capture: true });
  loadPos();
 }

 // ============================================================
 // 启动
 // ============================================================
 try {
  if (document.body) ncInit();
  else document.addEventListener('DOMContentLoaded', () => { try { ncInit(); } catch (err) { console.error('[Notion & Feishu & Obsidian Web Clipper] 初始化失败:', err.message || '未知错误'); } }, { once: true });
 } catch (err) {
  console.error('[Notion & Feishu & Obsidian Web Clipper] 初始化失败:', err.message || '未知错误');
 }
})();
