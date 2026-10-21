---
name: youkia-image-codex
description: Generate or edit high-resolution images through a user-configured OpenAI-compatible Sub2API endpoint with Node.js. Use for local image generation, 4K output, streaming/SSE diagnosis, or image edits; use grok-imagine-subapi for Grok Imagine instead.
---

# youkia-image-codex

Use this skill when the user wants a local Node.js script to generate or edit images through their own OpenAI-compatible Sub2API service. The script connects directly to the configured `base_url`; it does not use CC-Switch, MCP, or a local proxy.

## Configure

Copy `config.example.json` to `config.local.json` in this skill folder and fill in your own values. The local file is ignored by Git and must never be included in a ZIP or message:

```json
{
  "api_key": "YOUR_API_KEY",
  "base_url": "https://your-sub2api.example.com/v1",
  "image_model": "gpt-image-2.5-flare",
  "responses_model": "gpt-5.4-mini"
}
```

`base_url` may be the service root or its `/v1` path. The script adds the endpoint path exactly once. Command-line flags take precedence, then `YOUKIA_IMAGE_*`, then `SUB2API_*`, then `config.local.json`. Use `YOUKIA_IMAGE_CONFIG` to point to another configuration file.

## Generate

The compiled entrypoint needs Node.js 22 or newer:

```powershell
node .\dist\generate-image.js "东方古装美女，云海，电影级光影，无文字无水印" --size 3840x2160 --output-dir .\output
```

Use `--output path.png` for one exact output path. Existing files are protected; add `--force` only when overwriting is intentional. The command prints one redacted JSON result containing success, saved files, actual image dimensions, warnings, and errors. API keys, bearer tokens, input-image data, and full server responses are never printed.

Useful options include `--n 1`, `--quality high`, `--output-format png|jpeg|webp`, `--timeout 600`, `--stream` and `--no-stream`. Streaming is enabled by default and is parsed as SSE. Partial images are saved only when no final image is available and are marked as diagnostic files.

## Edit an image

Use the Responses image-generation protocol with a local PNG/JPEG/WebP file or an HTTPS image URL:

```powershell
node .\dist\generate-image.js "保留人物和场景，只把天空改成日落，不改变构图" --endpoint responses --input-image .\input.png --output .\edited.png
```

The service must support the selected model and endpoint. Do not put credentials in prompts, scripts, ZIP files, or source control.

## Verify and diagnose

Run the offline request check before sending a paid request:

```powershell
node .\dist\generate-image.js "test prompt" --dry-run
```

It validates the URL, configuration, payload, and local input without calling the service. Run the bundled unit tests after changing the skill:

```powershell
npm test
npm run build
```

The script does not automatically retry generation because retrying can create duplicate paid jobs. HTTP 401 usually means the key is invalid, 403 means the model or account is unavailable, 429 means quota/rate limiting, and 524 usually means an upstream timeout. Check the service's supported request schema if the response says an option is unsupported.
