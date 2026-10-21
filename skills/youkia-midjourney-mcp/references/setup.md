# 安装、配置与无消费验收

## 先检查已有状态

阅读上游当前 README、INSTALL、SECURITY 和关键源码：https://github.com/thenavidm/midjourney-mcp-cli 。本指南的已测基线是 2.0.1；新版本应复核浏览器连接、确认机制和配置变量。

检查 Node.js >=22、Chrome 可执行文件、操作系统、Codex 桌面版实际内置后端版本、现有 MCP 配置及目标端口占用。PATH 上的独立 Codex CLI 可能与桌面版不同，不可单凭 CLI 的版本推断桌面兼容性。Node 22 是上游使用内置 WebSocket 的最低要求。

先复用可用安装；新安装建议放在独立运行目录，固定已审阅的包版本并保存 lockfile，避免每次启动自动拉取 latest。可在新运行目录创建下列 package.json，再执行 `npm install --ignore-scripts`：

```json
{
  "name": "youkia-midjourney-local-runtime",
  "version": "1.0.0",
  "private": true,
  "dependencies": { "@thenavidm/midjourney-mcp-cli": "2.0.1" },
  "overrides": { "@thenavidm/slipway": "0.1.17" }
}
```

Slipway 固定版本用于复现本次验证环境，不是所有未来版本的通用要求。升级时重新评估兼容性与审计结果；不要向用户现有项目强加 dependency overrides。执行 `npm audit --omit=dev` 并解释实际报告，“未发现已知漏洞”不等于完整安全审计。

## 只读配置模板

Codex 通常读取 `$CODEX_HOME/config.toml`，未设置 CODEX_HOME 时为用户目录的 `.codex/config.toml`；确认实际配置和项目覆盖。先备份，再添加或更新以下块。所有尖括号路径必须替换成实际绝对路径，不能原样运行；TOML 路径建议用正斜杠。

```toml
[mcp_servers.midjourney]
command = "<ABSOLUTE_NODE_EXECUTABLE>"
args = ["<ABSOLUTE_RUNTIME_DIR>/node_modules/@thenavidm/midjourney-mcp-cli/dist/npx.js"]
startup_timeout_sec = 30
tool_timeout_sec = 660

[mcp_servers.midjourney.env]
MIDJOURNEY_READ_ONLY = "1"
MIDJOURNEY_ALLOW_DESTRUCTIVE = "0"
MIDJOURNEY_CONFIRM = "human"
MIDJOURNEY_CDP_URL = "http://127.0.0.1:<LOCAL_DEBUG_PORT>"
MIDJOURNEY_CHROME_PATH = "<ABSOLUTE_CHROME_EXECUTABLE>"
MIDJOURNEY_CHROME_PROFILE = "<ABSOLUTE_DEDICATED_PROFILE_DIR>"
MIDJOURNEY_CHROME_LAUNCH = "1"
MIDJOURNEY_HEADLESS = "0"
MIDJOURNEY_MAX_RETRIES = "0"
MIDJOURNEY_ORIGIN = "https://www.midjourney.com"
```

端口可以选择空闲的 19222，但必须先检查冲突。调试端口仅本机监听；不开放公网，不启用无关 HTTP MCP 服务。专用 profile 可选用户目录下 `.midjourney-mcp/chrome-profile`，不可使用日常 Chrome 默认配置目录。

Windows 优先指定 node.exe 和 `dist/npx.js` 的绝对路径，避免桌面进程 PATH、空格路径和 npx 多 binary 选择差异。该入口会规范化服务器启动名；不要随意替换成其他 index 入口。

配置文件和辅助终端进程的环境变量彼此独立。手动执行 CLI 时，需要在该进程加载与 MCP 一致的 `MIDJOURNEY_*` 变量，尤其 CDP_URL 和 CHROME_PROFILE。不要因为终端成功就认定桌面 MCP 已加载同一套设置。

## 引导本地登录

2.0.1 通过 CDP HTTP 端点连接 Chrome，不通过浏览器扩展附着到任意已有标签页。日常 Chrome 已登录也不代表此 MCP 已登录；仅提供网页 URL 无法取得该浏览器会话。

Chrome 136+ 限制对默认用户数据目录使用远程调试端口。通常需要专用配置目录并重新登录**原来的同一个 Midjourney 账号**，不需要注册新账号。先向用户解释。若用户拒绝新窗口，将自动启动设为 0，并说明当前浏览器连接能力的限制；不要强行启动或复制日常 profile。

在加载了相同环境变量的 PowerShell 中执行以下模板（替换实际路径）：

```powershell
& '<ABSOLUTE_NODE_EXECUTABLE>' '<ABSOLUTE_RUNTIME_DIR>/node_modules/@thenavidm/midjourney-mcp-cli/dist/npx.js' login
& '<ABSOLUTE_NODE_EXECUTABLE>' '<ABSOLUTE_RUNTIME_DIR>/node_modules/@thenavidm/midjourney-mcp-cli/dist/npx.js' doctor
```

让用户在打开的 Chrome 中访问 https://www.midjourney.com 并完成登录。`http://127.0.0.1:19222/` 是调试地址，**不是登录网页**。密码、验证码和 Cloudflare 验证均在本地完成。登录命令超时后不一定登录失败，保留窗口，待用户完成后运行只读检查。

## 验收与功能启用

1. 服务器层：MCP initialize、ping、tools/list 成功。记录版本与工具名，别把固定数量作为通用判断标准。
2. 浏览器层：whoami 检查 browser_running 和 signed_in。2.0.1 的 whoami 不自动启动 Chrome；关闭状态可运行 login，或在允许自动启动时使用一次其他只读调用。
3. 登录层：在登录完成后使用 get_queue 等受保护只读接口确认。whoami 基于页面状态推断，不能单独证明会话和订阅额度有效。GPU 余额与付费计划可在账号页核对。
4. 初装只读验收结束后明确报告结果；不调用 imagine、rerun、upscale 或其他消费工具。
5. 用户要求启用生成功能时才设置 READ_ONLY=0、ALLOW_DESTRUCTIVE=1，保留 CONFIRM=human。名称中的 DESTRUCTIVE 在本项目也覆盖付费生成。启用同时会恢复部分下载、风格板写入能力，但不意味着授权这些具体操作。
6. 重新加载服务器；客户端不支持热重载时重启 Codex，并在实际会话重新查询工具。重启前保存工作。切换开关或换新聊天后，检查有效审批策略允许提出确认请求。

660 秒超时用于覆盖上游默认 600 秒等待；网络与排队仍可能超过时限，按故障指南查询已有任务，不盲目重提。MAX_RETRIES=0 是本次避免不确定重试的保守设置，不替代代理自身的重复消费控制。

恢复只读时设置 READ_ONLY=1、ALLOW_DESTRUCTIVE=0 并重载。移除时仅删除对应 MCP 配置块；需要撤销网站登录则在专用浏览器退出。不要顺手删除其他配置或浏览器数据。
