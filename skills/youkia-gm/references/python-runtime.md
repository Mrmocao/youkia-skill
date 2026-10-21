# 包内 Python 环境

入口：`powershell -NoProfile -ExecutionPolicy Bypass -File "<技能目录>\gm.ps1" startup`。所有 GM 子命令都通过同一入口调用，参数格式保持不变。

启动时先检查 PATH 和 Windows Python 注册信息中的解释器，验证 Python 3.10+、标准库和 Windows 加密接口；满足要求即执行任务。商店安装占位入口不会触发安装窗口。

未找到合适解释器时，自动校验并解压 `assets/python-3.14.8-embed-amd64.zip` 到本技能目录的 `runtime/python-3.14.8-amd64`，验证通过后继续执行原命令。此过程不联网、不修改 PATH/注册表、不需要管理员权限；目录须可写。后续启动复用已部署运行时。环境故障不会触发 GM 任务重试。

随包运行时支持 Windows 10/11 x64；ARM64/32 位系统需要预装适配架构的 Python 3.10+。运行时不包含 pip，GM 仅使用标准库，不需要 pip。`doctor` 输出实际解释器路径、版本和来源。

维护诊断时可以临时设置环境变量 `youkia_gm_python_mode=bundled` 强制验证内置运行时；正常使用不设置，默认为 `auto`。安装失败会停止并报错；损坏的已部署运行时在重新部署时移动到 `runtime/previous-*` 留作恢复。

发行来源：[Python 3.14.8 官方发布页](https://www.python.org/downloads/release/python-3148/)。官方 Windows embeddable ZIP 原样随包提供，内含 `LICENSE.txt`；遵循其 Python Software Foundation 及第三方许可。此为 Python 官方支持的应用内嵌运行方式，参见 [Windows embeddable package 文档](https://docs.python.org/3.14/using/windows.html#the-embeddable-package)。

下载地址：https://www.python.org/ftp/python/3.14.8/python-3.14.8-embed-amd64.zip

官方 SHA-256：`a93abe456ab01bd96d7a085b3cdb6566b3063f4241360d114142fbdb07f0a310`

发布 ZIP 仅携带原始运行时压缩包，不包含已解压的 `runtime`、账号或任何运行缓存。
