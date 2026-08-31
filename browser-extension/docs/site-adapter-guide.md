# PT 站点接入规范

本文档定义浏览器扩展的站点接入边界、适配器协议、注册步骤和验收标准。新站点必须遵循本规范，不得将站点专用 DOM 逻辑写入后台调度器、通用内容运行器或设置页。

## 1. 职责边界

| 模块 | 职责 | 不应包含 |
| --- | --- | --- |
| `src/sites/catalog.js` | 站点名称、域名、签到入口和功能标记 | DOM 查询、点击步骤 |
| `src/sites/<site>.js` | 状态检测、页面操作、结果提取 | Cron、标签页管理、MoviePilot 凭据 |
| `src/content/runner.js` | 调用适配器，执行统一动作协议 | 任何站点选择器 |
| `src/background/service.js` | Cron、任务持久化、标签页、Agent 和通知 | 任何站点 DOM 逻辑 |
| `src/shared/config.js` | 默认站点开关、Cron、Prompt 和 MoviePilot 配置 | 页面执行状态 |
| `public/manifest.json` | 站点权限与内容脚本匹配范围 | 站点业务规则 |

## 2. 站点 ID 和文件命名

- ID 只使用小写字母、数字和短横线，例如 `chdbits`。
- ID 必须在以下位置保持一致：
  - `catalog.js` 的对象键和 `id`。
  - `config.js` 的 `sites` 对象键。
  - 适配器的 `id`。
  - `sites/index.js` 的导出键。
- 适配器文件名使用站点 ID，例如 `src/sites/chdbits.js`。
- 站点展示名只放在 `catalog.js` 的 `name` 字段中。

## 3. 站点清单

在 `src/sites/catalog.js` 增加：

```js
example: {
  id: 'example',
  name: 'ExamplePT',
  hosts: ['example.com', 'www.example.com'],
  matches: ['https://example.com/*', 'https://www.example.com/*'],
  attendanceUrl: 'https://example.com/attendance.php',
  needsAgent: false,
  hasPrompt: false
}
```

字段要求：

- `hosts`：与 `location.hostname` 精确匹配，需要列出带 `www` 和不带 `www` 的实际域名。
- `matches`：Chrome Match Pattern，同时用于查找可复用标签页。
- `attendanceUrl`：后台启动任务时打开的稳定入口。
- `needsAgent`：站点是否需要 MoviePilot Agent。
- `hasPrompt`：设为 `true` 时，设置页自动显示本站 Prompt 输入框。

## 4. 适配器接口

每个适配器默认导出一个对象：

```js
export default {
  id: 'example',
  hosts: ['example.com', 'www.example.com'],

  async run(task, ctx) {
    // 返回一个统一动作
  }
}
```

### `task`

任务由后台创建并跨页面保存，适配器只读使用：

```js
{
  siteId: 'example',
  source: 'cron' | 'manual',
  state: 'pending',
  startedAt: 0,
  reloads: 0,
  steps: 0,
  stage: 'navigate' | 'reload' | 'wait' | 'submitted'
}
```

- `reloads`：已执行的刷新次数，用来防止无限刷新。
- `steps`：运行器已记录的步骤数，用来限制轮询。
- `stage`：上一个动作的阶段标记。提交后建议统一使用 `submitted`。

适配器不得修改 `task`，需要更新阶段时通过返回 `wait.step` 由运行器记录。

### `ctx`

当前提供 MoviePilot Agent 调用：

```js
const text = await ctx.askAgent(imageUrl, prompt)
```

- 文本题把 `imageUrl` 传空字符串。
- 图片必须是当前站点的绝对 URL。
- Prompt 必须在本站适配器中构造，不得读取其他站点的 Prompt。
- 适配器负责校验 Agent 返回值是否匹配验证码或候选项。

## 5. 统一动作协议

### 签到成功

```js
return {
  action: 'success',
  result: {
    checked: true,
    status: '签到成功',
    bonus: '10 魔力值'
  }
}
```

- `result` 必须可被结构化克隆。
- 不得包含 DOM 元素、函数、`Window` 或循环引用。
- 没有奖励时 `bonus` 传空字符串，通知不会显示奖励项。

### 跳转页面

```js
return { action: 'navigate', url: 'https://example.com/attendance.php' }
```

- URL 必须属于本站 `matches`。
- 跳转后新页面内容脚本通过后台任务继续执行。

### 刷新页面

```js
if ((task.reloads || 0) < 1) return { action: 'reload' }
```

必须根据 `task.reloads` 设定上限，禁止无条件返回 `reload`。

### 等待页面状态

```js
return {
  action: 'wait',
  step: 'submitted',
  delay: 1200
}
```

- `delay` 单位为毫秒。
- 提交表单或点击确认按钮后使用 `submitted`。
- 必须根据 `task.steps` 设定等待上限，超限后返回 `failure`。

### 签到失败

```js
return {
  action: 'failure',
  error: '未找到签到按钮'
}
```

错误信息必须包含具体站点元素或失败阶段，不要只写“执行失败”。

## 6. 状态检测原则

1. `run()` 进入后必须先检测是否已签到，保证幂等。
2. 仅使用明确的成功文字、状态类名或站点确认对话框。
3. 按钮消失不能单独作为签到成功依据。
4. 签到前、页面跳转后和提交后都应重新检测成功状态。
5. 结果文本对空白和简繁体有差异时，应使用受限的正则表达式，避免匹配整个页面的普通文字。

## 7. Agent 站点规范

- 不需要识图或答题的站点不得调用 `ctx.askAgent()`。
- 字符验证码必须经过 `getCaptcha()` 或等价的受限解析，不得将 Agent 整段输出直接填入。
- 选择题只允许匹配当前 DOM 中实际存在的候选项。
- 匹配失败必须停止提交并返回 `failure`。
- 自定义 Prompt 放在 `config.sites[siteId].prompt`，仅当 `catalog.hasPrompt` 为 `true` 时由设置页显示。
- Agent Bearer Token 和 Agent Path 是 MoviePilot 全局配置，适配器不得直接读取或输出 Token。

## 8. 完整接入步骤

1. 在 `public/manifest.json` 的 `host_permissions` 中加入站点域名。
2. 在 `content_scripts[0].matches` 中加入站点域名。
3. 在 `src/sites/catalog.js` 注册站点元数据。
4. 在 `src/shared/config.js` 添加默认开关、Cron 和可选 Prompt。
5. 创建 `src/sites/<site>.js`。
6. 在 `src/sites/index.js` 导入并注册适配器。
7. 执行 `pnpm run check`。
8. 执行 `pnpm run dev`，在已登录站点中测试“立即签到”。
9. 设置一个未来 2–3 分钟的 Cron，验证后台自动打开标签页。
10. 验证已签到时不会再次提交，但“立即签到”仍会产生执行结果。

## 9. 适配器模板

```js
function detectStatus() {
  const checked = Boolean(document.querySelector('.signed'))
  return {
    checked,
    status: checked ? '签到成功' : '未签到',
    bonus: ''
  }
}

export default {
  id: 'example',
  hosts: ['example.com'],

  async run(task, ctx) {
    const result = detectStatus()
    if (result.checked) return { action: 'success', result }

    if (location.pathname !== '/attendance.php') {
      return { action: 'navigate', url: 'https://example.com/attendance.php' }
    }

    if (task.stage === 'submitted') {
      if ((task.steps || 0) < 6) {
        return { action: 'wait', step: 'submitted', delay: 1200 }
      }
      return { action: 'failure', error: '等待 ExamplePT 签到成功状态超时' }
    }

    const button = document.querySelector('#attendance-submit')
    if (!button) return { action: 'failure', error: '未找到 ExamplePT 签到按钮' }

    button.click()
    return { action: 'wait', step: 'submitted', delay: 1200 }
  }
}
```

## 10. 验收清单

- [ ] 清单 ID、配置 ID、适配器 ID 和注册键完全一致。
- [ ] `hosts` 与适配器声明完全一致，`tests/sites.test.js` 通过。
- [ ] Manifest 同时包含站点权限和内容脚本匹配项。
- [ ] 未登录或页面结构异常时能返回明确错误，不会无限刷新。
- [ ] 已签到检测使用明确标识，不会重复提交。
- [ ] `success.result` 不包含 DOM 元素或函数。
- [ ] 没有奖励时 `bonus` 为空字符串。
- [ ] Agent 输出无法匹配时不会提交表单。
- [ ] “立即签到”、Cron、页面跳转续跑和结果通知均已验证。
- [ ] `pnpm run check` 全部通过。

