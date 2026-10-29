# Cross-agent runtime requirements

The skill logic is portable, but the execution host must provide:

- Python 3.9 or later.
- Pillow from `requirements.txt` for WebP previews.
- File read/write permission for jobs, PNG outputs, results, and previews.
- Network access to the default GPU0 ComfyUI API at `http://192.168.5.149:8199`.
- A Chinese-capable font; set `GMIC_PREVIEW_FONT` or pass `--font` when automatic discovery fails.

The ComfyUI server must expose the required core node classes and the exact model names in `assets/workflow_api.json`. The runner checks both before submitting work.

`agents/openai.yaml` is Codex UI metadata. Other AgentSkills-compatible hosts may ignore that directory while still using `SKILL.md`, `scripts`, `references`, and `assets`.

For OpenClaw-compatible hosts, place the skill directory under `<workspace>/skills` or the host's user-level skills directory. For WorkBuddy, import the ZIP whose root contains the `gmic-effect-icons` folder.
