# 清风余写 · 个人博客

这是一个无需构建工具的静态个人博客，可以直接使用 GitHub Pages 部署。

## 本地预览

直接用浏览器打开 `index.html`，或者使用 VS Code 的 Live Server 预览。

## 发布到 GitHub Pages

1. 将本目录内容推送到 `QingFengYuXie/.github.io`。
2. 在仓库的 **Settings → Pages** 中选择 `Deploy from a branch`。
3. 选择 `main` 分支和 `/ (root)` 目录。
4. 在 **Custom domain** 中填写 `qfyx.top`。

## 写新文章

当前版本是轻量静态首页，文章卡片内容直接写在 `index.html` 中。后续如果文章数量增加，可以升级为 Astro、Hugo 或 Jekyll，让文章使用 Markdown 管理。
