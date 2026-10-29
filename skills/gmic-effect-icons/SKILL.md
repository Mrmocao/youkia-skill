---
name: gmic-effect-icons
description: Optimize a user's short game-effect idea into a Qwen-Image GMIC skill-icon prompt, generate it through the configured GPU0 ComfyUI API, and produce a traceable WebP preview showing the original input beside the result. Use for GMIC/Qwen game skill icons and effect-icon batches; do not use for character portraits or general image editing.
---

# ComfyUI GMIC Effect Icons

Preserve the user's original wording, create a separate optimized prompt, run the supplied Qwen-Image GMIC workflow on GPU0, and make a WebP proof sheet.

## Workflow

1. Record the user's text verbatim as `user_input`. Do not silently replace it with an interpretation.
2. Read [references/prompt-template.md](references/prompt-template.md), then write `optimized_prompt` in English. Preserve the requested subject, element, palette, action, and mood; add only useful visual detail.
3. Start `optimized_prompt` with the exact trigger `gmic icon_\(Game ai Institute\)` once. Keep negative constraints out of the positive prompt unless they are essential subject exclusions.
4. Create a UTF-8 jobs JSON using the schema in the reference. For several distinct effects, make one job per effect with a stable `id`, display `name`, fixed `seed`, verbatim `user_input`, and `optimized_prompt`.
5. Call `scripts/run_effect_icon.py`. Its fixed default endpoint is GPU0 at `http://192.168.5.149:8199`; do not change the endpoint unless the user explicitly requests another service. The script waits for API readiness, validates required nodes and model names, writes the optimized prompt to workflow node `6`, the shared negative prompt to node `7`, the seed to node `9`, and the filename prefix to node `11`.
6. Keep every generated PNG. Run `scripts/build_webp_preview.py` to create a WebP proof sheet containing each original `user_input`, Seed, and final image.
7. Report the API address, success count, output directory, jobs JSON, result JSON, and WebP path. Note any mismatch between the original input and the output.

## Commands

```powershell
python scripts/run_effect_icon.py --jobs jobs.json --output-dir output --results results.json --resume
python scripts/run_effect_icon.py --jobs jobs.json --output-dir output --results results.json --dry-run
python scripts/build_webp_preview.py --cases jobs.json --images-dir output --output preview.webp
```

Use `python3` instead of `python` on hosts where that is the available command. Install the only non-standard dependency with `python -m pip install -r requirements.txt`.

## Constraints

- The API call is an external mutation. Use it only when the user asked to generate or test images.
- Never discard or overwrite the user's original input. `user_input` and `optimized_prompt` must remain separately inspectable.
- Do not add characters, UI, labels, logos, or readable text unless requested.
- Use the bundled workflow in `assets/workflow_api.json`; do not mutate the user's original workflow file.
- Read-only API checks use bounded retries; prompt submission is never replayed automatically because ComfyUI does not provide an idempotency key.
- Record a failed job compactly, continue with remaining jobs, and report partial success. Do not retry indefinitely.
- Prefer `--resume`; use `--skip-existing` only when existing PNGs are trusted. The job `id` is restricted to lowercase ASCII letters, digits, `_`, and `-`.
- Do not unload models on a shared server by default. Use `--free-memory` only when the user explicitly wants to clear GPU0 model state.
- The preview requires Pillow and a CJK font. Pass `--font`, or set `GMIC_PREVIEW_FONT`, when no common Windows/macOS/Linux Chinese font is installed.
- The default 1024×1024, 20-step workflow is intentionally fixed for comparable tests. Change it only when the user requests a different tradeoff.

For the validated ten-effect sample, use `assets/ten_test_cases.json`.

When installing this skill in WorkBuddy, OpenClaw, LobsterAI, or another AgentSkills host, read [references/portability.md](references/portability.md).
