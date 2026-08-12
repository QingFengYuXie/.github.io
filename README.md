# 轻风雨斜 OS · 个人空间

一个程序员的个人主页、作品集与博客，使用纯 HTML、CSS 和 JavaScript 构建，可直接部署到 GitHub Pages。

## 本地预览

直接打开 `index.html`，或使用 VS Code 的 Live Server 预览。

## 部署

- GitHub Pages 来源：`main` 分支的 `/ (root)` 目录
- 自定义域名：`qfyx.top`
- 头像：`assets/avatar.jpg`

## 内容位置

- 个人介绍、作品和 OS 博客结构：`index.html`
- 页面样式：`styles.css`
- 启动页、桌面与页面导航：`script.js`
- OS 博客搜索、筛选、分页、文章详情、Markdown 和评论：`blog.js`

## 发布 OS 博客文章

1. 在本仓库新建一个 GitHub Issue。
2. Issue 标题就是文章标题，正文使用 Markdown。
3. 至少添加一个标签；没有标签的 Issue 不会发布。
4. 保存后，`Sync OS Blog` Action 会自动更新 `blog-data.json` 和 `feed.xml`。
5. 编辑、关闭、重新打开、加减标签或更新评论，也会自动同步。

置顶文章可以添加 `置顶` 或 `pinned` 标签。评论使用 Utterances，文章 RSS 地址为 `https://qfyx.top/feed.xml`。
