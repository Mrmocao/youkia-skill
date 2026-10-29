---
name: qwen-multi-angle
description: Generate consistent eight-direction game-character views and labeled 3×3 sheets with a bundled local ComfyUI Qwen Image Edit 2511 workflow.
metadata:
  short-description: Generate Qwen eight-direction game characters
---

# Qwen multi-angle character generation

This skill is self-contained. Use `scripts/generate_angles.py`; its default workflow is the bundled API-format workflow `assets/qwen-edit-2511-multi-angle-workflow.json`, and the default ComfyUI server is `http://192.168.5.149:8199`.

Submit only a ComfyUI **API-format** workflow to `POST /prompt`; a workflow exported for the normal visual interface is not accepted. The helper polls `GET /history/{prompt_id}` and downloads images through `GET /view?filename=...&type=output`. Use `GET /queue` for queue inspection; WebSocket progress is available at `ws://192.168.5.149:8199/ws?clientId={client_id}` but is not required by the current polling implementation.

Choose exactly one independent template:

- `--template high-angle`: strong top-down mobile-strategy unit. It requires visible top surfaces and lower-body foreshortening.
- `--template elevated`: slight top-down stylized character unit. It requires only slightly visible top surfaces and does not use high-angle-only wording.
- `--template base`: compact generic prompt.

Never mix the `high-angle` and `elevated` template descriptions. Use a custom `--prompt` only when requested, retaining the `{direction}` placeholder.

```powershell
python .\scripts\generate_angles.py .\input.png --template elevated --output-dir .\outputs\input
```

The helper uploads the image, rewrites the LoadImage and positive-prompt nodes, queues directions sequentially, polls completion, and downloads outputs. After a complete eight-direction run it also creates a labeled 3×3 preview in the same output directory while preserving every original render. Use `--directions left` for a single view, `--seed` for repeatability, `--cell-size` to control preview resolution, `--no-contact-sheet` to opt out, and `--dry-run` before costly inference. If ComfyUI reports an unknown model or node, fix the installation rather than changing workflow node types silently.

The labeled sheet centers the source and arranges the eight views using the convention in [references/eight-direction-map.md](references/eight-direction-map.md). Every cell shows the English prompt and Chinese direction above the image. Images are proportionally contained and centered without cropping. Pure side views are mirrored only in the sheet so faces point outward; source renders are never changed. `scripts/make_contact_sheets.py` remains available for rebuilding a sheet independently.

Read [references/prompt-library.json](references/prompt-library.json) when composing a different camera/shot combination. For agent-neutral operation outside Codex, follow [AGENTS.md](AGENTS.md); machine-readable entrypoints are in `skill.json`.
