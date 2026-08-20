---
name: grok-imagine-subapi
description: Generate raster images through a direct SubAPI-compatible Grok Imagine endpoint, saving the result to a local path. Use when a user asks to call the grok-imagine-image model with a prompt and API credentials.
---

# Grok Imagine SubAPI

Use the bundled Node script for image generation. The script calls the remote SubAPI endpoint directly with `fetch`; it does not use MCP or a local cc-switch proxy.

## Configuration

Create a private local configuration file by copying `config.example.json` to `config.local.json` in this skill directory:

`C:\Users\admin\.codex\skills\grok-imagine-subapi\config.local.json`

```json
{
  "api_key": "YOUR_SUBAPI_API_KEY",
  "base_url": "https://your-direct-subapi-host.example"
}
```

Keep this file private. It is ignored by Git. The `base_url` may be the API root, a `/v1` root, or the complete `/images/generations` endpoint.

The model is always `grok-imagine-image`. Never put an API key in this skill, source code, logs, or generated documentation. Do not substitute another model or route through `127.0.0.1:15721`; the script rejects loopback URLs.

## Run

From the skill directory, run:

```powershell
node .\scripts\generate-image.mjs --prompt "<PROMPT>" --output "<OUTPUT_PATH>"
```

The script reads `config.local.json` by default. You can temporarily override either credential with `--api-key` or `--base-url`, or use another JSON file with `--config`. It accepts successful OpenAI-compatible image responses containing `data[0].b64_json`, `data[0].url`, or a data URL. It creates parent directories when needed and prints a JSON result with `success`, `output`, and response details. Do not print the API key.

## Self-test

After the user supplies the real key and base URL, execute the built-in self-test once:

```powershell
node .\scripts\generate-image.mjs --self-test
```

Self-test uses prompt `simple dashboard ui`, saves to `./test-grok.png`, and prints whether the call and file write succeeded. Report the command result and any HTTP or response-shape error without exposing credentials.
