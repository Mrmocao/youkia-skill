"""Save and validate Lovart credentials using only the Python standard library."""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


SKILL_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = SKILL_DIR / "conf" / "config.json"
CLIENT_PATH = Path(__file__).resolve().parent / "agent_skill.py"
MISSING_HELP = (
    "未检测到 Lovart API 密钥。请按以下步骤操作：\n"
    "lovart 官方-->点击lovart龙虾 -->创建API密钥-->复制发送给我"
)


def load_config():
    if not CONFIG_PATH.exists():
        return {}
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"无法读取配置文件：{exc}") from exc
    return data if isinstance(data, dict) else {}


def has_credentials(data):
    return bool(data.get("access_key", "").strip() and data.get("secret_key", "").strip())


def save_config(access_key, secret_key):
    if not access_key.startswith("ak_"):
        raise ValueError("Access Key 格式不正确，应以 ak_ 开头")
    if not secret_key.startswith("sk_"):
        raise ValueError("Secret Key 格式不正确，应以 sk_ 开头")
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"access_key": access_key, "secret_key": secret_key}
    CONFIG_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def validate_credentials(data):
    env = os.environ.copy()
    env["LOVART_ACCESS_KEY"] = data["access_key"]
    env["LOVART_SECRET_KEY"] = data["secret_key"]
    result = subprocess.run(
        [sys.executable, str(CLIENT_PATH), "projects", "--json"],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"Lovart API 认证校验失败：{detail}")


def main():
    parser = argparse.ArgumentParser(description="配置并校验 Lovart API 密钥")
    parser.add_argument("--access-key")
    parser.add_argument("--secret-key")
    parser.add_argument(
        "--from-env",
        action="store_true",
        help="从 LOVART_ACCESS_KEY 和 LOVART_SECRET_KEY 环境变量读取",
    )
    parser.add_argument("--check", action="store_true", help="只检查当前配置")
    parser.add_argument("--validate", action="store_true", help="调用 API 校验认证")
    args = parser.parse_args()

    if args.check:
        data = load_config()
        if not has_credentials(data):
            print(MISSING_HELP)
            return 2
        if args.validate:
            validate_credentials(data)
        print("lovart api 已配置成功")
        return 0

    access_key = os.environ.get("LOVART_ACCESS_KEY", "") if args.from_env else (args.access_key or "")
    secret_key = os.environ.get("LOVART_SECRET_KEY", "") if args.from_env else (args.secret_key or "")
    if not access_key or not secret_key:
        print(MISSING_HELP)
        return 2

    try:
        save_config(access_key.strip(), secret_key.strip())
        data = load_config()
        validate_credentials(data)
    except (ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print("lovart api 已配置成功")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
