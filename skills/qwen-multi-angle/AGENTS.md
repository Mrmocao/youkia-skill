# Qwen eight-direction character workflow

This directory is a self-contained, agent-neutral package. An agent does not need Codex-specific APIs: use the Python CLI scripts and a local ComfyUI HTTP server.

## Objective

Turn one character image into eight consistent game-unit views, optionally compose them around the source image in a labeled 3×3 sheet.

## Execution contract

1. Confirm `http://192.168.5.149:8199/system_stats` is reachable, or pass another URL with `--server`.
2. Use `scripts/generate_angles.py`. The bundled API-format workflow is `assets/qwen-edit-2511-multi-angle-workflow.json`.
3. Choose exactly one independent template:
   - `--template high-angle`: strong top-down game unit.
   - `--template elevated`: slight top-down stylized character unit.
   - `--template base`: compact generic prompt.
4. Do not merge wording between `high-angle` and `elevated`. Use `--prompt` only when the user explicitly requests a custom template; it must contain `{direction}`.
5. Queue directions sequentially to avoid VRAM spikes. Stop and report if ComfyUI rejects a model, node, or workflow; do not silently replace node types.
6. A complete eight-direction generation automatically creates a labeled 3×3 preview. Center the source. Use `back_right / back / back_left` across the top and `front_right / front / front_left` across the bottom; the four diagonal cells are intentionally horizontally swapped. Show the English prompt and Chinese direction above every cell. Proportionally contain and center each image without cropping. Pure side views are mirrored only in the presentation sheet so faces point outward; generated source files remain unchanged. Use `--no-contact-sheet` only when the user opts out.

## ComfyUI API

- Web UI: `http://192.168.5.149:8199/`
- Submit API-format workflow: `POST http://192.168.5.149:8199/prompt`
- Poll result: `GET http://192.168.5.149:8199/history/{prompt_id}`
- Inspect queue: `GET http://192.168.5.149:8199/queue`
- Download output: `GET http://192.168.5.149:8199/view?filename={filename}&type=output`
- WebSocket progress: `ws://192.168.5.149:8199/ws?clientId={client_id}`

The request body must contain a workflow exported in ComfyUI API format, not the ordinary UI workflow JSON.

## Commands

Install Python dependencies:

```bash
python -m pip install -r requirements.txt
```

Validate without inference:

```bash
python scripts/generate_angles.py path/to/character.png --template elevated --dry-run
```

Generate all eight directions:

```bash
python scripts/generate_angles.py path/to/character.png --template elevated --output-dir outputs/character
```

Generate a subset:

```bash
python scripts/generate_angles.py path/to/character.png --template elevated --directions left,front_left
```

Create a sheet from a directory containing one source image:

```bash
python scripts/make_contact_sheets.py --input-dir source --renders-dir outputs/character --output-dir outputs/sheets --camera-angle elevated --shot-size "medium shot"
```

## References

- `references/eight-direction-map.md`: direction names, Chinese labels, and layout.
- `references/prompt-library.json`: composable prompt vocabulary and translations.
- `references/comfyui-requirements.md`: external model and node requirements.
- `skill.json`: machine-readable entrypoints and defaults.
