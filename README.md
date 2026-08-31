# PT 自动签到 · MoviePilot AI

一个面向 Tampermonkey（油猴）的 PT 站点签到助手。脚本可在支持的 PT 站点页面中定时执行签到，通过 MoviePilot Agent 识别验证码，并在签到成功后调用 MoviePilot MsgNotify 发送通知。

> 当前版本：`4.3.5`

## 主要功能

- 支持多个 PT 站点的签到状态检测与自动签到。
- 支持标准五段 Cron 表达式。
- 使用 MoviePilot Agent 识别字符验证码和 U2 选择题验证码。
- 签到成功后通过 MoviePilot MsgNotify 插件发送通知。
- 在页面中显示可折叠、可拖动的 PT 助手面板。
- 显示当日签到状态、奖励、下次执行时间和倒计时。
- 支持手动立即签到、验证码识别、通知测试和 Prompt 自定义。
- 对当日签到成功状态和通知进行缓存及去重。

## 支持的站点

| 站点 | 自动签到 | AI 验证码 |
| --- | --- | --- |
| HHCLUB | 支持 | 不需要 |
| HDDolby | 支持 | 不需要 |
| HDSky | 支持 | 支持 |
| OpenCD（皇后） | 支持 | 支持 |
| U2 | 支持 | 支持选择题验证码 |

## 安装

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开项目中的 `PT浏览器签到-MoviePilot通知版.js`。
3. 将脚本内容复制到 Tampermonkey 的新脚本编辑器中并保存。
4. 打开任意支持的 PT 站点，右侧将出现“PT 助手”面板。

## MoviePilot 配置

在 PT 助手面板中填写：

- **地址**：MoviePilot 服务地址，例如 `http://192.168.1.10:3000`。
- **Agent Path**：默认为 `/api/v1/message/agent/stream`。
- **MsgNotify API Key**：MoviePilot MsgNotify 插件使用的 API Key。

Agent Bearer Token 由脚本从 MoviePilot 页面的登录状态自动同步。当前源码中的代理地址为：

```text
http://192.168.5.6:3000
```

如果你的 MoviePilot 地址不同，需要先修改脚本中的 `MP_PROXY_ORIGIN`，并同步调整油猴元数据中对应的 `@match`。

## Cron 配置

默认表达式：

```cron
0 8 * * *
```

表示每天 08:00 执行。其他示例：

```text
*/10 * * * *   每 10 分钟执行
30 9 * * 1     每周一 09:30 执行
0 8 1 * *      每月 1 日 08:00 执行
```

### 运行限制

Cron 由浏览器页面中的油猴脚本驱动，不是服务器后台任务。计划时间到达时，至少需要保持对应 PT 站点的页面打开，且浏览器没有完全终止该页面的运行。

## 签到流程

```text
Cron 到期
  → 跳转站点签到页
  → 检查当日签到状态
  → 打开签到入口
  → 必要时调用 MoviePilot Agent 识别验证码
  → 填写并提交
  → 检测签到成功
  → 发送 MoviePilot 通知
```

## 数据与安全

- 配置、签到缓存和 Token 保存在 Tampermonkey 的脚本存储中。
- 脚本申请了 `GM_xmlhttpRequest` 和 `@connect *`，用于访问自建 MoviePilot 服务及验证码图片。
- 请只安装你自己检查过的脚本，不要公开分享 MoviePilot API Key 或 Bearer Token。
- 项目源码不包含实际 API Key 或 Token。

## 问题排查

### Cron 到期后没有执行

- 确认已勾选“自动签到”并点击“保存”。
- 确认 Cron 描述和下次执行时间正确。
- 确认相应站点页面在执行时仍然打开。
- 检查 PT 助手面板中的运行状态。

### 签到成功但没有通知

- 使用“测试通知”检查 MoviePilot 地址和 MsgNotify API Key。
- 确认 MoviePilot MsgNotify 插件已启用。
- 查看面板是否显示 MoviePilot 通知失败的具体原因。

## 项目文件

- `PT浏览器签到-MoviePilot通知版.js`：Tampermonkey 主脚本。
- `README.md`：项目介绍和使用说明。

## 免责声明

本项目仅供学习和个人自动化使用。使用前请确认符合相应站点的规则，使用者需自行承担由此产生的风险。
