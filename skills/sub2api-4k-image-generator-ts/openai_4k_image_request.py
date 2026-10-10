#!/usr/bin/env python3
import argparse
import base64
import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.request
import mimetypes
from pathlib import Path
from dotenv import load_dotenv

SKILL_ROOT = Path(__file__).resolve().parent
LOCAL_CONFIG_PATH = Path(os.environ.get("SUB2API_CONFIG", SKILL_ROOT / "config.local.json"))
if LOCAL_CONFIG_PATH.exists():
    try:
        with LOCAL_CONFIG_PATH.open("r", encoding="utf-8") as config_file:
            local_config = json.load(config_file)
        if not isinstance(local_config, dict):
            raise ValueError("config must be a JSON object")
        os.environ.setdefault("SUB2API_API_KEY", str(local_config.get("api_key", "")).strip())
        os.environ.setdefault("SUB2API_BASE_URL", str(local_config.get("base_url", "")).strip())
        os.environ.setdefault("SUB2API_USER_AGENT", str(local_config.get("user_agent", "")).strip())
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise SystemExit(f"Local config is not valid JSON: {LOCAL_CONFIG_PATH} ({exc})") from exc

load_dotenv()

size_options = [
    "256x256",
    "512x512",
    "1024x1024",
    "1792x1024",
    "1792x1792",
    "3840x2160",
    "7680x4320",
]
DEFAULT_SIZE = size_options[5]
# DEFAULT_SIZE = size_options[3]
DEFAULT_QUALITY = "high"
DEFAULT_IMAGES_MODEL = "gpt-image-2"
DEFAULT_RESPONSES_MODEL = "gpt-5.4-mini"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


class RequestFailed(RuntimeError):
    pass


def mask_api_key(api_key: str) -> str:
    api_key = api_key.strip()
    if len(api_key) <= 10:
        return "***" if api_key else ""
    return f"{api_key[:6]}...{api_key[-4:]}"


def build_images_payload(args: argparse.Namespace) -> dict:
    payload = {
        "model": args.image_model,
        "prompt": args.prompt,
        "size": args.size,
        "quality": args.quality,
        "n": args.n,
        "response_format": "b64_json",
    }
    if args.output_format:
        payload["output_format"] = args.output_format
    if args.background:
        payload["background"] = args.background
    if args.moderation:
        payload["moderation"] = args.moderation
    if args.stream:
        payload["stream"] = True
        payload["partial_images"] = args.partial_images
    return payload


def build_responses_payload(args: argparse.Namespace) -> dict:
    tool = {
        "type": "image_generation",
        "model": args.image_model,
        "size": args.size,
        "quality": args.quality,
    }
    if args.n > 1:
        tool["n"] = args.n
    if args.output_format:
        tool["output_format"] = args.output_format
    if args.background:
        tool["background"] = args.background
    if args.moderation:
        tool["moderation"] = args.moderation

    content = [{"type": "input_text", "text": args.prompt}]
    if args.input_image:
        content.append({"type": "input_image", "image_url": image_reference(args.input_image)})

    return {
        "model": args.responses_model,
        "input": [{"type": "message", "role": "user", "content": content}],
        "tools": [tool],
        "tool_choice": {"type": "image_generation"},
        "stream": args.stream,
    }


def image_reference(value: str) -> str:
    value = value.strip()
    if value.startswith(("http://", "https://", "data:")):
        return value

    path = Path(value)
    data = path.read_bytes()
    mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
    return f"data:{mime_type};base64,{base64.b64encode(data).decode('ascii')}"


def build_request(url: str, api_key: str, payload: dict, user_agent: str, accept: str) -> urllib.request.Request:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": accept,
            "User-Agent": user_agent,
        },
        method="POST",
    )


def request_json(url: str, api_key: str, payload: dict, timeout: int, user_agent: str) -> dict:
    req = build_request(url, api_key, payload, user_agent, "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RequestFailed(f"HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RequestFailed(f"request failed: {exc.reason}") from exc


def request_stream(url: str, api_key: str, payload: dict, timeout: int, user_agent: str) -> dict:
    req = build_request(url, api_key, payload, user_agent, "text/event-stream")
    response = {"data": [], "output": [], "partial_data": [], "_stream_incomplete": False}
    event_name = ""
    event_data_lines: list[str] = []

    def flush_event() -> None:
        nonlocal event_name, event_data_lines
        if not event_data_lines:
            event_name = ""
            return

        raw_data = "\n".join(event_data_lines).strip()
        current_event = event_name
        event_name = ""
        event_data_lines = []

        if not raw_data or raw_data == "[DONE]":
            return

        try:
            event = json.loads(raw_data)
        except json.JSONDecodeError:
            return

        event_type = event.get("type") or current_event
        if event_type == "error" or event.get("error"):
            raise RequestFailed(f"stream error: {json.dumps(event, ensure_ascii=False)}")

        if event_type == "image_generation.partial_image":
            index = event.get("partial_image_index", 0)
            print(f"partial image received: index={index}", file=sys.stderr)
            b64 = event.get("b64_json")
            if b64:
                response["partial_data"].append({"b64_json": b64, "partial_image_index": index})
            return

        if event_type == "image_generation.completed":
            b64 = event.get("b64_json")
            if b64:
                response["data"].append({"b64_json": b64})
            return

        if event_type == "response.image_generation_call.partial_image":
            index = event.get("partial_image_index", 0)
            print(f"partial image received: index={index}", file=sys.stderr)
            b64 = event.get("partial_image_b64")
            if b64:
                response["partial_data"].append({"b64_json": b64, "partial_image_index": index})
            return

        if event_type == "response.output_item.done":
            item = event.get("item") or {}
            if item.get("type") == "image_generation_call" and item.get("result"):
                response["output"].append(item)
            return

        if event_type == "response.completed":
            for item in (event.get("response") or {}).get("output") or []:
                if item.get("type") == "image_generation_call" and item.get("result"):
                    response["output"].append(item)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
                if line == "":
                    flush_event()
                    continue
                if line.startswith(":"):
                    continue
                if line.startswith("event:"):
                    event_name = line[len("event:") :].strip()
                    continue
                if line.startswith("data:"):
                    event_data_lines.append(line[len("data:") :].strip())
            flush_event()
    except http.client.IncompleteRead as exc:
        response["_stream_incomplete"] = True
        response["_stream_error"] = f"incomplete chunked read: {exc}"
        flush_event()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RequestFailed(f"HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RequestFailed(f"request failed: {exc.reason}") from exc

    return response


def iter_b64_images(response: dict):
    for item in response.get("data") or []:
        b64 = item.get("b64_json")
        if b64:
            yield b64

    # Responses API shape: output items may carry image_generation_call.result.
    for item in response.get("output") or []:
        if item.get("type") == "image_generation_call" and item.get("result"):
            yield item["result"]


def iter_partial_b64_images(response: dict):
    for item in response.get("partial_data") or []:
        b64 = item.get("b64_json")
        if b64:
            yield b64


def save_images(response: dict, output_dir: Path, prefix: str) -> int:
    output_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for count, b64 in enumerate(iter_b64_images(response), start=1):
        suffix = f"{count:02d}"
        path = output_dir / f"{prefix}-{suffix}.png"
        path.write_bytes(base64.b64decode(b64))
        print(path)
    return count


def save_partial_images(response: dict, output_dir: Path, prefix: str) -> int:
    output_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for count, b64 in enumerate(iter_partial_b64_images(response), start=1):
        suffix = f"{count:02d}"
        path = output_dir / f"{prefix}-partial-{suffix}.png"
        path.write_bytes(base64.b64decode(b64))
        print(path)
    return count


def response_summary(response: dict) -> dict:
    return {
        "final_images": sum(1 for _ in iter_b64_images(response)),
        "partial_images": sum(1 for _ in iter_partial_b64_images(response)),
        "stream_incomplete": bool(response.get("_stream_incomplete")),
        "stream_error": response.get("_stream_error", ""),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send a 4K image generation request through sub2api/OpenAI-compatible endpoints."
    )
    parser.add_argument("prompt", help="Image prompt.")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("SUB2API_BASE_URL", "http://127.0.0.1:8080"),
        help="sub2api base URL. Defaults to SUB2API_BASE_URL or http://127.0.0.1:8080.",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("SUB2API_API_KEY", ""),
        help="API key. Defaults to SUB2API_API_KEY.",
    )
    parser.add_argument(
        "--user-agent",
        default=os.environ.get("SUB2API_USER_AGENT", DEFAULT_USER_AGENT),
        help="HTTP User-Agent. Defaults to SUB2API_USER_AGENT or a browser-like UA.",
    )
    parser.add_argument(
        "--endpoint",
        choices=("images", "responses"),
        default="images",
        help="Use /v1/images/generations or /v1/responses.",
    )
    parser.add_argument("--image-model", default=DEFAULT_IMAGES_MODEL)
    parser.add_argument("--responses-model", default=DEFAULT_RESPONSES_MODEL)
    parser.add_argument(
        "--input-image",
        default="",
        help="Image URL, data URL, or local image path to include as Responses input_image.",
    )
    parser.add_argument("--size", default=DEFAULT_SIZE)
    parser.add_argument("--quality", default=DEFAULT_QUALITY)
    parser.add_argument("--n", type=int, default=1)
    parser.add_argument("--output-format", choices=("png", "jpeg", "webp"), default="png")
    parser.add_argument("--background", choices=("auto", "transparent", "opaque"), default="")
    parser.add_argument("--moderation", choices=("auto", "low"), default="")
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--output-dir", default=".")
    parser.add_argument("--prefix", default="")
    parser.add_argument("--stream", dest="stream", action="store_true", default=True)
    parser.add_argument("--no-stream", dest="stream", action="store_false")
    parser.add_argument("--partial-images", type=int, default=1)
    parser.add_argument("--dry-run", action="store_true", help="Print URL and JSON body without sending.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sub2api_url = args.base_url.strip()
    sub2api_key = args.api_key.strip()
    print(f"sub2api URL: {sub2api_url}")
    print(f"API key: {mask_api_key(sub2api_key)}")

    if args.n <= 0:
        print("--n must be greater than 0", file=sys.stderr)
        return 2

    if args.input_image and args.endpoint != "responses":
        print("--input-image is only supported with --endpoint responses.", file=sys.stderr)
        return 2

    base_url = args.base_url.strip().rstrip("/")
    if args.endpoint == "images":
        url = f"{base_url}/v1/images/generations"
        payload = build_images_payload(args)
    else:
        url = f"{base_url}/v1/responses"
        payload = build_responses_payload(args)

    if args.dry_run:
        print(url)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if not args.api_key:
        print("Missing API key. Set SUB2API_API_KEY or pass --api-key.", file=sys.stderr)
        return 2

    try:
        if args.stream:
            response = request_stream(url, args.api_key, payload, args.timeout, args.user_agent.strip())
        else:
            response = request_json(url, args.api_key, payload, args.timeout, args.user_agent.strip())
    except RequestFailed as exc:
        print(str(exc), file=sys.stderr)
        return 1
    prefix = args.prefix or f"image-4k-{int(time.time())}"
    count = save_images(response, Path(args.output_dir), prefix)
    if count == 0:
        partial_count = save_partial_images(response, Path(args.output_dir), prefix)
        if response.get("_stream_incomplete"):
            print(
                "Stream ended before the final image_generation.completed event. "
                "Saved partial images only; they are not the final 4K result.",
                file=sys.stderr,
            )
        print(json.dumps(response_summary(response), ensure_ascii=False, indent=2), file=sys.stderr)
        if partial_count == 0:
            print("No base64 image found in response.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
