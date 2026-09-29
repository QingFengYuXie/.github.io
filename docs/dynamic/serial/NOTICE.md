# 串口终端来源说明

本站串口调试功能移植自 [itldg/web-serial-debug](https://github.com/itldg/web-serial-debug)，参考版本为 `c0fc58b9fe9f197f1b660e207c2af237c4cbdc47`。上游采用 Apache License 2.0，完整许可证保留在本目录的 [LICENSE](LICENSE)。上游该版本未提供 NOTICE 文件，本文件为本站新增的来源说明。

本站修改：使用本站原生界面与独立串口控制器；保留串口参数、本地设置保存、收发日志、文本与 HEX 发送；移除右侧指令集、配置文件导入导出和重置、自定义脚本，以及 Bootstrap、CodeMirror 和统计脚本。连接、读写清理、错误处理和日志展示按本站需要进行了调整。修改后的应用源文件注明移植来源。

## 第三方组件

- `vendor/ansi_up.min.js`：ansi_up 5.1.0，用于 ANSI 彩色日志，原样保留上述 web-serial-debug 版本中的文件。其原始项目为 [drudru/ansi_up](https://github.com/drudru/ansi_up/tree/v5.1.0)，Copyright (c) 2011 Dru Nelson，采用 MIT License；原始许可证保留在 [vendor/ansi_up.LICENSE](vendor/ansi_up.LICENSE)。
- `ansi_up.min.js` 的 SHA-256：`6314fe210a24aceabe5eb9b9fdc8e496c4c6f33a4caea903a3e9692eb81b73ab`。

## 文本编码

`serial-encoding.mjs` 为本站新增的 UTF-8 / GB2312 编解码适配。UTF-8 使用浏览器原生编码器；GB2312 使用本地 `gb2312-table.mjs` 中的字符映射，严格限定 GB2312 字符集，不使用浏览器中会映射到 GBK 的 `gb2312` 标签。浏览器编码标签及 `TextEncoder` 仅支持 UTF-8 的行为见 [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/)。

映射由 Python 3.11 标准库 `gb2312` 编解码器生成：按首字节 `A1–F7`、尾字节 `A1–FE` 顺序，对每个双字节组合执行严格解码；成功的 7,445 个字符存入对应位置，未分配位置以 `U+FFFD` 标记。该文件只含字符映射数据，没有复制 Python 实现代码；页面运行不需要 Python 或其他外部服务。GB2312 发送遇到字符集外的字符会明确报错，接收损坏或不完整的字节序列以替换字符显示。

页面所需脚本、样式与 ANSI 库均由本站提供，不依赖外部 CDN。
