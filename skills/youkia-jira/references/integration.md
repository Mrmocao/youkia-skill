# 抽取与集成

完整技能可直接复制到目标项目 `.agents/skills/youkia-jira` 或当前用户的技能目录。安装的是技能和运行依赖，不是源机器登录状态。用户要求集成时先检查目标同名技能，避免覆盖既有实现。

推荐从本包入口导出到目标项目的技能目录：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry export --destination 'C:\YourProject\.agents\skills' --modules assistant
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry export --destination 'C:\AnotherProject\.agents\skills' --modules operations workflow reports diagnostics
```

| 模块 | 输出目录 | 适合 |
| --- | --- | --- |
| assistant | youkia-jira | 完整自然语言助手 |
| operations | youkia-jira-operations | 查询、创建、修改、指派、关联、附件 |
| workflow | youkia-jira-workflow | Bug/优化/验收流转 |
| reports | youkia-jira-reports | 实时摘要和本地报告 |
| diagnostics | youkia-jira-diagnostics | 日志附件读取与本地 trace 分析 |

每个导出技能有自己的 `SKILL.md`、入口、认证模块、所需源码和嵌入式 Python，可单独部署。导出时校验源文件 SHA256，拒绝覆盖目标；排除 `state/`、`runtime/`、缓存和用户报告。选用模块以明确职责；公共 API 核心会随依赖复制，并非权限隔离或功能沙箱。只部署实际需要的技能以避免重复触发。

多个模块可通过显式 `--state-dir` 共用宿主认证目录；默认各自首次登录。宿主负责对话内的项目选择与授权，禁止把查询选项自动写成默认项目。不得把 DPAPI 凭证放入 Git、包或报告。

源码集成：`scripts/core.py` 提供 `JiraClient` 和类型化 `JiraError`，`operations.py` 提供 `plan/execute/batch`。认证也可由宿主在进程内构造 profile，不能经命令行明文传密码/Token。不要新增全局配置回退。脚本使用 Python 标准库，REST 业务逻辑可以复用；原生登录与 DPAPI 部分限 Windows。

`manifest.json` 记录版本和分发文件散列。抽取依赖来自清单，因此修改后由维护者重建清单再分发，不能通过忽略校验来混入运行状态。模块不承诺在本包之外自动访问其他工具。
