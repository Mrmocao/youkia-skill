from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from core import OPERATIONS, VERSION, Manager, OperationError, file_lock, inspect_profile, read_json, require
from windows_backend import WindowsBackend


PACKAGE = Path(__file__).resolve().parents[1]


def parser():
    root = argparse.ArgumentParser(description="youkia本地服务器操作")
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor")
    commands.add_parser("startup")
    commands.add_parser("status")
    commands.add_parser("discover-unity")
    inspect = commands.add_parser("inspect")
    inspect.add_argument("--server-root", required=True)
    inspect.add_argument("--launch", required=True)
    inspect.add_argument("--unity-project", required=True)
    inspect.add_argument("--unity-url", default="http://127.0.0.1:7890")
    bind = commands.add_parser("configure")
    bind.add_argument("--profile-file", required=True)
    bind.add_argument("--confirmed", action="store_true")
    plan = commands.add_parser("plan")
    plan.add_argument("operation", choices=OPERATIONS)
    execute = commands.add_parser("execute")
    execute.add_argument("operation_id")
    execute.add_argument("--yes", action="store_true")
    result = commands.add_parser("result")
    result.add_argument("operation_id")
    reconcile = commands.add_parser("reconcile")
    reconcile.add_argument("operation_id")
    reconcile.add_argument("--acknowledge", action="store_true")
    return root


def run(args, backend, manager):
    if args.command == "discover-unity":
        from windows_backend import powershell
        return powershell("""
$items = @(Get-CimInstance Win32_Process -Filter "Name='Unity.exe'" | ForEach-Object {
    $match = [regex]::Match([string]$_.CommandLine, '(?i)(?:^|\\s)-projectPath\\s+(?:"([^"]+)"|(\\S+))')
    $project = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
    $ports = @(Get-NetTCPConnection -OwningProcess $_.ProcessId -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object -ExpandProperty LocalPort)
    [pscustomobject]@{pid=$_.ProcessId;project=$project;local_listen_ports=$ports}
})
ConvertTo-Json -InputObject @($items) -Depth 3 -Compress
""")
    if args.command == "inspect":
        profile = inspect_profile(args.server_root, args.launch, args.unity_project, args.unity_url)
        state = backend.server_state(profile)
        ports = state["processes"][0]["ports"] if len(state["processes"]) == 1 else []
        return {"profile": profile, "observed_listen_ports": ports,
                "unity": backend.unity_state(profile),
                "note": "请确认路径、启动副作用和用于验证的业务端口，将 required_ports 填入配置草案后 configure。"}
    if args.command == "configure":
        return manager.bind(read_json(args.profile_file), args.confirmed)
    if args.command == "startup":
        return manager.startup()
    if args.command == "status":
        return manager.status()
    if args.command == "plan":
        return manager.plan(args.operation)
    if args.command == "execute":
        return manager.execute(args.operation_id, args.yes)
    if args.command == "result":
        return read_json(manager.record_path(args.operation_id))
    if args.command == "reconcile":
        return manager.reconcile(args.operation_id, args.acknowledge)
    raise OperationError("UNKNOWN_COMMAND", "未知命令。")


def main():
    args = parser().parse_args()
    backend = None
    try:
        require(sys.version_info >= (3, 12) and os.name == "nt", "RUNTIME_UNSUPPORTED",
                "需要 Windows 和 Python 3.12+，请通过 server.ps1 启动。")
        if args.command == "doctor":
            data = {"version": VERSION, "python": sys.version.split()[0],
                    "runtime_source": os.environ.get("youkia_server_runtime_source", "direct"),
                    "package": str(PACKAGE), "requirements_ok": True}
        else:
            backend = WindowsBackend()
            state = PACKAGE / "state"
            lock_root = Path(os.environ["LOCALAPPDATA"]) / "youkia-local-server" / "locks"
            manager = Manager(state, backend, lock_root)
            with file_lock(state / "state.lock"):
                data = run(args, backend, manager)
        print(json.dumps({"ok": True, "data": data}, ensure_ascii=False))
        return 0
    except OperationError as exc:
        print(json.dumps({"ok": False, "error": {"code": exc.code, "message": str(exc)}}, ensure_ascii=False))
        return 2
    except (OSError, ValueError, KeyError, TypeError):
        print(json.dumps({"ok": False, "error": {"code": "LOCAL_DATA_ERROR",
                          "message": "配置、文件或本地环境无效，请检查路径并重新配置。"}}, ensure_ascii=False))
        return 2
    finally:
        if backend:
            backend.close()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
