# PT 签到助手（浏览器扩展）

这是从 Tampermonkey 脚本迁移的 Manifest V3 浏览器扩展。当前版本为 `0.2.0`。

## 构建

需要 Node.js 20 或更高版本，在本目录执行：

```powershell
pnpm install
pnpm run build
```

构建完成后会生成 `dist/`。

### 开发环境热更新

```powershell
pnpm run dev
```

第一次启动开发模式后，需要在扩展管理页手动重新加载一次 `dist/`，让开发版运行。之后：

- 修改 `src/` 会自动重新打包。
- 修改 `public/` 会自动复制新的静态文件。
- 扩展会自动执行 `chrome.runtime.reload()`。
- 已打开的 HDDolby 页面会自动刷新，以加载新内容脚本。

热更新仅在 `pnpm run dev` 生成的开发版中启用，`pnpm run build` 生成的正式版不会轮询构建状态。

## 安装

1. 在 Chrome 或 Edge 中打开扩展管理页。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展”。
4. 选择构建生成的 `browser-extension/dist` 文件夹，不要选择源码根目录。
5. 点击工具栏中的扩展图标，打开设置页。

## 当前能力

- 每分钟由扩展后台检查五段 Cron。
- Cron 到期后自动打开或复用对应站点页面。
- 页面跳转后继续同一个签到任务。
- 记录最近的执行状态。
- 可选的 MoviePilot 执行结果通知。
- 通过 MoviePilot Agent 识别验证码或回答签到题目。

## 支持站点

| 站点 | 签到方式 |
| --- | --- |
| HHCLUB | 日历签到按钮 |
| HDDolby | 签到页跳转 |
| HDSky | Agent 识别字符验证码 |
| OpenCD（皇后） | Agent 识别 iframe 字符验证码 |
| U2 | Agent 识别图片并选择候选作品 |
| CHDBits | Agent 回答每日单选题 |

## 站点接入

完整规范见 [`docs/site-adapter-guide.md`](docs/site-adapter-guide.md)。

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
