# 使用与覆盖范围

版本 0.1.0。运行环境：Windows 10/11；系统 Python 3.12+ 或包内 x64 Python 3.14.8。标准库实现，无需 pip。服务器须已具备自己的 Erlang 环境；本包不包含游戏服务器、Unity、账号、Cookie 或游戏数据。

支持的首版启动链是根目录 BAT 中 `cd boot` 后调用 `start.bat %no_load_path% 节点名`，由 `boot/start.bat` 设置节点名和 Cookie 并启动 `boot/erlang/bin/werl.exe`。必须有唯一的 `erts-*/bin/epmd.exe`。未知格式不执行，报告需要适配。不是通用 Windows 服务或 Docker 管理器。

Unity 工程须已打开，安装 AnkleBreaker Unity MCP 插件并开放本机 HTTP 接口，支持 `ping`（含进程 ID）、`editor/state`、`editor/play-mode`。端口可配置，只接受 `localhost` 或 `127.0.0.1`。通过 PID、工程路径和实时 Play 状态核验。接口不可用时清档会停止，不能把超时或编辑器失联当作“已退出 Play”。本包不自动安装或修改插件。

## 对话启动

解压后对 Codex 说：

> 读取实际解压目录中的 youkia-local-server/SKILL.md，启动 youkia本地服务器操作并引导配置。

配置与任务均在 Codex 对话中完成。默认配置和每次操作记录存放在解压目录 `state`，跨对话复用。工具仅在 `%LOCALAPPDATA%/youkia-local-server/locks` 保存按目标目录生成的互斥锁文件，以避免同一用户的多个解压副本并发操作同一服务器；服务器仍应只由一个操作者管理。

本地配置包含机器路径、文件哈希、节点前缀及健康端口，不保存 Cookie；正常关闭时仅从已绑定、未变化的启动脚本临时读取 Cookie，调用本机 `erl_call`，不输出命令和凭据。Windows 本机进程检查工具可能看到该调用的参数，包不提供跨用户凭据隔离。

## 命令

所有命令以 `powershell -NoProfile -ExecutionPolicy Bypass -File "<技能目录>\server.ps1"` 为前缀。

| 参数 | 含义 |
|---|---|
| `doctor` | 检查工具运行环境，不接管 Unity 或服务器 |
| `startup` | 读取配置，返回待配置、可复用或需要重新确认 |
| `discover-unity` | 列出已打开的 Unity 工程及本机监听端口 |
| `inspect --server-root "绝对路径" --launch "BAT绝对路径" --unity-project "Unity绝对路径" --unity-url http://127.0.0.1:7890` | 检查文件、启动副作用和只读状态，返回配置草案 |
| `configure --profile-file "配置草案绝对路径" --confirmed` | 保存已由用户确认的配置 |
| `status` | 查询实际状态 |
| `plan start` / `plan stop` / `plan restart` / `plan clear` / `plan clear-restart` | 生成十分钟内有效的预检记录 |
| `execute ID --yes` | 执行已获用户授权的原预检记录 |
| `result ID` | 读取原操作记录 |
| `reconcile ID` | 对未知结果执行只读核查 |
| `reconcile ID --acknowledge` | 核查并关闭未知记录，保留证据，不重复执行 |

`inspect` 返回的 `profile.required_ports` 初始为空。Codex 应从实际服务配置确定业务端口，必要时与用户确认，再保存该字段；只读进程扫描观察到的全部端口不能直接当固定端口。配置文件必须保持其余检查结果不变，不能手工拼造文件哈希或扩大清档路径。

当前只允许清理已确认根目录中的整个 `db`。拒绝目录联接、符号链接和目录树内链接。清档前后分别验证 Unity 和服务器状态；失败立即停止后续步骤。实际删除可能已经部分发生时返回 `outcome_unknown`，不得报告成功。

原启动 BAT 可能自带清理日志、重建配置和运行安装器，这些动作仍由原脚本完成。工具展示并固定已检查文件的哈希，变化后要求重新确认。检测到其他 Erlang 节点或不同目录 EPMD 时，不执行带全局 `taskkill epmd.exe` 的原启动脚本。首版不替换原脚本，也不承诺其安装器内部行为均经过审计。

## 中断与结果核查

一条预检记录只执行一次。进程退出、调用方失联或失败后的未决状态，会阻止下一条操作。先读取 `result ID`、`status` 和 `reconcile ID`，向用户说明已记录步骤以及当前可核实的状态。当前存在或不存在 db 都不能单独证明此前是否完整清档；恢复执行需要用户明确下达新的操作，不自动重复。

独立“开启／关闭／重启”按请求操作服务器，不自动改变 Unity Play。只有两种清档流程强制退出 Play 并保持退出。服务器健康表示已确认目标节点、进程及配置端口；游戏业务验证另行进行。

## 包内 Python

启动器优先检测系统 Python 3.12+。不存在时校验 `assets/python-3.14.8-embed-amd64.zip`，解压到技能目录 `runtime` 后继续原命令，不修改 PATH 或注册表。不支持包内运行时的架构可使用自己安装的适配 Python 3.12+。

随包 ZIP 与已交付的 youkia GM 0.1.2 内置运行时一致，SHA-256 为 `a93abe456ab01bd96d7a085b3cdb6566b3063f4241360d114142fbdb07f0a310`。ZIP 内保留 Python 原始 `LICENSE.txt`。运行时不会在部署失败时重试服务器操作。

维护测试可设置 `youkia_server_python_mode=bundled` 强制使用包内环境，正常使用无需设置。交付包排除本机配置、已解压运行时和操作记录。
