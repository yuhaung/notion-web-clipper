# Notion Web Clipper

一个强大的 Tampermonkey 用户脚本，让你在任意网页上**悬停高亮 + 单击**，将文字、图片、视频一键剪藏到 Notion 数据库。

## 功能特点

- 🖱️ **智能选取**：鼠标悬停自动高亮段落或媒体，单击提取
- 🎥 **图文视频混合剪藏**：支持标题、列表、引用、代码块等排版
- 🇨🇳 **知乎优化**：自动清除按钮、推荐、会员图标，动图转为视频
- 🐦 **Twitter 优化**：详情页一键剪藏主推文 + 全部回复
- 🧹 **智能过滤**：自动跳过头像、小图标、表情符号
- 📋 **自动属性填充**：可填入页面标题、URL、主图、网站图标
- 🧲 **可拖拽按钮**：右下角按钮可拖动贴边，半透明隐藏，悬停弹出，位置记忆
- 📦 **分批发送**：内容超过 100 块自动分批，避免 API 报错
- 🔒 **安全无干扰**：UI 封装在 Shadow DOM 内，不影响网页原有功能

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击下面的链接安装脚本：
   - [从 GreasyFork 安装](https://greasyfork.org/zh-CN/scripts/584654-notion-web-clipper)
   - [从 GitHub 安装](https://raw.githubusercontent.com/yuhaung/notion-web-clipper/main/notion-web-clipper.user.js)

## 配置

1. 右键点击右下角 ✂️ 按钮 → 打开设置
2. 填入 [Notion Integration Token](https://www.notion.so/my-integrations)
3. 填入你的 Database ID（32 位字符串）
4. （可选）在数据库中创建 `URL`、`Content Image`、`Icon` 等 URL 属性，脚本会自动填充

详细配置说明见 [使用说明书](#) （可链接到你的说明文档）

## 使用方法

1. 左键点击 ✂️ 进入选择模式
2. 悬停高亮内容，单击选取
3. 在弹窗中确认标题、标签，点击发送
4. 成功后可直接打开 Notion 页面

## 常见问题

- **按钮不见了？** 检查是否被其他油猴脚本遮挡，或刷新页面。
- **发送失败 400 错误？** 脚本已支持自动分批发送，更新到最新版即可。
- **知乎动图变静态？** 动图会被转为视频块，Notion 中可正常播放。
- **Twitter 没有回复？** 请在推文详情页（URL 含 `/status/`）点击剪藏。

## 许可证

MIT License

## 反馈与支持

- [GitHub Issues](https://github.com/yuhaung/notion-web-clipper/issues)
- [GreasyFork 反馈](https://greasyfork.org/zh-CN/scripts/584654-notion-web-clipper/feedback)
