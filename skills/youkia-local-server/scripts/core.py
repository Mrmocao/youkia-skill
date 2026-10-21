from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


VERSION = "0.1.0"
OPERATIONS = ("start", "stop", "restart", "clear", "clear-restart")
CLEAR_OPERATIONS = ("clear", "clear-restart")
START_OPERATIONS = ("start", "restart", "clear-restart")


class OperationError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def require(condition, code, message):
    if not condition:
        raise OperationError(code, message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def file_digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def save_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def linked(path):
    return path.is_symlink() or path.is_junction()


def absolute_path(value):
    path = Path(value)
    require(path.is_absolute(), "ABSOLUTE_PATH_REQUIRED", "请提供完整绝对路径。")
    require(not str(path).startswith("\\\\"), "LOCAL_PATH_REQUIRED", "首版只支持本机磁盘路径。")
    for parent in (path, *path.parents):
        require(not linked(parent), "LINK_PATH_REJECTED", f"路径不能经过链接或目录联接：{parent}")
    return path.resolve()


def validate_db(profile):
    root = absolute_path(profile["server_root"])
    path = absolute_path(profile["db_path"])
    require(path == root / "db", "DB_SCOPE_CHANGED", "清档路径必须是已绑定服务器根目录下的 db。")
    if path.exists():
        require(path.is_dir(), "DB_NOT_DIRECTORY", "db 不是目录。")
        for directory, folders, files in os.walk(path, followlinks=False):
            for name in folders + files:
                item = Path(directory) / name
                require(not linked(item), "DB_LINK_REJECTED", f"db 包含链接或目录联接：{item}")
    return path


def script_text(path):
    raw = Path(path).read_bytes()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("gb18030")


def inspect_profile(server_root, launch, unity_project, unity_url):
    root = absolute_path(server_root)
    launcher = absolute_path(launch)
    unity = absolute_path(unity_project)
    require(root.is_dir(), "SERVER_ROOT_MISSING", "服务器目录不存在，请重新确认。")
    require(launcher.parent == root and launcher.is_file(), "LAUNCH_MISSING",
            "请选择服务器根目录中的启动 BAT 文件。")
    require(launcher.suffix.lower() == ".bat", "UNSUPPORTED_LAUNCHER", "首版支持 youkia Erlang BAT 启动方式。")
    require(not any(character in str(root) + str(launcher) for character in '&|<>^%!"\r\n'),
            "BATCH_PATH_UNSUPPORTED", "启动路径含 CMD 特殊字符，请使用不含这些字符的路径。")
    require((unity / "ProjectSettings" / "ProjectVersion.txt").is_file(),
            "UNITY_PROJECT_INVALID", "Unity 工程缺少 ProjectSettings/ProjectVersion.txt。")
    parsed = urlparse(unity_url)
    require(parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost")
            and not parsed.username and not parsed.password and parsed.path in ("", "/")
            and not parsed.query and not parsed.fragment and parsed.port is not None,
            "UNITY_URL_INVALID", "Unity 接口必须是带端口的本机 HTTP 地址。")
    entry_text = script_text(launcher)
    match = re.search(r"(?im)^\s*call\s+start\.bat\s+%no_load_path%\s+([a-zA-Z0-9_]+)\s*$", entry_text)
    require(match is not None, "ADAPTER_REQUIRED", "没有识别到已支持的 youkia 启动格式，需要适配。")
    require(re.search(r"(?im)^\s*cd\s+boot\s*$", entry_text) is not None,
            "ADAPTER_REQUIRED", "启动入口没有使用预期的 boot 工作目录。")
    boot = root / "boot"
    required = [launcher, boot / "start.bat", boot / "installer.bat", boot / "Installer.exe",
                boot / "erlang" / "bin" / "werl.exe", boot / "erlang" / "bin" / "erl_call.exe"]
    epmd_files = list((boot / "erlang").glob("erts-*/bin/epmd.exe"))
    require(len(epmd_files) == 1, "ERLANG_RUNTIME_AMBIGUOUS", "需要唯一的 Erlang 运行时 epmd.exe。")
    required.extend(epmd_files)
    for path in required:
        absolute_path(path)
        require(path.is_file(), "REQUIRED_FILE_MISSING", f"缺少文件，请重新确认：{path}")
    start_text = script_text(boot / "start.bat")
    require(re.search(r"(?im)^\s*set\s+cookie=([^\r\n]+)", start_text) is not None
            and "set nodeName=%2@%ip%" in start_text
            and "call installer.bat" in start_text,
            "ADAPTER_REQUIRED", "启动脚本不符合首版适配格式。")
    effects = []
    for line in start_text.splitlines():
        deletion = re.match(r'(?i)^\s*(?:rd\s+/s\s+/q|del)\s+(.+?)\s*$', line)
        if deletion:
            value = deletion.group(1).strip('"')
            require(not any(character in value for character in "*?%&|<>"),
                    "ADAPTER_REQUIRED", "启动脚本含动态删除范围，需要人工适配。")
            target = absolute_path(boot / value)
            require(target.is_relative_to(root) and target != root and target != root / "db",
                    "LAUNCH_DELETE_SCOPE", "启动脚本存在越界删除或清档操作，不能作为普通启动入口。")
            if target.name != "ipadd.txt":
                effects.append({"action": "delete_then_regenerate" if "standalone_server" in str(target)
                                else "delete_if_present", "path": str(target)})
    installer_text = script_text(boot / "installer.bat")
    profile = {
        "schema": "youkia-local-server-profile-v1", "adapter": "youkia-erlang-windows",
        "server_root": str(root), "launch": str(launcher), "db_path": str(root / "db"),
        "unity_project": str(unity), "unity_url": unity_url.rstrip("/"),
        "node_prefix": match.group(1) + "@",
        "werl": str(boot / "erlang" / "bin" / "werl.exe"),
        "erl_call": str(boot / "erlang" / "bin" / "erl_call.exe"),
        "epmd": str(epmd_files[0]),
        "launch_effects": effects,
        "global_epmd_stop": bool(re.search(r"(?i)taskkill\s+/F\s+/IM\s+epmd\.exe", installer_text)),
        "installer_runs": str(boot / "Installer.exe"),
        "file_hashes": {str(path): file_digest(path) for path in required},
        "required_ports": [],
    }
    validate_db(profile)
    return profile


def check_profile(profile):
    require(profile.get("schema") == "youkia-local-server-profile-v1", "PROFILE_INVALID", "配置格式不受支持。")
    fresh = inspect_profile(profile["server_root"], profile["launch"],
                            profile["unity_project"], profile["unity_url"])
    for key, value in fresh.items():
        if key == "required_ports":
            continue
        require(profile.get(key) == value, "CONFIG_CHANGED", "文件或启动流程已变化，请重新检查并确认配置。")
    ports = profile["required_ports"]
    require(isinstance(ports, list) and ports
            and all(type(port) is int and 1 <= port <= 65535 for port in ports),
            "PORTS_REQUIRED", "需要确认用于启动验证的业务监听端口。")
    validate_db(profile)


@contextmanager
def file_lock(path):
    import msvcrt
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    stream = path.open("a+b")
    acquired = False
    try:
        stream.seek(0, 2)
        if not stream.tell():
            stream.write(b"0")
            stream.flush()
        stream.seek(0)
        try:
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            acquired = True
        except OSError as exc:
            raise OperationError("BUSY", "同一配置或服务器已有操作正在执行。") from exc
        yield
    finally:
        if acquired:
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
        stream.close()


class Manager:
    def __init__(self, state, backend, lock_root):
        self.state = Path(state)
        self.backend = backend
        self.lock_root = Path(lock_root)

    def load_profile(self):
        require((self.state / "profile.json").is_file(), "NOT_CONFIGURED", "请先完成首次配置。")
        return read_json(self.state / "profile.json")

    def target_lock_path(self, profile):
        return self.lock_root / (digest(os.path.normcase(profile["server_root"])) + ".lock")

    def bind(self, profile, confirmed):
        require(confirmed, "CONFIRM_CONFIGURATION", "需要确认绝对路径、启动流程及清档范围。")
        require(not self.unfinished(), "UNFINISHED_OPERATION", "先核查原配置的未完成操作，再更换绑定。")
        check_profile(profile)
        with file_lock(self.target_lock_path(profile)):
            self.backend.unity_state(profile)
            self.backend.server_state(profile)
            save_json(self.state / "profile.json", profile)
        return {"stage": "ready", "profile": profile}

    def startup(self):
        if not (self.state / "profile.json").is_file():
            return {"stage": "needs_configuration"}
        profile = self.load_profile()
        try:
            check_profile(profile)
        except OperationError as exc:
            return {"stage": "needs_reconfirmation", "code": exc.code, "message": str(exc),
                    "profile": profile}
        except (OSError, ValueError, KeyError, TypeError):
            return {"stage": "needs_reconfirmation", "code": "PROFILE_UNREADABLE",
                    "message": "配置或目标文件无法读取，请重新核对本地路径。"}
        return {"stage": "ready", "profile": profile, "unfinished": self.unfinished()}

    def status(self):
        profile = self.load_profile()
        check_profile(profile)
        result = {"server": self.backend.server_state(profile)}
        try:
            result["unity"] = self.backend.unity_state(profile)
        except OperationError as exc:
            result["unity"] = {"state": "unknown", "code": exc.code, "message": str(exc)}
        result["unfinished"] = self.unfinished()
        return result

    def unfinished(self):
        records = []
        for path in (self.state / "operations").glob("*.json"):
            record = read_json(path)
            if record.get("status") in ("attempting", "outcome_unknown"):
                records.append({"id": record["id"], "operation": record["operation"],
                                "phase": record.get("phase"), "status": record["status"]})
        return records

    def record_path(self, operation_id):
        require(bool(re.fullmatch(r"[a-f0-9]{32}", operation_id)), "INVALID_ID", "操作编号无效。")
        return self.state / "operations" / (operation_id + ".json")

    def plan(self, operation):
        require(operation in OPERATIONS, "UNKNOWN_OPERATION", "不支持的操作。")
        profile = self.load_profile()
        check_profile(profile)
        require(not self.unfinished(), "UNFINISHED_OPERATION", "先检查并处理未确认结果的原操作。")
        state = self.backend.server_state(profile)
        if operation in CLEAR_OPERATIONS:
            self.backend.unity_state(profile)
            validate_db(profile)
        if operation in START_OPERATIONS and (operation != "start" or state["state"] != "running"):
            self.backend.check_launch_environment(profile, state)
        record = {"id": uuid.uuid4().hex, "operation": operation, "status": "prepared",
                  "created": time.time(), "profile_digest": digest(profile),
                  "target": profile["server_root"], "db_path": profile["db_path"] if operation in CLEAR_OPERATIONS else None,
                  "launch_effects": profile["launch_effects"] if operation in START_OPERATIONS else [],
                  "phase": "prepared", "steps": [], "before": state}
        save_json(self.record_path(record["id"]), record)
        return record

    def execute(self, operation_id, authorized):
        require(authorized, "AUTHORIZATION_REQUIRED", "执行必须对应用户明确下达的操作。")
        record = read_json(self.record_path(operation_id))
        require(record["status"] == "prepared", "ALREADY_ATTEMPTED", "该操作已经执行或结果待核查，不能再次提交。")
        require(time.time() - record["created"] <= 600, "PLAN_EXPIRED", "预检已过期，请重新预检。")
        profile = self.load_profile()
        check_profile(profile)
        require(record["profile_digest"] == digest(profile), "PROFILE_CHANGED", "配置已变更，请重新预检。")
        require(not self.unfinished(), "UNFINISHED_OPERATION", "先核查尚未确认结果的操作。")
        with file_lock(self.target_lock_path(profile)):
            return self._execute_locked(record, profile)

    def _execute_locked(self, record, profile):
        operation = record["operation"]
        record["status"] = "attempting"
        record["started_at"] = datetime.now(timezone.utc).isoformat()
        self._persist(record)
        mutation_possible = False
        try:
            self.backend.owner_check()
            state = self.backend.server_state(profile)
            if operation in START_OPERATIONS:
                if operation != "start" or state["state"] != "running":
                    self.backend.check_launch_environment(profile, state)
            if operation in CLEAR_OPERATIONS:
                unity = self.backend.unity_state(profile)
                if unity["isPlaying"]:
                    self._phase(record, "stopping_unity")
                    mutation_possible = True
                    self.backend.stop_unity(profile)
                self._unity_stopped(profile)
                self._step(record, "unity_stopped")
            if operation != "start":
                self._phase(record, "stopping_server")
                mutation_possible = True
                self.backend.stop_server(profile)
                self._server_stopped(profile)
                self._step(record, "server_stopped")
            if operation in CLEAR_OPERATIONS:
                self._phase(record, "deleting_db")
                self._guard_clear(profile)
                path = validate_db(profile)
                existed = path.exists()
                if existed:
                    self._guard_clear(profile)
                    mutation_possible = True
                    shutil.rmtree(path)
                require(not path.exists(), "DB_DELETE_FAILED", "db 目录仍然存在，清档未完成。")
                self._step(record, "db_deleted", existed=existed)
            if operation in START_OPERATIONS:
                self.backend.owner_check()
                if operation == "start" and state["state"] == "running":
                    self._step(record, "already_running")
                else:
                    self._server_stopped(profile)
                    self.backend.check_launch_environment(profile, self.backend.server_state(profile))
                    check_profile(profile)
                    self._phase(record, "starting_server")
                    mutation_possible = True
                    self.backend.start_server(profile)
                    self._step(record, "server_started")
            if operation in CLEAR_OPERATIONS:
                self._unity_stopped(profile)
            final = self.backend.server_state(profile)
            expected = "running" if operation in START_OPERATIONS else "stopped"
            require(final["state"] == expected, "FINAL_STATE_MISMATCH", "服务器最终状态不符合请求。")
            record.update(status="completed", phase="completed", after=final)
        except BaseException as exc:
            record.update(status="outcome_unknown" if mutation_possible else "failed",
                          error={"code": getattr(exc, "code", "INTERRUPTED_OR_UNEXPECTED"),
                                 "message": str(exc) if isinstance(exc, OperationError)
                                 else "操作中断或发生异常，请核查原操作记录和当前状态。"})
            self._persist(record)
            raise
        self._persist(record)
        return record

    def _persist(self, record):
        save_json(self.record_path(record["id"]), record)

    def _phase(self, record, phase):
        self.backend.owner_check()
        record["phase"] = phase
        self._persist(record)

    def _step(self, record, name, **detail):
        record["steps"].append({"name": name, **detail})
        self._persist(record)

    def _unity_stopped(self, profile):
        state = self.backend.unity_state(profile)
        require(state["isPlaying"] is False and not state.get("isCompiling"),
                "UNITY_NOT_STOPPED", "Unity 尚未退出 Play 或正在编译，停止后续步骤。")

    def _server_stopped(self, profile):
        require(self.backend.server_state(profile)["state"] == "stopped",
                "SERVER_NOT_STOPPED", "目标服务器尚未完全退出，停止后续步骤。")

    def _guard_clear(self, profile):
        self.backend.owner_check()
        check_profile(profile)
        self._unity_stopped(profile)
        self._server_stopped(profile)

    def reconcile(self, operation_id, acknowledge):
        record = read_json(self.record_path(operation_id))
        require(record["status"] in ("attempting", "outcome_unknown"),
                "NOT_UNCERTAIN", "该记录不需要结果核查。")
        profile = self.load_profile()
        require(record["profile_digest"] == digest(profile), "PROFILE_CHANGED", "请先恢复或核对原目标配置。")
        with file_lock(self.target_lock_path(profile)):
            current = self.status()
            result = {"operation": record, "current": current,
                      "db_exists": Path(profile["db_path"]).exists(),
                      "message": "当前状态不能证明中断前的清档已完整完成。确认检查后可关闭原记录，不自动重复执行。"}
            if acknowledge:
                record.update(status="reviewed", phase="closed_after_review", review=current)
                self._persist(record)
                result["operation"] = record
            return result
