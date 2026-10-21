---
name: grok-imagine-subapi
description: Generate images, text-to-video, or reference-image videos through a direct SubAPI-compatible Grok Imagine endpoint; save and inspect results, diagnose gateway errors, and resume existing video jobs.
metadata:
  version: 1.2.0
---

# Grok Imagine SubAPI

Use the bundled Node.js scripts (Node 20+). They call the configured provider directly, without MCP or the CC-Switch proxy. Resolve script paths relative to this skill directory; commands below run from that directory.

## Configuration

Copy `config.example.json` to `config.local.json` beside this file and fill in `api_key` and `base_url`. The scripts load that file regardless of the current working directory. `--config` selects an alternative. Host roots, `/v1`, `/v1/images/generations`, `/v1/videos`, and `/v1/videos/generations` normalize to the same API root.

Keep keys in the configuration file, not prompts or command arguments. Never upload local configuration, job records, generated media, or credential-bearing logs. Share only the example configuration.

## Images

```powershell
node scripts/generate-image.mjs --prompt "A red ball on a white floor" --output ./output/ball.jpg
node scripts/generate-image.mjs --prompt-file ./prompt.txt --output ./output/image.jpg
```

The image model remains `grok-imagine-image`; the request contains only `model`, `prompt`, `n: 1`, and `response_format: "b64_json"`. This script is text-to-image, not image editing. Do not add unsupported image parameters such as `stream`, `size`, `quality`, or `partial_images`.

## Video and reference images

```powershell
node scripts/generate-video.mjs --prompt "A kitten fishing by a pond" --duration 5 --output ./output/kitten.mp4
node scripts/generate-video.mjs --prompt-file ./storyboard.txt --reference ./character.png --duration 15 --output ./output/character.mp4
```

The video model remains `grok-imagine-video`; `duration` is an integer from 1 to 15, default 5. Creation uses `/v1/videos/generations`; status uses `/v1/videos/{request_id}` and content uses `/v1/videos/{request_id}/content`. The tested Sub2API gateway also accepts `/v1/videos` for creation; switching between these routes does not fix account eligibility failures.

`--reference` reads the actual PNG, JPEG or WebP file, detects its MIME type, and sends an `image.url` data URL. The local upload guard is 20 MiB; this is not a promise about provider limits. For a user-specified character reference, pass that file or an explicitly derived resized copy; a text description is not a substitute. Distinguish character identity references from examples used only for camera or style. No implicit use of historical pictures. Preserve the original file. Resize or composite transparency deliberately if needed and disclose material changes.

Use `--prompt-file` for long or multiline prompts and dialogue. Prompt and prompt-file are mutually exclusive. Both scripts accept `--savePath` as an output alias and refuse to overwrite existing outputs. Choose a new revision filename. Run `--help` for all options.

## Resume instead of generating again

The video script writes `<output>.job.json` before POST, then saves the provider request ID as soon as it arrives. The record contains the API root, local output path, hashes, reference metadata, and task state, but no API key or reference bytes. It is a local recovery artifact, not a distributable file.

```powershell
node scripts/generate-video.mjs --resume ./output/character.mp4.job.json
node scripts/generate-video.mjs --resume ./output/character.mp4.job.json --output ./output/recovered.mp4
```

Use the original provider and API key for recovery. Resume never sends a generation POST. `--timeout` is the total time budget for one run (default 600000 ms for video, 120000 ms for image); `--poll-interval` defaults to 5000 ms. Unknown statuses keep polling until timeout, never count as success. Only status GETs have limited transient retries; creation is never automatically retried.

If no request ID was received, the provider may still have accepted the request. Check provider history before submitting again. A saved job without an ID cannot be resumed automatically. Do not interpret timeout as proof that no charge or job exists.

## Verification and diagnosis

```powershell
node scripts/generate-video.mjs --prompt "test" --output ./output/check.mp4 --dry-run
node scripts/diagnose.mjs
node --test tests/generation.test.mjs
node scripts/inspect-media.mjs --input ./output/character.mp4
```

`--dry-run` validates configuration, input and output paths without networking or creating a task. `diagnose.mjs` reads `/v1/models` only; successful model listing does not prove generation eligibility. `--self-test` on either generator makes a real paid generation request, so it is not an offline diagnostic. Tests mock the provider and do not spend credits.

Successful downloads are checked for image signatures or MP4 container structure. Results report actual format, dimensions, video duration and audio-track presence; extension mismatches and duration differences produce warnings. This is not a full codec decode or semantic review. Review key frames for character consistency and requested action. Verify speech by listening or transcription before claiming exact dialogue, pronunciation, lip synchronization, or scene timing. Report requested settings separately from actual output; requesting cinematic quality does not guarantee HD or 4K.

For 503 `grok_media_no_eligible_account`, authentication failures, model restrictions or interrupted jobs, read [references/troubleshooting.md](references/troubleshooting.md). Never change platform account settings solely because a 503 occurred.
