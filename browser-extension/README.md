# PT 签到助手（浏览器扩展）

这是从 Tampermonkey 脚本逐步迁移的 Manifest V3 浏览器扩展。当前首个可用站点是 HDDolby。

## 构建

需要 Node.js 20 或更高版本，在本目录执行：

```powershell
pnpm install
pnpm run build
```

构建完成后会生成 `dist/`。也可执行 `pnpm run dev` 在修改源码时自动重新构建。

## 安装

1. 在 Chrome 或 Edge 中打开扩展管理页。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展”。
4. 选择构建生成的 `browser-extension/dist` 文件夹，不要选择源码根目录。
5. 点击工具栏中的扩展图标，打开设置页。

## 当前能力

- 每分钟由扩展后台检查五段 Cron。
- Cron 到期后自动打开或复用 HDDolby 页面。
- 页面跳转后继续同一个签到任务。
- 记录最近的执行状态。
- 可选的 MoviePilot 执行结果通知。

## 站点接入

站点 DOM 逻辑放在 `src/sites/<site>.js`。每个适配器返回统一操作：

- `success`：已完成签到。
- `navigate`：前往签到页。
- `reload`：刷新一次签到页。
- `failure`：任务失败并记录原因。

后台可访问的站点元数据放在 `src/sites/catalog.js`，新增站点时同时注册适配器和 `public/manifest.json` 权限。

## 目录结构

- `src/`：后台、页面运行器、设置页逻辑和站点适配器源码。
- `public/`：清单、HTML 和 CSS 等静态资源。
- `scripts/build.mjs`：esbuild 构建入口。
- `tests/`：不依赖浏览器的核心逻辑测试。
- `dist/`：构建产物，浏览器实际加载此目录。
