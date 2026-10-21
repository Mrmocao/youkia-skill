# 版本、证据和验证边界

本技能 1.0.0，整理日期 2026-10-15。针对 thenavidm/midjourney-mcp-cli 的安装与 Codex 桌面协作流程；它不是 Midjourney 官方产品，也不捆绑账号、运行时或浏览器会话。

## 本次环境

| 项目 | 已测版本 |
|---|---|
| 上游包 | @thenavidm/midjourney-mcp-cli 2.0.1 |
| 上游源码 | c0ffb7c325639dfa50efa4b57def2119f1e623c1 |
| Slipway | 0.1.17 |
| Node.js | 24.11.1 |
| Google Chrome | 155.0.8059.40 |
| Codex 桌面内置后端 | 0.162.0-alpha.17.2 |
| 系统 | Windows |

独立 PATH CLI 另为 0.144.5，不能代表桌面内置后端。查看过 Slipway 0.1.24，但没有发现对应修复，也未将其作为本次运行依赖。解决确认故障不需要修改上游源码或升级依赖。

## 已完成的验证与未覆盖范围

| 检查 | 结果与含义 |
|---|---|
| MCP initialize / ping / tools/list | 通过，证明服务器协议及工具发现可用 |
| whoami + get_queue | 登录后通过，证明当前受控浏览器的受保护只读访问可用 |
| 配置保留 | 对照紧邻修改前的备份，目标 MCP 块以外配置保持不变 |
| CDP 监听 | 本机回环地址；未开放公网端口 |
| 四项隔离确认测试 | decline、cancel、accept 未勾选均阻止；accept 且 approve=true 才进入处理函数；测试禁止网络 |
| 实际 MCP 表单 | 切换聊天审批策略后出现并接收批准 |
| 无消费参数探针 | 批准后按预期触发本地无效比例错误，未提交图片任务 |
| 实际图片生成 | 曾在用户单独授权后通过 CLI 成功完成一个任务，返回四张候选 |
| 实际 MCP 读取与下载 | 成功读取既有任务并下载一张原图，SHA-256 与 CLI 原图一致 |
| 修复后新的付费 MCP 生成 | 未执行；不把确认测试或 CLI 成功夸大成付费 MCP 全链路实测 |
| npm audit | 当时未报告已知漏洞；不是完整安全审计或未来保证 |

### 无消费确认探针的边界

本次在审阅 2.0.1 的执行顺序后，使用 imagine 的无效 `aspect: "0:0"`，且不带 moodboard、profile、参考素材等选项，在人类批准后触发本地参数错误，以验证 elicitation 到处理函数的路径。没有提交生成任务。

这不是上游提供的 dry-run 功能，也不是通用测试命令。复用前必须重新审查所安装版本的确认与参数校验顺序，确保在任何网络调用和消费之前失败，并向用户说明测试目的。无法证明顺序时只用隔离测试和只读诊断，不调用生成工具探测。不得将真实有效的提示词试生成作为默认安装验收。

### 解释根因时保留条件

“never 自动拒绝非空表单”是本次客户端版本、有效会话策略和表单组合的实测结论。Codex 后续版本可能存在不同 elicitation 能力或例外处理；界面标签也会变化。诊断应依靠当前实现、实际策略和工具返回，不能照搬历史结论。

## 来源与许可

- 上游仓库与使用说明：https://github.com/thenavidm/midjourney-mcp-cli
- 固定提交安装说明：https://github.com/thenavidm/midjourney-mcp-cli/blob/c0ffb7c325639dfa50efa4b57def2119f1e623c1/INSTALL.md
- 固定提交安全说明：https://github.com/thenavidm/midjourney-mcp-cli/blob/c0ffb7c325639dfa50efa4b57def2119f1e623c1/SECURITY.md
- Codex elicitation 源码入口（会随 main 变化）：https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/elicitation.rs
- Codex MCP 官方文档：https://developers.openai.com/codex/mcp/ （本次环境读取返回 403，未宣称全文在线核实。）

本技能参考上游 MIT 文档和工具行为，补充本次 Windows/Codex 实测、错误分类和权限处理经验。原上游版权为 Copyright (c) 2026 NM Media；原许可证全文随包附于 LICENSE。未包含上游 node_modules、用户配置、凭据、图片和诊断原始记录。
