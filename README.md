# Notion & Feishu & Obsidian Web Clipper

> 悬停高亮 + 单击选取，一键剪藏到 **Notion**、**飞书文档** 与 **Obsidian**。

![Version](https://img.shields.io/badge/version-5.7.1-2383e2) ![License](https://img.shields.io/badge/license-MIT-green) ![Platform](https://img.shields.io/badge/Tampermonkey%2FViolentmonkey-supported-orange)

一个轻量、无依赖的浏览器油猴脚本（userscript）：在任意网页上**悬停高亮**目标元素、**单击**提取内容，经确认弹窗校验后写入三大笔记平台。内置知乎 / Twitter 专属解析、图片智能上传、失败重试与限流治理，长期用于日常知识沉淀。

---

## ✨ 功能特性

- **悬停高亮 + 单击选取**：光标扫过即高亮块级元素，单击提取内容（对齐官方 Clipper 交互）。
- **↑ / ↓ 调整选取范围**：在当前目标与块级祖先间逐级放大 / 缩小，精准圈定所需内容。
- **➕ 追加模式**：多次选取合并为一次发送，标题 / 标签保留不变。
- **三平台并行发送**：Notion、飞书、Obsidian 一次剪藏全部送达；失败平台可单独重试，成功平台结果保留。
- **发送节奏档位**：`温和`（默认，降低并发规避平台限流）/ `标准`（更快），三参数联动（错峰启动 / 图片下载并发 / API 写入间隔）。
- **平台专属解析**：
  - 知乎：自动剔除操作栏 / 头像 / 营销位，识别问题标题与作者，评论区结构化提取（含楼中楼与点赞）。
  - Twitter / X：正文剔除操作栏计数，图片自动升级为 `orig` 原图；推文详情页一键剪藏**整个会话线程**，`Alt + 单击` 仅剪当前推文。
- **图片智能链路**：`srcset` 择优 → 多图床协议支持 → 类型嗅探（含 HEIC/WebP）→ 超限拒绝 → 失败自动降级为链接；LRU 双上限缓存（条数 + 总字节）与坏图负缓存。
- **容错与断点续传**：全链路指数退避重试（带抖动 + Retry-After 尊重）；Notion 批写入失败从断点续传；飞书嵌套块插入失败自动降级为根级追加，**内容不丢优先**。
- **安全护栏**：敏感域名（网银 / 邮箱 / 登录页 / 内网地址）自动禁用；内网 IP / IPv6 环回图片拒绝下载（防 SSRF）；全量 `textContent` 注入（防 XSS）；仅向白名单协议发起请求。

---

## 📦 安装

1. 安装浏览器扩展：[Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox）或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 安装脚本：
   - 方式一：打开本仓库的 `notion-feishu-obsidian-clipper.user.js` 原始文件页（Raw），Tampermonkey 会弹出安装确认。
   - 方式二：复制脚本全文 → 新建用户脚本 → 粘贴保存。
3. 打开任意网页，右下角出现悬浮按钮 ✂️ 即安装成功。

> 脚本默认在所有网页启用，但会在**银行 / 邮箱 / 登录页 / 内网地址**自动停用，也可在设置中添加「禁用站点」黑名单。

---

## 🚀 快速开始

| 操作 | 说明 |
|---|---|
| 单击悬浮按钮 ✂️ | 进入选取模式 |
| 悬停 | 高亮目标元素（光标所在块级元素） |
| `↑` / `↓` | 放大 / 缩小选取范围 |
| 单击目标 | 提取内容，打开确认弹窗 |
| `Ctrl + Enter` | 发送到已启用平台 |
| `Esc` | 取消选取 / 关闭弹窗 |
| `➕ 追加` | 返回页面继续选取，合并进当前内容 |
| `Alt + Shift + N` | 任意页面唤起剪藏 |
| `Alt + 单击`（推文详情页） | 仅剪当前推文，跳过整线程会话 |
| 右键悬浮按钮 | 打开设置面板 |

**选取后确认弹窗**：可修改标题、编辑标签（逗号分隔）、预览内容、删除单个块（悬停块右上角 ❌）、复制为纯文本 / Markdown，再发送。

---

## ⚙️ 平台配置

> 打开设置面板（右键悬浮按钮），填写对应平台凭证后点「🔌 测试」即可验证连通性（无需先保存）。

### 📕 Notion

1. 在 [Notion Integrations](https://www.notion.so/my-integrations) 创建 Integration，获取 Token（`secret_...` 或 `ntn_...`）。
2. 在目标数据库的 **Connections** 中添加该 Integration。
3. 填表：`Integration Token`、`Database ID`（32 位 ID 或数据库链接）、`标签属性名`（可选，默认 `Tags`，不存在时自动创建）。
4. 可选属性自动填充：数据库中存在 `URL` / `Content Image` / `Icon` 类型的 `url` 属性时自动写入当前页信息。

### 🪁 飞书

1. 在 [飞书开放平台](https://open.feishu.cn/) 创建企业自建应用，开启**云文档**权限并发布。
2. 填表：`App ID`、`App Secret`、`文件夹 Token`（可选，不填则存到"我的空间"）。
3. 「测试」会真实创建并回收一篇测试文档，同时验证凭证与文件夹可写性。

### 💎 Obsidian

1. 安装 [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) 插件，启用 HTTP 端口（默认 `27123`）。
2. 在设置面板中**必须填写 API Key**（未配置则不会发起注定失败的上传）。
3. 填表：`API Base URL`（默认 `http://127.0.0.1:27123`）、`API Key`、`保存路径`（可选）。
4. 写入采用串行队列 + 自动重试；**永不覆盖**已有文件——同名时自动另存为带时间戳的新文件。

---

## 🎛️ 高级设置

| 设置项 | 说明 |
|---|---|
| 🚦 发送节奏 | `温和`（默认）：错峰 700ms · 图片并发 2 · 写入间隔 550ms；`标准`：300ms / 3 / 350ms |
| 🚫 禁用站点 | 每行或逗号分隔，支持 `example.com`（含子域）与 `*.example.com`（仅子域），命中则本脚本不启用 |
| 🏷️ 域名默认标签 | 每行 `域名=标签1,标签2`，发送前按当前站点（含子域）自动预填，手动输入优先 |
| 🔘 悬浮按钮 | 可拖拽、自动贴边收起（悬停唤出），位置与隐藏状态自动持久化 |

---

## 🌐 兼容的图片域名

内置 `@connect` 白名单覆盖常见图床，图片无需浏览器跨域即可直连下载：

知乎 `*.zhimg.com` · Twitter `*.twimg.com` · 微博 `*.sinaimg.cn` · B 站 `*.hdslb.com` · 微信 `*.qpic.cn` · 小红书 `*.xhscdn.com` · 抖音 `*.douyinpic.com` · 掘金 `*.byteimg.com` · 简书/CSDN `*.csdnimg.cn` · 掘金社区 `*.juejin.cn` · 少数派 `*.sspai.com` · 网易 `*.126.net` · Medium `*.medium.com` · Instagram `*.cdninstagram.com` · imgur / Giphy / Googleusercontent / GitHubusercontent / CloudFront / AWS S3 / WordPress 等，以及本机 Obsidian（`127.0.0.1` / `localhost`）。

未在列表中的域名会触发浏览器管理器的一次性授权询问，允许后即可正常下载。

---

## 🛡️ 安全与隐私

- **凭据仅存本地**：Token / Secret 通过 `GM_setValue` 存于脚本管理器本地存储，不经过任何第三方服务器；请勿在公共电脑保存。
- **敏感站点自停用**：银行、邮箱、支付、登录 / 管理后台、内网 / 云元数据地址等一律不注入。
- **SSRF 防护**：图片下载前校验目标地址，私有 IPv4 / IPv6（含 `[::1]` 环回）直接拒绝。
- **无 XSS 面**：网页内容全部经 `textContent` 注入渲染，链接仅接受 `http(s)` 协议。
- **发送期间防误关**：写入过程中拦截页面关闭 / 刷新，避免半截内容。

---

## 🧩 常见问题（FAQ）

| 问题 | 说明 |
|---|---|
| 提示"弹窗被阻止" | 脚本优先 `window.open` 打开成功页；被浏览器拦截时自动改为复制链接，粘贴到地址栏即可 |
| Obsidian 写入报 HTTP 500 | 多为保存路径文件夹不存在；重试会自动探测，文件已存在时永不覆盖、另存新名 |
| Obsidian 报 HTTP 423 | 该笔记正在 Obsidian 中被编辑锁定，稍后重试即可 |
| 飞书图片上传失败 | 自动降级为「🖼️ 图片: 链接」文本块，正文不受影响 |
| 发送部分成功 | 失败平台保留在弹窗中，点「🔄 重试」仅补发失败项，已成功平台结果不丢失 |
| 内嵌 base64 图片 | 飞书会上传为真实图片；Notion 不支持，显示占位说明；Obsidian 跳过并提示 |

---

## 📜 版本历史

- **v5.7.1** — 修复 Ctrl+Enter 连按导致整份内容双发；修复 IPv6 内网地址绕过 SSRF 防护；Twitter 会话提取增规模护栏 + `Alt+单击` 单条模式；平台未配置时不再残留选取模式；失败弹窗「复制 Markdown」扩展至任意平台；坏图 30s 负缓存；Obsidian 写入重试幂等化（防换名双写）；补充 CSDN / 掘金 / 少数派 / 网易图床白名单；多项防御性加固。
- **v5.7.0** — 新增「发送节奏」档位（温和 / 标准）；修复弹窗被阻止误报；Obsidian 未配置 API Key 不再默认发送；深层 DETAILS / 列表递归深度护栏；Markdown front matter 补转义。
- **v5.6.0** — 选取模式 ↑/↓ 调整范围；新增「禁用站点」黑名单与「域名默认标签」。
- **v5.5.0** — 修复监听累积泄漏、重试后快捷键失效、PRE/TABLE 悬停被外层抢占；复制 / Markdown 补齐表格与折叠块；推文正文剔除操作栏计数；图片缓存增总字节上限；新增追加模式、发送中防误关页面、进度条单调推进、重试保留已成功平台。

---

## 🤝 贡献

欢迎提交 Issue（适配新站点 / 新图床 / Bug 复现）与 Pull Request。代码为单文件 userscript，改动请遵循既有惯例：**每个修复附带 `vX.Y.Z` 行内注释**，并在 `@description` 中追加变更说明。

## 📄 License

[MIT](./LICENSE) © yuhauang
