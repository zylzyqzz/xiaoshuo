# 私人小说阅读站

一个不需要登录的小说阅读网站：前端只阅读，后端导入 TXT/Markdown。

## 本地运行

```bash
npm start
```

打开：

- 阅读页：http://localhost:3000/
- 导入页：http://localhost:3000/import.html

## 部署

把整个 `novel-reader-app` 目录上传到支持 Node.js 的服务器或平台，运行：

```bash
npm start
```

数据保存在 `data/library.json`。导入页没有登录保护，公开部署时建议给 `/import.html` 或整个站点加一层服务器访问限制。
