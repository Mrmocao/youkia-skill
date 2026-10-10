---
name: grok-imagine-subapi
description: Generate images or short videos through a direct SubAPI-compatible Grok Imagine endpoint and save them locally. Use when the user requests Grok Imagine media generation.
---

# Grok Imagine SubAPI

Use the bundled Node.js scripts. They call SubAPI directly and do not use MCP or a local proxy.

## Configuration

Read credentials from `config.local.json` next to this skill:

```json
{
  "api_key": "YOUR_SUBAPI_API_KEY",
  "base_url": "https://your-subapi-host.example/v1"
}
```

Keep `config.local.json` private. The scripts never hard-code or print credentials.

For images, the model is fixed to `grok-imagine-image`. The request body contains only `model`, `prompt`, `n: 1`, and `response_format: "b64_json"`. Do not add `stream`, `size`, `quality`, or `partial_images`.

For videos, the model is fixed to `grok-imagine-video`. The script sends `model`, `prompt`, and `duration` to `/v1/videos`, polls the request ID, and downloads the completed MP4. `duration` is 1–15 seconds and defaults to 5.

## Commands

```powershell
node scripts/generate-image.mjs --prompt "simple dashboard ui" --output ./dashboard.png
node scripts/generate-video.mjs --prompt "5-second video of a cute kitten fishing beside a pond" --duration 5 --output ./kitten-fishing.mp4
```

Both scripts accept `--savePath` as an alias for `--output`. Run `--self-test` on either script after configuring the key.
