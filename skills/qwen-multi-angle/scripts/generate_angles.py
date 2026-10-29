#!/usr/bin/env python3
"""Generate eight high-angle views from one image through a local ComfyUI API."""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import requests


DIRECTIONS = {
    "front": "front view",
    "front_right": "front-right quarter view",
    "right": "right side view",
    "back_right": "back-right quarter view",
    "back": "back view",
    "back_left": "back-left quarter view",
    "left": "left side view",
    "front_left": "front-left quarter view",
}
BASE_PROMPT = "<sks> {direction} high-angle shot wide shot white background"
EXTENDED_TEMPLATES = {
    "high-angle": "<sks> {direction} high-angle shot medium shot, same character, preserve the same outfit, preserve the same weapon, full body, centered, top-down mobile strategy game unit, stronger top-down perspective, visible top surfaces of the head and shoulders, foreshortened lower body, clear readable silhouette, subtle ground contact shadow, white background",
    "elevated": "<sks> {direction} elevated shot medium shot, same character, preserve the same outfit, preserve the same weapon, full body, centered, stylized mobile strategy game character unit, slight top-down perspective, slightly visible top surfaces of the head and shoulders, clear readable silhouette, subtle ground contact shadow, white background",
}


def api_error(response: requests.Response) -> RuntimeError:
    detail = response.text[:500].replace("\n", " ")
    return RuntimeError(f"ComfyUI HTTP {response.status_code}: {detail}")


def upload_image(session: requests.Session, server: str, image: Path) -> str:
    with image.open("rb") as handle:
        response = session.post(
            f"{server}/upload/image",
            files={"image": (image.name, handle, "application/octet-stream")},
            data={"overwrite": "true", "type": "input"},
            timeout=60,
        )
    if not response.ok:
        raise api_error(response)
    payload = response.json()
    return str(payload.get("name") or image.name)


def queue_prompt(session: requests.Session, server: str, workflow: dict[str, Any]) -> str:
    response = session.post(f"{server}/prompt", json={"prompt": workflow}, timeout=60)
    if not response.ok:
        raise api_error(response)
    payload = response.json()
    if payload.get("error"):
        raise RuntimeError(f"ComfyUI rejected workflow: {payload['error']}")
    return str(payload["prompt_id"])


def wait_for_result(session: requests.Session, server: str, prompt_id: str, timeout: int) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = session.get(f"{server}/history/{prompt_id}", timeout=30)
        if response.ok:
            history = response.json().get(prompt_id)
            if history and history.get("status", {}).get("completed"):
                if history.get("status", {}).get("status_str") == "error":
                    raise RuntimeError(f"ComfyUI execution failed for {prompt_id}")
                return history
        time.sleep(1.0)
    raise TimeoutError(f"Timed out after {timeout}s waiting for prompt {prompt_id}")


def save_outputs(session: requests.Session, server: str, history: dict[str, Any], output_dir: Path, stem: str) -> list[Path]:
    saved: list[Path] = []
    for node_output in history.get("outputs", {}).values():
        for image in node_output.get("images", []):
            params = {key: image[key] for key in ("filename", "subfolder", "type") if key in image}
            response = session.get(f"{server}/view", params=params, timeout=60)
            if not response.ok:
                raise api_error(response)
            suffix = Path(str(image.get("filename", "output.png"))).suffix or ".png"
            target = output_dir / f"{stem}{suffix}"
            index = 2
            while target.exists():
                target = output_dir / f"{stem}_{index}{suffix}"
                index += 1
            target.write_bytes(response.content)
            saved.append(target)
    if not saved:
        raise RuntimeError("Workflow completed but returned no images")
    return saved


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Source image")
    parser.add_argument("--workflow", type=Path, default=Path(__file__).resolve().parents[1] / "assets" / "qwen-edit-2511-multi-angle-workflow.json")
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"))
    parser.add_argument("--server", default="http://192.168.5.149:8199")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--shot-size", choices=("close-up", "medium shot", "wide shot"), default=None, help="Override the default shot size")
    parser.add_argument("--template", choices=("base", "high-angle", "elevated"), default="base", help="Use an independent built-in prompt template")
    parser.add_argument("--directions", default=",".join(DIRECTIONS), help="Comma-separated direction names (default: all eight)")
    parser.add_argument("--prompt", default=BASE_PROMPT, help="Prompt template; must contain {direction}")
    parser.add_argument("--cell-size", type=int, default=512, help="Cell size for the automatic labeled 3x3 preview")
    parser.add_argument("--no-contact-sheet", action="store_true", help="Skip the automatic 3x3 preview after all eight directions")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print requests without running ComfyUI")
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"Input image not found: {args.input}")
    if args.template != "base":
        args.prompt = EXTENDED_TEMPLATES[args.template]
    if "{direction}" not in args.prompt:
        parser.error("--prompt must contain {direction}")
    if args.shot_size and args.template == "base":
        args.prompt = f"<sks> {{direction}} high-angle shot {args.shot_size} white background"
    selected = [item.strip() for item in args.directions.split(",") if item.strip()]
    unknown = [item for item in selected if item not in DIRECTIONS]
    if unknown or not selected:
        parser.error(f"Unknown/empty directions: {', '.join(unknown or ['(empty)'])}; choose from {', '.join(DIRECTIONS)}")
    workflow = json.loads(args.workflow.read_text(encoding="utf-8"))
    required = {"41", "112", "106", "9"}
    missing = required - workflow.keys()
    if missing:
        parser.error(f"Workflow is missing expected nodes: {', '.join(sorted(missing))}")
    server = args.server.rstrip("/")
    if args.dry_run:
        print(json.dumps({"server": server, "workflow": str(args.workflow), "input": str(args.input), "template": args.template, "prompt": args.prompt, "directions": selected, "contact_sheet": set(selected) == set(DIRECTIONS) and not args.no_contact_sheet}, ensure_ascii=False, indent=2))
        return 0
    session = requests.Session()
    try:
        session.get(f"{server}/system_stats", timeout=10).raise_for_status()
        uploaded = upload_image(session, server, args.input)
        args.output_dir.mkdir(parents=True, exist_ok=True)
        render_paths: dict[str, Path] = {}
        for name in selected:
            direction = DIRECTIONS[name]
            job = json.loads(json.dumps(workflow))
            job["41"]["inputs"]["image"] = uploaded
            job["112"]["inputs"]["prompt"] = args.prompt.format(direction=direction)
            job["9"]["inputs"]["filename_prefix"] = f"qwen_angles/{args.input.stem}_{name}"
            if args.seed is not None:
                job["106"]["inputs"]["seed"] = args.seed
            prompt_id = queue_prompt(session, server, job)
            history = wait_for_result(session, server, prompt_id, args.timeout)
            paths = save_outputs(session, server, history, args.output_dir, f"{args.input.stem}_{name}")
            render_paths[name] = paths[0]
            print(f"[{name}] " + ", ".join(str(path) for path in paths))
        if set(selected) == set(DIRECTIONS) and len(selected) == len(DIRECTIONS) and not args.no_contact_sheet:
            from make_contact_sheets import build_labels, make_sheet

            camera_angle = "elevated" if args.template == "elevated" else "high-angle"
            shot_size = args.shot_size or ("wide shot" if args.template == "base" else "medium shot")
            labels = build_labels(camera_angle, shot_size, "white background")
            sheet = make_sheet(args.input, args.output_dir, args.output_dir, args.cell_size, 112, None, labels, render_paths)
            print(f"[contact-sheet] {sheet}")
    except (requests.RequestException, RuntimeError, TimeoutError, KeyError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
