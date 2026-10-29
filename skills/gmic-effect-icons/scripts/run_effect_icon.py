import argparse
import json
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_API = "http://192.168.5.149:8199"
NEGATIVE = "low resolution, blurry, pixelated, JPEG artifacts, noisy, muddy colors, flat lighting, photograph, photorealistic, 3d screenshot, text, letters, numbers, logo, watermark, signature, frame, border, button, user interface, human, character, hands, multiple unrelated objects, cluttered background, cropped subject, duplicate subject, malformed silhouette"
TRIGGER = r"gmic icon_\(Game ai Institute\)"
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
WORKFLOW_NODES = {
    "1": "UNETLoader",
    "2": "CLIPLoader",
    "3": "VAELoader",
    "4": "LoraLoaderModelOnly",
    "5": "ModelSamplingAuraFlow",
    "6": "CLIPTextEncode",
    "7": "CLIPTextEncode",
    "8": "EmptySD3LatentImage",
    "9": "KSampler",
    "10": "VAEDecode",
    "11": "SaveImage",
}
MODEL_INPUTS = (
    ("UNETLoader", "unet_name", "1", "unet_name"),
    ("CLIPLoader", "clip_name", "2", "clip_name"),
    ("VAELoader", "vae_name", "3", "vae_name"),
    ("LoraLoaderModelOnly", "lora_name", "4", "lora_name"),
)


class ExecutionError(RuntimeError):
    def __init__(self, details):
        super().__init__(details.get("message", "ComfyUI execution failed"))
        self.details = details


def request(api, path, data=None, timeout=180, retries=3):
    """Retry read-only API requests. POST requests are never replayed automatically."""
    body = None if data is None else json.dumps(data).encode("utf-8")
    headers = {"Content-Type": "application/json"} if body else {}
    attempts = retries if body is None else 1
    last_error = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(api.rstrip("/") + path, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, socket.timeout) as exc:
            last_error = exc
            retryable = not isinstance(exc, urllib.error.HTTPError) or exc.code in {429, 502, 503, 504}
            if attempt + 1 >= attempts or not retryable:
                raise
            time.sleep(min(2 ** attempt, 8))
    raise last_error


def wait_for_api(api, wait_seconds):
    deadline = time.time() + wait_seconds
    last_error = None
    while time.time() < deadline:
        try:
            return json.loads(request(api, "/system_stats", timeout=15, retries=1))
        except Exception as exc:
            last_error = exc
            time.sleep(3)
    raise RuntimeError(f"ComfyUI API did not become ready within {wait_seconds}s: {last_error}")


def validate_job(job):
    required = ("id", "name", "user_input", "optimized_prompt", "seed")
    missing = [key for key in required if key not in job]
    if missing:
        raise ValueError(f"job is missing fields: {', '.join(missing)}")
    job_id = str(job["id"])
    if not ID_PATTERN.fullmatch(job_id):
        raise ValueError(f"{job_id!r}: id must match {ID_PATTERN.pattern}")
    if not str(job["name"]).strip():
        raise ValueError(f"{job_id}: name cannot be empty")
    user_input = str(job["user_input"])
    if not user_input.strip() or len(user_input) > 1000:
        raise ValueError(f"{job_id}: user_input must contain 1-1000 characters")
    optimized = str(job["optimized_prompt"])
    if not optimized.startswith(TRIGGER):
        raise ValueError(f"{job_id}: optimized_prompt must start with {TRIGGER}")
    seed = int(job["seed"])
    if not 0 <= seed < 2 ** 64:
        raise ValueError(f"{job_id}: seed must be between 0 and 2^64-1")


def validate_workflow(workflow):
    for node_id, class_type in WORKFLOW_NODES.items():
        actual = workflow.get(node_id, {}).get("class_type")
        if actual != class_type:
            raise ValueError(f"workflow node {node_id} must be {class_type}, got {actual!r}")


def available_values(node_info, class_type, input_name):
    node = node_info.get(class_type, {})
    spec = node.get("input", {}).get("required", {}).get(input_name)
    if isinstance(spec, list) and spec and isinstance(spec[0], list):
        return set(spec[0])
    return None


def validate_server(api, workflow):
    node_info = json.loads(request(api, "/object_info", timeout=60))
    missing_nodes = sorted(set(WORKFLOW_NODES.values()) - set(node_info))
    if missing_nodes:
        raise RuntimeError("ComfyUI is missing required nodes: " + ", ".join(missing_nodes))
    missing_models = []
    for class_type, input_name, node_id, workflow_key in MODEL_INPUTS:
        expected = workflow[node_id]["inputs"][workflow_key]
        choices = available_values(node_info, class_type, input_name)
        if choices is not None and expected not in choices:
            missing_models.append(f"{class_type}.{input_name}={expected}")
    if missing_models:
        raise RuntimeError("ComfyUI is missing required models: " + "; ".join(missing_models))


def make_workflow(template, job):
    workflow = json.loads(json.dumps(template))
    workflow["6"]["inputs"]["text"] = job["optimized_prompt"]
    workflow["7"]["inputs"]["text"] = NEGATIVE
    workflow["9"]["inputs"]["seed"] = int(job["seed"])
    workflow["11"]["inputs"]["filename_prefix"] = f"Qwen_GMIC_GPU0_{job['id']}"
    return workflow


def compact_execution_error(prompt_id, messages):
    for event, payload in reversed(messages or []):
        if event == "execution_error":
            return {
                "type": payload.get("exception_type", "execution_error"),
                "message": payload.get("exception_message", "ComfyUI execution failed"),
                "node_id": payload.get("node_id"),
                "node_type": payload.get("node_type"),
                "prompt_id": prompt_id,
            }
    return {"type": "execution_error", "message": "ComfyUI execution failed", "prompt_id": prompt_id}


def compact_exception(exc):
    if isinstance(exc, ExecutionError):
        return exc.details
    if isinstance(exc, urllib.error.HTTPError):
        return {"type": "HTTPError", "message": f"HTTP {exc.code}: {exc.reason}", "url": exc.url}
    return {"type": type(exc).__name__, "message": str(exc)[:2000]}


def write_results(path, results):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def run_job(api, workflow, job, output_dir, timeout):
    prompt_id = json.loads(request(api, "/prompt", {"prompt": workflow}, retries=1))["prompt_id"]
    print(json.dumps({"status": "submitted", "id": job["id"], "prompt_id": prompt_id}, ensure_ascii=False), flush=True)
    started = time.time()
    while time.time() - started <= timeout:
        history = json.loads(request(api, f"/history/{prompt_id}", timeout=30))
        if prompt_id in history:
            item = history[prompt_id]
            status = item.get("status", {})
            if status.get("status_str") == "error":
                raise ExecutionError(compact_execution_error(prompt_id, status.get("messages")))
            images = item.get("outputs", {}).get("11", {}).get("images", [])
            if images:
                remote = images[0]
                target = output_dir / f"{job['id']}.png"
                target.write_bytes(request(api, "/view?" + urllib.parse.urlencode(remote)))
                return {
                    **job,
                    "status": "success",
                    "prompt_id": prompt_id,
                    "seconds": round(time.time() - started, 2),
                    "remote_image": remote,
                    "local_output": str(target.resolve()),
                }
        time.sleep(3)
    raise TimeoutError(f"{job['id']} exceeded {timeout} seconds")


def existing_results(path):
    if not path.exists():
        return {}
    try:
        content = json.loads(path.read_text(encoding="utf-8"))
        return {item["id"]: item for item in content if isinstance(item, dict) and "id" in item}
    except (OSError, json.JSONDecodeError):
        return {}


def main():
    skill_dir = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Run optimized GMIC effect-icon jobs through GPU0 ComfyUI.")
    parser.add_argument("--jobs", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--workflow", type=Path, default=skill_dir / "assets" / "workflow_api.json")
    parser.add_argument("--timeout", type=int, default=2400)
    parser.add_argument("--api-wait", type=int, default=120)
    parser.add_argument("--resume", action="store_true", help="Reuse successful results whose local files still exist.")
    parser.add_argument("--skip-existing", action="store_true", help="Skip a job when <output-dir>/<id>.png already exists.")
    parser.add_argument("--free-memory", action="store_true", help="Explicitly unload models from the shared ComfyUI service before the batch.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    jobs = json.loads(args.jobs.read_text(encoding="utf-8"))
    if not isinstance(jobs, list) or not jobs:
        raise ValueError("jobs must be a non-empty JSON array")
    seen = set()
    for job in jobs:
        validate_job(job)
        if job["id"] in seen:
            raise ValueError(f"duplicate job id: {job['id']}")
        seen.add(job["id"])

    template = json.loads(args.workflow.read_text(encoding="utf-8"))
    validate_workflow(template)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    if args.dry_run:
        payloads = [{"id": job["id"], "api": args.api, "prompt": make_workflow(template, job)["6"]["inputs"]["text"]} for job in jobs]
        print(json.dumps(payloads, ensure_ascii=False, indent=2))
        return

    system_stats = wait_for_api(args.api, args.api_wait)
    validate_server(args.api, template)
    if args.free_memory:
        request(args.api, "/free", {"unload_models": True, "free_memory": True}, timeout=30, retries=1)

    prior = existing_results(args.results) if args.resume else {}
    results = []
    for job in jobs:
        target = args.output_dir / f"{job['id']}.png"
        previous = prior.get(job["id"])
        if args.resume and previous and previous.get("status") == "success" and target.exists():
            result = {**previous, "resumed": True, "local_output": str(target.resolve())}
        elif args.skip_existing and target.exists():
            result = {**job, "status": "success", "skipped_existing": True, "local_output": str(target.resolve())}
        else:
            try:
                result = run_job(args.api, make_workflow(template, job), job, args.output_dir, args.timeout)
            except Exception as exc:
                result = {**job, "status": "error", "error": compact_exception(exc)}
        results.append(result)
        write_results(args.results, results)
        print(json.dumps({"status": result["status"], "id": job["id"], "output": result.get("local_output"), "resumed": result.get("resumed", False)}, ensure_ascii=False), flush=True)

    succeeded = sum(item["status"] == "success" for item in results)
    print(json.dumps({"status": "finished", "api": args.api, "device": system_stats.get("devices", [{}])[0].get("name"), "success": succeeded, "count": len(results)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
