# 命令说明

下文是执行层参考；正常使用由 Codex 代为调用，不要求用户手动输入这些命令。所有命令经 `gm.ps1` 自动检查和选择 Python；可将示例入口替换为其绝对路径。参数中的 UID 必须从实际查询取得，示例中的符号不是实际 ID。

所有成功输出为 `{"ok":true,"data":...}`，错误为 `{"ok":false,"error":{"code":...,"message":...}}` 并返回退出码 2。帮助参数由 argparse 输出。不要按中文文案判断错误，用错误码。

## Codex 启动引导

每次打开已安装 Skill，Codex 按以下状态机处理：

先运行 `startup`，只读取本地缓存：`bind_account` 引导绑定；`select_project` 获取项目列表并询问；`ready` 说明上次选择的项目，直接进入任务对话。切换项目或更换账号时重新选择，用户要求“刷新功能目录”时执行 `scan-functions`。`startup` 不把已有缓存等同于当前联网权限。

1. 检查包内 `state` 是否有绑定账号；没有则要求账号和密码，GM 地址使用 Skill 固定值；用户明确更换时才再次验证。
2. 验证成功后读取项目/版本列表，向用户展示名称，并询问要操作的项目；若有多个版本再询问版本。
3. 项目选定后告知“将只读取该项目当前账号可见的 GM 功能定义”，执行 `scan-functions`。这一步只读取菜单、权限概要、动态组件定义，不执行菜单、活动、审核、下发或游戏查询。
4. 把扫描结果写入当前解压目录的 `state`，按账号绑定代次、项目和版本隔离。扫描过的项目使用 `menus-cached` 快速匹配；服务器相关动态选项仍在选定服务器后读取或在预检时核对。
5. 扫描完成后报告菜单数量、可见功能数量和需服务器解析的组件数量。若尚未选服，提示可以同时给出“服务器＋任务”；若用户已给出任务，继续处理，不要求重新下达。

`startup` 的 `server_selected` 和 `context` 表示已保存的服务器选择，`server_names` 在新版显式选服后提供名称。旧版状态可直接复用，即使暂时没有名称也不能丢弃已选目标。只有账号、项目、版本相同才继承服务器。

账号密码由 Codex 引导到隐藏输入或现有缓存导入，不向用户索取 GM 地址；不要把凭据写进聊天、参数文件或 Skill 包。

## 账号与会话

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 doctor
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 account
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 configure --username 'operator'
```

`configure` 隐藏输入密码。自动化可使用 `--password-env youkia_gm_password`，从已有环境变量读取；不要把密码本身放到命令行。

明确复用已有 gm_cli 账号：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 configure --import-cache 'C:\path\to\.gm_cli\config.json' --operator '缓存账号键'
```

只读取指定缓存，不修改它，不自动选择其他账户。已有绑定时默认拒绝再次配置，明确更换才加 `--replace`。旧计划绑定账号配置代次，替换账号后不能继续提交旧计划。

默认状态目录是 Skill 解压目录下的 `state`；可用全局选项 `--state-dir <目录>` 或环境变量 `youkia_gm_state` 覆盖，主要用于测试。全局选项须在子命令前。同一账号建议使用一个目录。不同 Windows 用户不能解密彼此的 DPAPI 状态。

令牌保存在加密状态中，后续进程复用。只读调用收到明确的 `relogin` 才重新登录一次、恢复上下文后重读；写请求不自动重试。密码变化或强制改密会明确报错，用户处理后替换本地绑定。

## 项目、菜单、服务器

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 projects
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 permissions --project P --version V
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 menus --project P --version V --query '活动'
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 servers --project P --version V --query '测试' --refresh
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 select-server --project P --version V --cluster C --server S
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 menu-schema --project P --version V --cluster C --server S --menu M
```

`P/V/C/S/M` 分别替换为真实项目、版本、集群、服务器和菜单 UID。项目 `0` / 版本 `0` 表示平台管理上下文，不代表任意游戏。是否可使用由账户和服务端决定。

`permissions` 同时返回平台管理员、项目管理员、细分权限键和可见菜单。管理员的键列表可能为空。`menus` 从当前可见目录按名称/父菜单搜索；`menu-schema` 返回原始菜单和展开后的表单定义。

项目选定后的只读功能扫描：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 scan-functions --project P --version V
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 menus-cached --project P --version V --query '玩家'
```

`scan-functions` 会在包内 `state` 保存该账号/项目/版本的菜单目录和动态组件定义；不提交任何 GM 业务请求。没有可继承或显式指定的服务器时，服务器相关的动态选项标记为延迟解析；选定服务器后按需读取。刷新同一项目的功能目录不改变已保存的服务器。功能缓存不是活动记录、玩家状态、审核状态或服务器运行状态，不能代替写操作前的最新核对。

`select-server` 要求显式提供真实集群和服务器，查证可访问后保存选择，不执行业务任务，也不全量扫描功能。选择失败不覆盖原默认服。此后相同账号、项目和版本的命令省略 `--cluster` 与 `--server` 会继承当前服务器，两者必须同时省略或同时提供。显式 `0/0` 可只进入项目上下文，不清空默认服；仅提供一项会报 `TARGET_INVALID`。

例如选服后可直接运行 `menu-plan --project P --version V --menu M --params-file 'C:\work\params.json'`。本次显式传入另一对集群/服务器或 `--target` 只覆盖当前任务，不保存为默认服；明确切换才调用 `select-server`。服务器发现遇到旧服已失效时使用 `servers --project P --version V --cluster 0 --server 0 --refresh`，不得自动挑选替代服。

服务器列表缓存 60 秒，按账号绑定、平台、项目、版本隔离；`--refresh` 强制更新。权限和操作表单每次读取，执行计划时再次检查。

## 普通菜单与记录表单

将实际参数写为 UTF-8 JSON，使用编辑工具创建文件，不在 shell 字符串中插入未经转义的用户输入。

```json
{
  "实际文本字段": "实际值",
  "实际多选字段": ["选项值1", "选项值2"],
  "实际动态字段": {"value": "父级选项值", "child": "子级选项值"},
  "实际表格字段": [{"实际列名": "实际值"}]
}
```

只保留该菜单真实存在的字段。更深层联动使用嵌套的 `child: {value: ..., child: ...}`。隐藏字段由表单定义填充。日期格式为 `yyyy-MM-dd HH:mm:ss`，不自动转换时区；应确认平台/服务器时区。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 menu-plan --project P --version V --cluster C --server S --menu M --params-file 'C:\work\params.json'
```

批量目标使用多个 `--target C:S`。单服菜单不允许多目标；不会根据“全服”文字自行扩展范围。动态选项将逐目标验证。服务器必须处于 `RUN` 才生成菜单执行计划。

类型 3 保存表单另需 `--description '记录描述' --unit '分组'`；更新既有记录加 `--record-uid R`。已审核记录不能通过该入口更新；执行前会比较已有记录，避免覆盖预检后发生的变化。类型 3 只保存，不自动审核、下发。

计划有效期 15 分钟，返回准确上下文、请求和下一阶段。预检不判断玩家是否存在、道具是否可发等全部业务条件。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 execute PLAN_ID --yes
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 status PLAN_ID
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 result PLAN_ID --wait 30
```

`--yes` 表示该具体计划已获用户授权，不是本工具自行授予权限。提交前刷新权限、菜单/组件、服务器和记录状态。开始提交前持久化状态，随后最多发送一次请求；同一计划再次提交会被拒绝。

`result` 仅查询本账号计划对应的已返回任务 UID；`--wait` 为 0–60 秒。超时等待不重发业务操作。转发完成后按每服业务返回判断成功；计划中原始结果保存在加密状态中。

普通菜单及标准活动/表记录下发会按计划核对预期返回对象和服务器。快速下发或其它协议级异步操作暂不自动推断完整性，返回 `completion_verifiable: false`；此时必须结合原始结果、网页流程或业务回读确认，不能因 `is_send` 为真就宣称完成。

## 专用页面接口

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 endpoints --query 'gactive_port'
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 api-schema /gm/gactive_port/active_list
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 api-read /gm/gactive_port/active_list --project P --version V
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 api-read /gm/gtable_port/dyn_list --project P --version V --data-file 'C:\work\query.json'
```

表记录列表 `query.json` 为 `{"reply":"从菜单定义取得的table值"}`。bytes 字段用 Base64；先通过 `api-schema` 查看字段结构，再解码返回的 Base64，不能把编码字符串当业务文本。

专用页面写操作使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\gm.ps1 api-plan /gm/gactive_port/examine --project P --version V --menu M --button examine --intent '审核指定活动' --data-file 'C:\work\request.json' --expects-file 'C:\work\expected.json'
```

这里 `M` 必须是该功能真实页面的菜单 UID，按钮后缀必须从页面权限逻辑核对，不能为通过检查而换另一个有权限的菜单/按钮。执行器检查有效权限，服务端做最终授权；本版未内置所有页面的“接口→菜单→按钮”映射。

`api-plan` 校验协议字段及类型、调用权限、指定状态前提。它没有完整复制每个管理页面的业务校验，不得将协议级预检误报为业务审核。普通菜单 `/gm/menu_port/submit` 禁止经此入口提交。

## 故障处理

| 错误/状态 | 处理 |
|---|---|
| `NOT_CONFIGURED` | 首次绑定账号 |
| `SESSION_EXPIRED` / `LOGIN_REQUIRED` | 检查登录、改密要求；不换账号、不重复提交 |
| `PROJECT_DENIED` / `PERMISSION_DENIED` | 核对真实项目和账号权限 |
| `COMPONENT_MISSING` / `WIDGET_UNSUPPORTED` | 补充该组件适配；不忽略必填参数 |
| `SCHEMA_CHANGED` / `STATE_CHANGED` | 读取新状态，重新生成计划并核对范围 |
| `SESSION_BUSY` | 另一操作持有锁，稍后继续；不删除锁文件绕过 |
| `ALREADY_ATTEMPTED` / `outcome_unknown` | 查原计划、任务结果或平台日志；不能盲目重试 |
| `GM_REJECTED` | 平台拒绝，核对权限、参数及业务条件 |

HTTP 请求超时为 30 秒。这是单次请求的上限，不是操作耗时承诺。本版未进行性能基准测试。
