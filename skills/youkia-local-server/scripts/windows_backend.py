from __future__ import annotations

import base64
import ctypes
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from core import OperationError, require, script_text


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def powershell(script, timeout=20):
    prefix = "$ErrorActionPreference='Stop'\n[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)\n"
    encoded = base64.b64encode((prefix + script).encode("utf-16le")).decode("ascii")
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
             "-EncodedCommand", encoded], capture_output=True, timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired as exc:
        raise OperationError("LOCAL_PROBE_TIMEOUT", "本地进程检查超时。") from exc
    require(result.returncode == 0, "LOCAL_COMMAND_FAILED", "本地进程操作失败，请检查权限和目标状态。")
    try:
        return json.loads(result.stdout.decode("utf-8-sig").strip() or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise OperationError("LOCAL_RESPONSE_INVALID", "本地检查没有返回有效 JSON。") from exc


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, stream, code, message, headers, new_url):
        raise OperationError("UNITY_REDIRECT_REJECTED", "Unity 本地接口发生重定向，停止操作。")


class WindowsBackend:
    def __init__(self):
        require(os.name == "nt", "WINDOWS_REQUIRED", "本工具需要 Windows。")
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
        self.kernel.OpenProcess.restype = ctypes.c_void_p
        self.kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        self.kernel.WaitForSingleObject.restype = ctypes.c_uint32
        self.kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        self.handles = []
        ancestors = powershell(f"""
$cursor = {os.getppid()}
$ancestors = @()
for ($depth=0; $depth -lt 12 -and $cursor -gt 0; $depth++) {{
    $item = Get-CimInstance Win32_Process -Filter "ProcessId=$cursor" -ErrorAction SilentlyContinue
    if ($null -eq $item) {{ break }}
    $ancestors += [pscustomobject]@{{pid=[int]$item.ProcessId;name=$item.Name}}
    $cursor = [int]$item.ParentProcessId
}}
ConvertTo-Json -InputObject @($ancestors) -Compress
""")
        require(ancestors, "OWNER_MISSING", "无法确认调用方进程。")
        for index, ancestor in enumerate(ancestors):
            if index == 0 or ancestor["name"].lower() in ("codex.exe", "codex"):
                handle = self.kernel.OpenProcess(0x00100000, False, ancestor["pid"])
                require(bool(handle), "OWNER_MISSING", "调用方已退出或无法验证。")
                self.handles.append(handle)
        self.http = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def close(self):
        for handle in self.handles:
            self.kernel.CloseHandle(handle)
        self.handles.clear()

    def owner_check(self):
        require(self.handles and all(self.kernel.WaitForSingleObject(handle, 0) == 258
                                    for handle in self.handles),
                "OWNER_LOST", "调用方已经退出，停止下一步操作。")

    def process_inventory(self, profile):
        return powershell(f"""
$expectedExe = {quote(profile["werl"])}
$prefix = {quote(profile["node_prefix"])}
$all = @(Get-CimInstance Win32_Process -Filter "Name='werl.exe' OR Name='erl.exe' OR Name='beam.smp.exe' OR Name='epmd.exe' OR Name='Unity.exe'")
$result = @()
foreach ($process in $all) {{
    $line = [string]$process.CommandLine
    $nodeMatch = [regex]::Match($line, '(?i)(?:^|\\s)-s?name\\s+([^\\s"]+)')
    $node = if ($nodeMatch.Success) {{ $nodeMatch.Groups[1].Value }} else {{ '' }}
    $target = ($process.ExecutablePath -eq $expectedExe -and $node.StartsWith($prefix,[StringComparison]::Ordinal))
    $ports = @()
    if ($target) {{
        $ports = @(Get-NetTCPConnection -OwningProcess $process.ProcessId -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -Unique)
    }}
    $projectMatch = [regex]::Match($line, '(?i)(?:^|\\s)-projectPath\\s+(?:"([^"]+)"|(\\S+))')
    $project = if ($projectMatch.Groups[1].Success) {{ $projectMatch.Groups[1].Value }} elseif ($projectMatch.Groups[2].Success) {{ $projectMatch.Groups[2].Value }} else {{ '' }}
    $result += [pscustomobject]@{{pid=[int]$process.ProcessId;name=$process.Name;executable=$process.ExecutablePath;node=$node;target=$target;ports=@($ports);project=$project;creation=[string]$process.CreationDate}}
}}
ConvertTo-Json -InputObject @($result) -Compress -Depth 4
""")

    def registrations(self, profile):
        try:
            result = subprocess.run([profile["epmd"], "-names"], capture_output=True, timeout=10,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except subprocess.TimeoutExpired as exc:
            raise OperationError("EPMD_TIMEOUT", "Erlang 节点查询超时。") from exc
        text = (result.stdout + result.stderr).decode("utf-8", errors="replace")
        return {"available": result.returncode == 0,
                "nodes": [{"name": name, "port": int(port)}
                          for name, port in re.findall(r"(?m)^name (\S+) at port (\d+)", text)]}

    def server_state(self, profile):
        inventory = self.process_inventory(profile)
        targets = [process for process in inventory if process["target"]]
        erlang = [process for process in inventory if process["name"].lower() != "unity.exe"]
        ambiguous = [process for process in erlang
                     if process["name"].lower() != "epmd.exe"
                     and (not process["executable"] or not process["node"])]
        require(not ambiguous, "PROCESS_IDENTITY_UNKNOWN", "存在无法识别的 Erlang 进程，不能确认服务器已停止。")
        same_node = [process for process in erlang if process["node"].startswith(profile["node_prefix"])]
        require(len(targets) <= 1 and len(same_node) <= 1,
                "SERVER_AMBIGUOUS", "存在多个同名目标节点，请先明确目标实例。")
        require(not same_node or same_node == targets, "NODE_OWNED_ELSEWHERE", "同名节点属于另一个服务器目录。")
        registry = self.registrations(profile)
        epmd = [process for process in erlang if process["name"].lower() == "epmd.exe"]
        require(registry["available"] or not epmd, "EPMD_UNVERIFIED", "EPMD 正在运行但节点登记无法核验。")
        registered = [node for node in registry["nodes"] if node["name"] == profile["node_prefix"].rstrip("@")]
        healthy = (len(targets) == 1 and len(registered) == 1
                   and registered[0]["port"] in targets[0]["ports"]
                   and bool(profile["required_ports"])
                   and set(profile["required_ports"]).issubset(targets[0]["ports"]))
        stopped = not targets and not registered
        return {"state": "running" if healthy else "stopped" if stopped else "unhealthy",
                "processes": targets, "registrations": registry["nodes"],
                "required_ports": profile["required_ports"],
                "other_erlang": [process for process in erlang
                                 if not process["target"] and process["name"].lower() != "epmd.exe"],
                "epmd_processes": epmd}

    def request_unity(self, profile, endpoint, payload=None):
        self.owner_check()
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(profile["unity_url"] + "/api/" + endpoint, data=data,
                                         headers={"Content-Type": "application/json",
                                                  "X-Agent-Id": "youkia-local-server"},
                                         method="GET" if payload is None else "POST")
        try:
            with self.http.open(request, timeout=15) as response:
                value = json.loads(response.read(1024 * 1024).decode("utf-8-sig"))
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            raise OperationError("UNITY_UNREACHABLE", "Unity 本地接口无法核验；不能推定 Play 已停止。") from exc
        require(isinstance(value, dict) and "error" not in value, "UNITY_RESPONSE_INVALID",
                "Unity 接口返回错误，停止后续操作。")
        return value

    def unity_state(self, profile):
        inventory = self.process_inventory(profile)
        target = [process for process in inventory if process["name"].lower() == "unity.exe"
                  and os.path.normcase(os.path.normpath(process["project"])) ==
                  os.path.normcase(os.path.normpath(profile["unity_project"]))]
        require(len(target) == 1, "UNITY_INSTANCE_REQUIRED", "需要唯一且已打开的绑定 Unity 工程。")
        ping = self.request_unity(profile, "ping")
        require(ping.get("processId") == target[0]["pid"], "UNITY_INSTANCE_MISMATCH",
                "Unity 接口与已绑定编辑器进程不一致。")
        value = self.request_unity(profile, "editor/state")
        actual = os.path.normcase(os.path.normpath(value.get("projectPath", "")))
        expected = os.path.normcase(os.path.normpath(profile["unity_project"]))
        require(actual == expected, "UNITY_PROJECT_MISMATCH", "Unity 接口对应了其他工程。")
        require(type(value.get("isPlaying")) is bool and type(value.get("isCompiling")) is bool,
                "UNITY_STATE_INVALID", "Unity Play 状态字段缺失。")
        return {key: value.get(key) for key in ("projectPath", "isPlaying", "isPaused", "isCompiling", "activeScene")}

    def stop_unity(self, profile):
        before = self.unity_state(profile)
        require(not before["isCompiling"], "UNITY_COMPILING", "Unity 正在编译，稍后重试。")
        if before["isPlaying"]:
            self.request_unity(profile, "editor/play-mode", {"action": "stop"})
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            self.owner_check()
            state = self.unity_state(profile)
            if state["isPlaying"] is False and not state["isCompiling"]:
                return state
            time.sleep(0.5)
        raise OperationError("UNITY_STOP_TIMEOUT", "Unity 未在期限内退出 Play，清档未继续。")

    def stop_server(self, profile):
        self.owner_check()
        before = self.server_state(profile)
        if before["state"] == "stopped":
            return before
        require(len(before["processes"]) == 1, "SERVER_STOP_UNVERIFIED", "目标进程无法唯一确定。")
        process = before["processes"][0]
        node = process["node"]
        require(re.fullmatch(r"[A-Za-z0-9_.@-]+", node), "NODE_INVALID", "节点名称格式不支持。")
        text = script_text(Path(profile["server_root"]) / "boot" / "start.bat")
        cookie = re.search(r"(?im)^\s*set\s+cookie=([^\r\n]+)", text)
        require(cookie is not None, "COOKIE_MISSING", "无法从已确认启动脚本读取本地节点凭据。")
        current = self.server_state(profile)
        require(current["processes"] == before["processes"], "SERVER_IDENTITY_CHANGED",
                "服务器进程在关闭前发生变化，请重新核查。")
        self.owner_check()
        try:
            response = subprocess.run(
                [profile["erl_call"], "-n", node, "-c", cookie.group(1).strip(),
                 "-timeout", "10", "-a", "init stop []"],
                capture_output=True, timeout=15,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except subprocess.TimeoutExpired as exc:
            raise OperationError("SERVER_STOP_UNKNOWN", "关闭请求结果未知，请查原操作状态。") from exc
        require(response.returncode == 0 and b"ok" in response.stdout.lower(),
                "SERVER_STOP_FAILED", "正常关闭未返回成功，不会自动强杀进程。")
        return self.wait_server(profile, "stopped", 45)

    def wait_server(self, profile, expected, seconds):
        deadline = time.monotonic() + seconds
        consecutive = 0
        while time.monotonic() < deadline:
            self.owner_check()
            state = self.server_state(profile)
            consecutive = consecutive + 1 if state["state"] == expected else 0
            if consecutive >= 2:
                return state
            time.sleep(0.5)
        raise OperationError("SERVER_STATE_TIMEOUT", "服务器未在期限内达到预期状态，请检查原操作记录。")

    def check_launch_environment(self, profile, state):
        if profile["global_epmd_stop"]:
            foreign_nodes = [node for node in state["registrations"]
                             if node["name"] != profile["node_prefix"].rstrip("@")]
            foreign_epmd = [process for process in state["epmd_processes"]
                            if not process["executable"]
                            or os.path.normcase(process["executable"]) != os.path.normcase(profile["epmd"])]
            require(not state["other_erlang"] and not foreign_nodes and not foreign_epmd,
                    "SHARED_EPMD_IN_USE", "原启动脚本会结束所有 epmd.exe；检测到其他 Erlang 实例，停止启动。")
        for effect in profile["launch_effects"]:
            target = Path(effect["path"])
            from core import absolute_path, linked
            absolute_path(target)
            if target.is_dir():
                for directory, folders, files in os.walk(target, followlinks=False):
                    require(not any(linked(Path(directory) / name) for name in folders + files),
                            "LAUNCH_LINK_REJECTED", "原启动脚本清理范围包含链接，停止启动。")

    def start_server(self, profile):
        self.owner_check()
        state = self.server_state(profile)
        require(state["state"] == "stopped", "SERVER_ALREADY_PRESENT", "目标节点未完全退出，不能重复启动。")
        self.check_launch_environment(profile, state)
        arguments = '/d /c call "' + profile["launch"] + '"'
        powershell(f"""
$started = Start-Process -FilePath $env:ComSpec -ArgumentList {quote(arguments)} -WorkingDirectory {quote(profile["server_root"])} -WindowStyle Hidden -PassThru
@{{pid=$started.Id;submitted=$true}} | ConvertTo-Json -Compress
""")
        return self.wait_server(profile, "running", 120)
