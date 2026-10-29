# Qwen Multi-angle Character Skill

A portable ComfyUI automation package for generating eight-direction character assets with Qwen Image Edit 2511. It works as a Codex skill through `SKILL.md` and as a general-purpose CLI package for other agents through `AGENTS.md`, `skill.json`, and the scripts.

## Included

```text
qwen-multi-angle-skill/
├── SKILL.md
├── AGENTS.md
├── README.md
├── skill.json
├── requirements.txt
├── agents/openai.yaml
├── assets/qwen-edit-2511-multi-angle-workflow.json
├── references/eight-direction-map.md
├── references/comfyui-requirements.md
├── references/prompt-library.json
├── scripts/generate_angles.py
└── scripts/make_contact_sheets.py
```

## Requirements

- Python 3.10+
- A reachable ComfyUI server, default `http://192.168.5.149:8199`
- The models, LoRAs, VAE, CLIP, and custom nodes named by the bundled workflow

Install the two Python packages with `python -m pip install -r requirements.txt`.

## Quick start

```bash
python scripts/generate_angles.py input.png --template elevated --output-dir outputs/input
```

A complete eight-direction run preserves all eight source renders and automatically writes a labeled `<source>_3x3.png` preview in the same output directory. Pass `--no-contact-sheet` to opt out or `--cell-size` to change the preview cell size.

Use `--template high-angle` for strong top-down perspective. See `AGENTS.md` for agent execution rules and `references/eight-direction-map.md` for orientation semantics.

Model weights and ComfyUI custom nodes are external because they are installation-specific and large. Their exact required names are documented in `references/comfyui-requirements.md`.
