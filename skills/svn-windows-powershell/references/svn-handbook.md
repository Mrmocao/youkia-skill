# SVN 使用手册（Windows / PowerShell）

适用环境：Windows PowerShell、SVN 1.14.x。当前项目已验证的客户端版本为 1.14.5；整理日期：2026-10-08。

本文命令供人工按场景执行，不是需要整段运行的脚本。`example.erl`、`你的账号`、示例 URL、版本号均需替换为实际值。相对路径默认从项目根目录开始。

## 1. 快速开始

```powershell
Set-Location 'G:\5.160\SLG\Server'
svn --version --quiet
svn info
svn status
```

- `svn info`：查看当前工作副本的 URL、仓库根地址、版本等信息，通常不联网。
- `svn status`：查看本地修改，不更新、不提交。
- `svn status -u`：联网检查服务器是否有新版本，但不下载修改。
- `svn help 命令`：查看当前安装版本支持的参数，例如 `svn help resolve`。

### 日常推荐顺序

1. `svn status`、`svn diff`：确认已有改动，重要未提交文件另行备份。
2. `svn update --accept postpone`：更新，遇到冲突先保留现场。
3. 修改代码；解决冲突；编译和验证。
4. 对新增文件执行 `svn add`，对删除、移动使用对应 SVN 命令。
5. 再次检查 `svn status`、`svn diff`。
6. 显式列出本次相关文件进行提交，记录成功返回的 revision。

SVN 的 `add` 是登记新增文件，不是 Git 式暂存。已跟踪文件的修改无需再次 `add`，提交时会提交所选路径的当前内容。

## 2. 常用命令速查

| 需求 | 命令 | 说明 |
| --- | --- | --- |
| 首次检出 | `svn checkout 'https://svn.example.com/repos/project/trunk' 'G:\work\project'` | 新建工作副本 |
| 更新当前目录 | `svn update` | 合并服务器修改到本地 |
| 更新指定路径 | `svn update 'plugin/game/src/example'` | 只更新指定范围 |
| 查看本地状态 | `svn status` | 简写 `svn st` |
| 检查远端更新 | `svn status -u` | `*` 表示远端存在更新 |
| 查看差异 | `svn diff 'example.erl'` | 本地内容与 BASE 比较 |
| 登记新增 | `svn add 'example.erl'` | 提交后才进入仓库 |
| 登记删除 | `svn delete 'example.erl'` | 通常同时删除本地文件 |
| 重命名 / 移动 | `svn move 'old.erl' 'new.erl'` | 保留历史关联；提交时包含新旧路径 |
| 复制并保留历史 | `svn copy 'old.erl' 'copy.erl'` | 本地操作，等待提交 |
| 提交指定文件 | `svn commit 'example.erl' -m '修复：奖励重复发放'` | 简写 `svn ci` |
| 查看历史 | `svn log -l 10` | 最近 10 条；工作副本目标的历史可能受本地版本限制 |
| 查看远端最新历史 | `svn log -r HEAD:1 -l 10` | 显式从仓库最新版本往回查 |
| 查看某次提交路径 | `svn log -v -r 12345` | 查看新增、修改、删除路径 |
| 查看某次提交差异 | `svn diff -c 12345` | r12344 → r12345 |
| 查看历史文件内容 | `svn cat -r 12345 'example.erl'` | 不修改工作副本 |
| 查看逐行作者 | `svn blame 'example.erl'` | 根据版本历史定位修改 |
| 撤销未提交修改 | `svn revert 'example.erl'` | 恢复本地 BASE，丢弃该文件的本地修改 |
| 标记冲突已解决 | `svn resolve --accept working 'example.erl'` | 先人工修好内容，再执行 |
| 修复操作中断后的锁 | `svn cleanup` | 先确保没有其他 SVN 操作正在运行 |

### 理解状态列

`svn status` 前七列各有含义，不能只搜索第一个字符来判断所有冲突。

| 标记 | 位置 / 含义 | 常见处理 |
| --- | --- | --- |
| `M` | 第 1 列：文件内容修改 | 检查 diff 后提交 |
| `A` | 第 1 列：计划新增 | 检查内容与提交范围 |
| `D` | 第 1 列：计划删除 | 确认删除是预期行为 |
| `?` | 第 1 列：未跟踪 | 需要版本管理则 add，否则留在本地或忽略 |
| `!` | 第 1 列：跟踪文件缺失，或目录不完整 | 误删则恢复；确实要删则登记删除 |
| `~` | 第 1 列：节点类型不匹配 | 例如文件位置被同名目录占用 |
| `C` | 第 1 列：文本冲突 | 合并文件内容 |
| `M` / `C` | 第 2 列：属性修改 / 属性冲突 | 检查 SVN 属性 |
| `L` | 第 3 列：工作副本写锁 | 操作结束或中断后按 cleanup 流程处理 |
| `+` | 第 4 列：新增项带复制历史 | 常见于 copy / move |
| `S` | 第 5 列：路径被 switch | 检查是否指向预期分支 |
| `K` / `O` | 第 6 列：文件锁；配合 `-u` 查看 | 当前工作副本持锁 / 其他工作副本持锁 |
| `C` | 第 7 列：树冲突 | 检查删除、移动、重命名关系 |
| `I` | 使用 `--no-ignore` 时：被忽略 | 通常无需提交 |

更新输出还可能出现 `U`（已更新）、`G`（已自动合并）、`C`（冲突）。`G` 只说明文本自动合并成功，仍需检查业务逻辑。

## 3. 更新代码

```powershell
svn status
svn diff
svn update --accept postpone
svn status
```

`update` 通常保留本地修改并合并远端变化；重叠修改可能产生冲突。`--accept postpone` 表示暂缓解决冲突，方便更新后统一检查。

仅更新一个文件或目录：

```powershell
svn update 'plugin/game/src/example/example_db.erl' --accept postpone
```

部分更新会产生混合版本工作副本。涉及接口、头文件或生成物时，应更新完整相关范围，避免源代码与依赖不匹配。

### 临时查看旧版本

```powershell
# 不修改工作副本，直接读取旧文件
svn cat -r 12345 'plugin/game/src/example/example_db.erl'

# 在干净工作副本或单独的测试副本中，切到指定版本
svn update -r 12345

# 回到最新版本
svn update -r HEAD
```

`update -r` 只切换本地版本，不撤销服务器提交，也不会自动丢弃本地修改。

## 4. 新增、删除、移动与提交

### 新增文件

```powershell
svn add 'plugin/game/src/example/example_db.erl'
svn status 'plugin/game/src/example'
```

新目录需要一并登记。`svn add '新目录'` 默认递归添加目录内容，执行前检查是否混入日志、临时文件或构建产物。不要在项目根目录直接无差别添加所有文件。

### 删除和移动

```powershell
svn delete 'plugin/game/src/example/obsolete.erl'
svn move 'plugin/game/src/example/old.erl' 'plugin/game/src/example/new.erl'
```

重命名后通常能看到旧路径 `D`、新路径 `A +`。提交时需要同时包含新旧路径，或明确提交它们所在的相关目录。

已经用资源管理器误删了跟踪文件，状态为 `!` 时：

```powershell
# 误删：恢复到 BASE 内容；无法找回误删前未提交的编辑
svn revert 'plugin/game/src/example/example_db.erl'

# 确实要删除：登记这次删除（与上面的恢复操作二选一）
svn delete 'plugin/game/src/example/example_db.erl'
```

### 提交指定文件

```powershell
svn diff 'plugin/game/src/example/example_db.erl'
svn commit 'plugin/game/src/example/example_db.erl' 'plugin/game/include/example.hrl' -m '修复：活动奖励重复领取'
```

提交目录会递归包含其中已登记的修改、增加、删除及属性变化。新增文件若位于尚未提交的新父目录内，需要把该父目录纳入提交。

成功通常显示 `Committed revision 12346.`。提交后确认：

```powershell
svn status
svn log -v -r 12346
```

工作副本可以保留其他未提交修改；关键是确认本次提交的文件和 revision 正确。

### 多行中文提交说明

```powershell
$svnCommitMessage = Join-Path $env:TEMP ('svn-message-' + [guid]::NewGuid().ToString('N') + '.txt')
@'
修复：问鼎奖励发放异常

原因：重复请求缺少领取状态校验。
处理：增加状态检查并调整响应。
验证：编译通过，完成重复领取场景验证。
'@ | Set-Content -LiteralPath $svnCommitMessage -Encoding UTF8

svn commit 'plugin/game/src/example/example_db.erl' --file $svnCommitMessage --encoding UTF-8
```

实际提交说明应填写真实修改和验证结果。文件放在系统临时目录，避免混入项目提交。

## 5. 冲突处理

### 5.1 文本冲突：人工合并（常用）

先查看冲突位置：

```powershell
svn status
svn info 'plugin/game/src/example/example_db.erl'
svn diff 'plugin/game/src/example/example_db.erl'
```

更新产生的文本冲突通常包含：

```text
<<<<<<< .mine
本地内容
||||||| .r12344
共同基础版本内容（部分输出会包含此段）
=======
服务器传入的内容
>>>>>>> .r12345
```

处理步骤：

1. 编辑冲突文件，理解双方修改，整理出正确的最终内容。
2. 删除全部冲突标记，包括可能出现的 `|||||||` 基础版本段。
3. 保存文件，再标记为已解决。
4. 检查差异，编译和验证，再提交。

```powershell
svn resolve --accept working 'plugin/game/src/example/example_db.erl'
svn status 'plugin/game/src/example/example_db.erl'
svn diff 'plugin/game/src/example/example_db.erl'
```

`--accept working` 只接受当前工作文件，不会检查你是否真的合并正确，也不会自动删除文件内容中的冲突标记。`.mine`、`.r旧版本`、`.r新版本` 等辅助文件通常会在解决冲突后清理，不应提交。

### 5.2 明确取舍后，直接选择一方

以下含义针对普通 `svn update` 文本冲突；分支 `merge` 中的 “theirs” 指合并来源，不能简单理解为当前分支的最新版本。

| 选项 | 行为 | 适用场景 |
| --- | --- | --- |
| `working` | 保留目前编辑后的工作文件 | 已人工合并完成 |
| `mine-full` | 使用发生本次合并前的完整本地文件 | 明确丢弃此文件传入的修改 |
| `theirs-full` | 使用完整传入文件 | 明确丢弃此文件的本地修改 |
| `mine-conflict` | 冲突区采用本地内容，保留非冲突的自动合并结果 | 逐处确认冲突区均应采用本地 |
| `theirs-conflict` | 冲突区采用传入内容，保留非冲突的自动合并结果 | 逐处确认冲突区均应采用传入内容 |
| `base` | 使用本次合并的基础版本 | 明确需要放弃双方变化，较少使用 |

```powershell
# 两种方案二选一；执行前备份仍需保留的内容
svn resolve --accept mine-full 'example.erl'
svn resolve --accept theirs-full 'example.erl'
```

`mine-full` / `theirs-full` 针对整份文件，不只是冲突行。上述选项并非对所有树冲突、属性冲突、二进制冲突都适用，不要递归套用到整个项目。

### 5.3 树冲突：删除、移动、重命名冲突

典型场景：服务器删除了文件，而本地还在修改；一方移动目录，另一方在原目录添加文件。

```powershell
svn status '冲突路径'
svn info '冲突路径'
svn log -v -r HEAD:1 -l 20
svn resolve '冲突路径'
```

优先阅读交互式 `resolve` 的冲突说明与可用选项，再决定采用哪种结构。

例如服务器将 `old.erl` 移到 `new.erl`，本地仍修改 `old.erl`：

1. 把本地 `old.erl` 备份到工作副本之外。
2. 用 `svn log -v` 确认新路径及移动关系。
3. 把需要保留的本地逻辑合入 `new.erl`。
4. 按交互提示落实服务器移动；检查旧路径、新路径的内容与 SVN 状态。
5. 若仍需手动标记，只在目录结构和内容都正确后，对具体冲突路径执行 `svn resolve --accept working`。
6. 编译验证，提交相关路径。

树冲突没有适用于所有情况的“保留我的 / 保留对方”固定命令。仅消除 `C` 标记，并不代表删除或移动关系已处理正确。

### 5.4 属性冲突

```powershell
svn proplist -v 'example.erl'
svn propget svn:eol-style 'example.erl'
```

根据冲突说明和 `.prej` 辅助文件，确定属性最终值；例如确实要求 LF 换行时：

```powershell
svn propset svn:eol-style LF 'example.erl'
svn resolve --accept working 'example.erl'
svn diff 'example.erl'
```

属性修改也需要提交。不要为消除冲突随意改变项目的换行或编码约定。

### 5.5 二进制文件冲突

图片、压缩包、Excel 等通常无法通过文本合并解决。先备份双方文件，再选择正确版本或使用对应软件合并；把最终文件放回原路径后执行 `svn resolve --accept working '文件路径'`，并实际打开验证。

## 6. 撤销、备份与回滚

### 撤销尚未提交的修改

```powershell
# 丢弃指定文件的本地编辑，恢复到本地 BASE
svn revert 'example.erl'

# 取消新增登记，普通新文件默认保留在磁盘上
svn revert 'new_file.erl'

# 取消计划删除，恢复 BASE 文件
svn revert 'deleted_file.erl'
```

`revert` 无法从 SVN 找回被丢弃的未提交内容。`svn revert -R .` 会递归撤销当前目录的本地修改，只在已备份且明确要放弃全部修改时使用。不要附加 `--remove-added`，除非确实需要连新增文件也从磁盘删除。

### 备份修改

最可靠的临时备份是把需要保留的文件、目录复制到工作副本之外，尤其是未跟踪文件和二进制文件。文本补丁可辅助保存：

```powershell
$svnPatchPath = Join-Path $env:TEMP ('svn-changes-' + [guid]::NewGuid().ToString('N') + '.patch')
svn diff | Out-File -LiteralPath $svnPatchPath -Encoding UTF8

# 在匹配的工作副本根目录检查 / 应用补丁
svn patch --dry-run $svnPatchPath
svn patch $svnPatchPath
```

普通 `svn diff` 不包含未跟踪文件内容，也不能作为二进制内容、完整移动历史或整个工作副本的可靠备份。Windows PowerShell 的管道会进行文本解码和编码；中文或非 UTF-8 源文件应优先直接复制备份，并检查补丁内容。

### 撤销已提交的某个 revision

使用干净且已更新的工作副本，在与原提交相匹配的分支和目录范围执行反向合并：

```powershell
svn status
svn update
svn merge --dry-run -c -12345 .
svn merge -c -12345 .
svn status
svn diff

# 解决可能出现的冲突并验证；检查当前目录全部改动后再提交
svn commit . -m '回滚 r12345：说明具体原因'
```

`-c -12345` 撤销的是 r12345 引入的变化。该流程产生一个新的回滚提交，原历史仍然保留。反向合并可能修改目录的 `svn:mergeinfo`，检查并将相关属性变化一并提交。

## 7. 账号、密码与认证问题

### 7.1 密码错误、密码刚修改或用错账号

常见提示包括 `Authentication failed`、`Could not authenticate`，有时伴随 `E170001`。错误码可能出现在不同错误链中，应结合完整提示判断。

先显式指定账号，使用会联网的操作验证：

```powershell
svn info -r HEAD --username '你的账号' --no-auth-cache
```

按终端提示输入密码。密码通常不会回显；不要把真实密码直接写进命令、脚本、提交说明或聊天记录。

注意：`--no-auth-cache` 禁止保存本次新认证信息，**不等于忽略或清除已有缓存**。如果仍反复使用旧凭据，继续下面的定向清理。

### 7.2 清除指定服务器缓存，然后重新登录

SVN 1.14 支持 `svn auth`。先查看匹配项，确认服务器、realm、用户名与凭据类型：

```powershell
# 示例主机名需替换为实际 SVN 主机；此命令默认隐藏密码
svn auth '*svn.example.com*'

# 确认匹配项后删除；多个模式为 AND 匹配，且区分大小写
svn auth --remove '*svn.example.com*' '*你的账号*'

# 再访问服务器，按提示输入新密码；允许正常缓存
svn info -r HEAD --username '你的账号'
```

可以使用查看结果中的具体凭据标识作为匹配依据，缩小删除范围。删除前的查看命令应使用与删除相同的筛选条件再核对一次。不要用 `svn auth --remove '*'` 清空所有服务器凭据，也无需使用 `--show-passwords`。

Windows 默认配置区域通常为 `$env:APPDATA\Subversion`，缓存通常位于其 `auth` 子目录；实际位置也可能由 `--config-dir` 改变。优先通过 `svn auth` 定向管理，不直接删除整个配置目录。

若使用 TortoiseSVN，可在 Settings → Saved Data → Authentication data 中检查并清除相应缓存（界面名称依版本可能不同）。清理范围较大时会导致其他仓库也需要重新登录。

### 7.3 用独立配置目录排查缓存影响

```powershell
$svnFreshConfig = Join-Path $env:TEMP ('svn-config-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $svnFreshConfig | Out-Null
svn info -r HEAD --config-dir $svnFreshConfig --username '你的账号' --no-auth-cache
```

独立配置目录可排除默认文件缓存和配置的影响，但不保证绕过操作系统单点登录或其他认证提供器。它也不会继承原有代理、CA 等配置，出现新的连接或证书错误时需单独判断。

### 7.4 账号正确，但仍无权限

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 密码始终不通过 | 密码错误、域账号格式不对、账号过期或锁定 | 确认账号格式，如管理员要求的 `DOMAIN\user`；联系管理员确认状态 |
| 能更新，不能提交 | 只有读取权限；目标目录限制写入 | 请管理员核对该仓库和路径的写权限 |
| 某些目录能访问，另一些不能 | 按路径授权 | 提供准确 URL 和失败路径供管理员检查 |
| HTTP 403 / Forbidden | 权限、代理或网关拒绝 | 结合完整错误和服务端日志定位，不能直接断定是密码错误 |
| `svn+ssh://` 认证失败 | SSH 用户、密钥或隧道问题 | 按 SSH 认证链路排查，清 SVN 密码缓存未必有效 |
| 自动脚本失败，手动成功 | `--non-interactive` 禁止输入，或运行账户 / 配置目录不同 | 先交互式验证，确认脚本运行身份及凭据来源 |

## 8. 常见问题排查

### 8.1 找不到 svn 命令

```powershell
Get-Command svn -All
where.exe svn
```

检查是否安装命令行客户端，以及其目录是否在 PATH。TortoiseSVN 的图形界面可用不一定代表命令行组件已安装。安装或调整 PATH 后重新打开终端。

### 8.2 不是工作副本：`E155007` / `not a working copy`

```powershell
Get-Location
Set-Location 'G:\5.160\SLG\Server'
svn info
```

确认位于真实检出的目录。现代 SVN 通常仅工作副本根目录有 `.svn`，子目录没有 `.svn` 是正常情况。普通复制或 `svn export` 得到的目录不是工作副本；需要另行 checkout 后迁移文件，不要从其他项目复制 `.svn`。

### 8.3 工作副本锁定 / 提示先 cleanup

常见提示：`Working copy locked`、`E155004`、`E155037`。

1. 确认 IDE、TortoiseSVN、其他终端没有正在运行的 SVN 操作。
2. 在工作副本根目录执行：

```powershell
svn cleanup 'G:\5.160\SLG\Server'
svn update 'G:\5.160\SLG\Server' --accept postpone
```

普通 cleanup 用于恢复中断操作，不会替你合并冲突。不要附加 `--remove-unversioned` / `--remove-ignored`：它们会删除未跟踪 / 被忽略的文件，可能包括代码、配置与本地工具。

若提示 `database is locked`，检查并发客户端、文件占用和磁盘状态。持续失败时备份本地文件，重新检出到新目录；不要手改 `.svn/wc.db` 或直接删除 `.svn`。

### 8.4 提交提示 `out of date`

服务器已修改相同文件、父目录或相关结构。更新对应范围，解决冲突后重试：

```powershell
svn update --accept postpone
svn status
svn diff
# 完成冲突处理和验证后
svn commit 'example.erl' -m '修复：填写实际说明'
```

不要通过强制覆盖来跳过他人的修改。若涉及父目录变动，仅更新单个文件可能不够。

### 8.5 `obstructed` / 同名文件挡住更新 / `~`

目标位置可能存在未跟踪的同名文件，或本应是文件的位置变成目录。

处理：先 `svn status`、`svn info` 确认节点类型；将挡路且需要保留的文件复制到工作副本之外，再移走具体障碍项；重新更新后，将需保留的改动合回正确文件。不要对整个项目执行批量删除或随意使用 `--force`。

### 8.6 无法连接：`E170013` / `E175002` 等

```powershell
svn info --show-item url
Resolve-DnsName 'svn.example.com'
Test-NetConnection 'svn.example.com' -Port 443
```

按实际主机和端口替换：HTTPS 常见 443、HTTP 常见 80、svn 协议常见 3690、SSH 常见 22，也可能使用自定义端口。

依次检查 URL、VPN / 内网连接、DNS、代理、防火墙和 SVN 服务状态。TCP 连通只说明端口可达，不代表 SVN 服务、证书和账号权限正常；这些错误码也不能单独证明密码有误。

### 8.7 HTTPS 证书验证失败

检查本机时间、访问主机名、证书是否过期，以及公司 CA 是否正确安装 / 配置。让管理员确认正确证书或 CA。不要把永久忽略证书校验作为密码错误的修复方式；证书错误和账户认证是不同问题。

### 8.8 文件被别人锁定 / `needs-lock`

```powershell
svn status -u 'example.xlsx'
svn info 'example.xlsx'

# 需要独占编辑时申请锁
svn lock 'example.xlsx' -m '编辑活动配置'

# 主动释放当前工作副本持有的锁
svn unlock 'example.xlsx'
```

这类仓库文件锁与 cleanup 处理的工作副本写锁不同。别人持有锁时先协调；`cleanup` 不能释放别人的仓库锁。不要未经确认使用强制抢锁 / 解锁。

### 8.9 中文乱码 / 提交说明编码错误

PowerShell 读取文件时显式指定编码：

```powershell
Get-Content -LiteralPath 'SVN使用手册.md' -Raw -Encoding UTF8
```

中文提交说明可使用第 4 节的 UTF-8 消息文件和 `--encoding UTF-8`。`--encoding` 在此控制提交说明编码，不会自动转换源文件。先区分终端显示错误与磁盘内容已损坏，避免批量重编码业务文件。

### 8.10 提交被 hook 拒绝 / 提交时断网

- `pre-commit hook failed`：通常未提交成功。阅读 hook 输出，按要求修正提交说明、文件格式或检查项。
- `post-commit hook failed`：提交可能已经成功；若返回 revision，先核对该 revision 的日志，再处理后续 hook 问题。
- 提交响应前断网 / 超时：结果可能不确定。用 `svn log -r HEAD:1 -l 10 -v` 核对作者、说明和路径，再用 `svn status`、`svn update` 对齐工作副本，避免盲目重复操作。

### 8.11 工作副本格式不兼容 / `too old` / `too new`

先用 `svn --version`、`Get-Command svn -All` 检查实际客户端版本。新客户端需要升级旧工作副本时，可在备份并确认团队工具兼容后执行 `svn upgrade`；旧客户端打不开新格式时，应升级客户端。

`svn upgrade` 不更新业务代码，也不负责把工作副本降级。不要修改内部格式文件；无法统一工具版本时，用目标客户端另行 checkout。

### 8.12 校验和错误 / 工作副本损坏

遇到 `checksum mismatch`、缺失 pristine 或持续数据库损坏：保存完整错误，备份所有未提交文件（包括新增、忽略和二进制文件），然后 checkout 到全新目录，再有选择地迁移本地修改。

不要把旧目录的 `.svn` 一起迁入新工作副本。新副本验证完成前保留旧目录；若新检出也失败，应由管理员排查仓库或网络链路。

## 9. 忽略文件、分支与补丁等补充命令

### 忽略临时文件

```powershell
svn propget svn:ignore '.'
svn propedit svn:ignore '.' --editor-cmd notepad
svn diff --properties-only '.'
```

在编辑器中保留已有规则，按行添加模式，如 `*.tmp`。`svn:ignore` 作用于该目录的直接子项，不自动递归影响全部子目录，也不会使已跟踪文件停止跟踪。属性需要提交才能共享；若只提交当前目录属性，可用 `svn commit --depth empty . -m '配置：补充临时文件忽略规则'`。

### 分支切换与合并

仅在确认仓库实际采用相应分支布局后使用以下示例：

```powershell
# 在干净工作副本中切换到指定分支
svn switch 'https://svn.example.com/repos/project/branches/example'

# 在目标分支的干净工作副本中，合入来源分支某次提交
svn merge --dry-run -c 12345 'https://svn.example.com/repos/project/branches/source' .
svn merge -c 12345 'https://svn.example.com/repos/project/branches/source' .
svn status
svn diff
```

合并完成不等于已提交；还要解决冲突、验证，并提交业务文件与相关 `svn:mergeinfo` 属性。服务器整体搬迁时的 `svn relocate` 与切换分支的 `svn switch` 用途不同，不能互相替代。

### 路径包含空格或 `@`

```powershell
svn status '目录 含空格/example.erl'

# 末尾额外的 @ 用于消除 peg revision 解析歧义
svn info 'assets/user@2x.png@'
```

## 10. 本项目特别约定

本节依据仓库根目录 `AGENTS.md`，具体要求以其后续更新为准。

### 编译后再提交相关生成物

从项目根目录在 PowerShell 执行：

```powershell
Push-Location 'G:\5.160\SLG\Server\tools'
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    .\compile.bat exit
} finally {
    Pop-Location
}
```

看到 `compile ok!` 即成功；按项目约定可忽略 `epmd.exe` 未找到提示。编译包含 PB 生成。仅修改本文档无需运行游戏编译。

- 通用 Proto 通常修改 `gpb/game_old/`，编译后检查相关已跟踪生成文件。
- 问鼎服务端唯一 Proto 编译输入是 `plugin/game/wen_d_tian_x/base/pb/pro_wen_d_tian_x.proto`；接口同时维护 `//!*Cmd` 注释与 `port` 声明。
- 问鼎生成的 PB Erlang、头文件、端口 cfg 与端口 Erlang 均由编译覆盖，不要手工编辑；源 Proto 与相关已跟踪生成文件应一起检查、提交。
- `gpb/game/pro_wen_d_tian_x.proto` 不是当前问鼎服务端编译输入。
- 生成文件发生冲突时，先解决源 Proto / 业务输入冲突，再重新编译生成，检查结果后标记冲突已解决；不要只选一方旧生成物来跳过源文件合并。

### Unity 资源同步由人工操作

- `svn_update.bat` 是项目的人工同步与提交工具，不能因文件名含 update 就把它当作普通 `svn update`；AI 不执行该脚本。
- 改动涉及 `gpb/game_old/`、`gpb/game/` 的 Proto 或 `plugin/cfg/ErrorLanguagePackage.txt` 时，需要人工使用该脚本同步并提交 Unity 资源。
- 问鼎玩法内 Proto 需要同步 Unity 时，先确认玩法 Proto 与 Unity `gpb/game/` 的同步责任和规则。
- 修改 `gpb/game_old/pro_fight_system.proto` 或录像依赖 Proto 时，常规编译完成后，在 `tools` 目录执行 `fight_pro_update.bat generate` 生成录像 PB 产物；该模式不提交，提交仍由人工确认。

## 11. 参考与核对方式

主要命令参数已对照本机 SVN 1.14.5 的 `svn help auth`、`svn help resolve`、`svn help cleanup`、`svn help status`、`svn help diff`、`svn help revert` 和 `svn help commit` 核对。其他客户端版本以各自的 `svn help` 为准。

- [Apache Subversion 官方 FAQ](https://subversion.apache.org/faq)：客户端、认证缓存与常见故障背景。
- [SVN Book：认证与凭据缓存](https://svnbook.red-bean.com/en/1.8/svn.serverconfig.netmodel.html)：认证缓存机制；较旧版本文档，缓存管理命令以本机帮助为准。
