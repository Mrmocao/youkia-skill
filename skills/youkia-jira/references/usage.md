# 入口、登录与实时查询

使用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File` 调用入口，只影响本次子进程，不修改系统执行策略。不要直接双击脚本或永久更改 PowerShell 策略。

以本技能的绝对路径调用 `jira.ps1`。下面的 `$jiraEntry` 由调用方设置为实际绝对路径；不要照搬示例安装目录。Windows PowerShell 5.1、Windows x64 桌面环境可用。优先使用本机 Python 3.12+；找不到时校验并解压随包 Python 3.14.8，不联网安装、不改 PATH。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry startup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry login
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry login --base-url 'http://new-jira.example:8080'
```

`startup` 不开窗口：`needs_login` 表示需要调用 `login`；`needs_project_selection` 含当前身份、网站、解析 IP 和实时项目列表。DNS 无结果时显示“IP 暂无法解析”，不要沿用旧 IP。端口另列，不把 IP 拼成新的认证地址。

首次话术示例（括号内容用实际结果替换）：

> 欢迎使用 youkia JIRA助手。可以查询任务、处理 Bug、修改与流转任务，以及生成项目报告。当前 Jira 网站：[当前网址](当前网址)，解析 IP：当前结果，端口：当前结果。支持更换网站；接下来打开登录窗口，可选择账号密码或 Token 登录。

说完立即执行 `login`，保持工具进程存活并等待用户填完。建议一次工具等待 10–30 秒，有运行会话就继续轮询；窗口保持期间不以最终答复结束本轮。用户明确暂停时停止轮询并妥善关闭本轮窗口，不自行继续尝试。用户取消后不要再次自动弹窗。成功后简述身份和当前可见项目；项目选择只留对话内，已指定则直接查。

Token 指 Jira Server/Data Center 的个人访问令牌（PAT），请求使用 Bearer。它不是密码，也不是由助手凭空生成的字符串。用户自行从站点个人设置取得；无 PAT 入口时按该站点能力处理。此实现不把 Jira Cloud 的邮箱/API Token 冒充 Server PAT，也不绕过 SSO、验证码或权限。

凭证在默认 `state/connection.bin` 中以当前 Windows 用户 DPAPI 加密。文件只包含网址与认证信息，换 Windows 用户/机器后要重新登录。默认不导入现有全局配置。高级集成可显式把所有模块指向同一个认证目录：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry --state-dir 'C:\YourProject\.local\jira-auth' startup
```

全局 `--state-dir` 必须放在命令之前；也可设置进程环境变量 `youkia_jira_state`。它不是项目缓存目录。离线演示、技能抽取、ZIP 解压不要求登录。

## 查询

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry projects
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry project DFW
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry search --jql 'project = DFW ORDER BY updated DESC' --limit 50
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry pending-bugs --project DFW
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry issue DFW-123 --all-comments --history
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry meta create --project DFW
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry meta create --project DFW --type 'sub-bug'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry meta edit --issue DFW-123
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry meta transitions --issue DFW-123
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry meta fields
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry meta links
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry api-read '/rest/api/2/project/DFW/versions'
```

`DFW-123` 仅表示示例格式，不代表现有任务。`project` 返回该项目详情、类型工作流、当前权限，按需使用。`search` 默认仅取一页且上限 100；`--all --limit 1000` 自动分页至指定上限（最高 10000）。务必检查 `total`、`returned`、`complete`；截断时不得称“全部”。分页期间数据可能变化，写入前重新读目标。任务的 `history_complete` 为 false 时历史摘要不完整，按需探查该站点的分页历史接口。

`pending-bugs` 动态识别项目中的 Bug/sub-bug/缺陷类型及“已解决/Resolved”状态，并按解决结果分组；不把“不解决”等同已修复，不自动改变任务。非此语义的站点返回 `WORKFLOW_MAPPING_REQUIRED`，根据实际工作流和用户意图改用 JQL。

输出为 UTF-8 JSON：`ok/data` 或 `ok/error`。退出码 0 表示命令正常返回（含需登录或用户取消）；2 表示前置/接口错误；3 表示部分执行、结果未知或需复核。调用方同时读取 `state`，不要只根据进程退出码宣称业务已完成。
