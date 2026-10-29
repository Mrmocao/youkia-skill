"""Load the skill-local Lovart credentials and delegate to the official client."""

import json
import os
import runpy
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


def main():
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        print(MISSING_HELP)
        return 2

    access_key = str(data.get("access_key", "")).strip()
    secret_key = str(data.get("secret_key", "")).strip()
    if not access_key or not secret_key:
        print(MISSING_HELP)
        return 2

    os.environ["LOVART_ACCESS_KEY"] = access_key
    os.environ["LOVART_SECRET_KEY"] = secret_key
    runpy.run_path(str(CLIENT_PATH), run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
