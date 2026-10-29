---
name: lovart-api-client
description: Configure and call the Lovart Agent OpenAPI for image, video, audio, 3D, project, thread, upload, download, and model-selection tasks. Use when the user asks to configure Lovart Access Key/Secret Key, test Lovart connectivity, generate or edit media through Lovart, choose a Lovart generation model, or manage Lovart projects and conversations.
---

# Lovart API Client

Use only the scripts bundled in this Skill. Resolve `{baseDir}` as this Skill folder. Require Python 3.9+; do not install third-party packages.

## First-use credential workflow

Before the first Lovart operation in each conversation, run:

```bash
python "{baseDir}/scripts/configure.py" --check --validate
```

If it exits with code 2 or reports missing credentials, tell the user exactly:

```text
未检测到 Lovart API 密钥。请按以下步骤操作：
lovart 官方-->点击lovart龙虾 -->创建API密钥-->复制发送给我
```

Wait for both Access Key and Secret Key. Do not invent either value.

After the user supplies both keys:

1. Put them only into the current process as `LOVART_ACCESS_KEY` and `LOVART_SECRET_KEY`.
2. Run `python "{baseDir}/scripts/configure.py" --from-env`.
3. The script saves them to `{baseDir}/conf/config.json` and calls Lovart to validate authentication.
4. If the command succeeds, tell the user exactly: `lovart api 已配置成功`.
5. If validation fails, show the error and ask the user to verify the two keys. Do not claim success.

Never print, quote, summarize, log, revoke, rotate, delete, or mask-reveal saved credentials. Keep them until the user explicitly asks to replace or remove them. The file is intentionally excluded by `.gitignore`; manual folder copies still include it.

## Run Lovart commands

Always invoke Lovart through the configuration-aware wrapper:

```bash
python "{baseDir}/scripts/run_lovart.py" COMMAND [OPTIONS]
```

Do not call Lovart URLs directly and do not modify `scripts/agent_skill.py` while executing a task. This bundled file is the official zero-dependency Lovart client.

## Required state check

Before the first generation in a conversation, run in order:

```bash
python "{baseDir}/scripts/run_lovart.py" config --json
python "{baseDir}/scripts/run_lovart.py" threads --json
```

- Reuse `active_project` when present.
- If no active project exists, ask whether to use an existing project ID or create a new project. Wait for the answer.
- Reuse a recent related thread with `--thread-id`; omit it only for an unrelated topic.
- Never create a new project without explicit user approval.

## Generate and download

Use `chat`, wait for completion, request JSON, and download artifacts:

```bash
python "{baseDir}/scripts/run_lovart.py" chat --prompt "USER_PROMPT" --json --download --output-dir "OUTPUT_DIR"
```

Pass the user's prompt faithfully. Add `--prefer-models` when the user selects a model. Examples:

```bash
--prefer-models '{"IMAGE":["generate_image_gpt_image_2"]}'
--prefer-models '{"IMAGE":["generate_image_nano_banana_pro"]}'
```

Other useful commands include `projects`, `create-project`, `project-add`, `project-switch`, `threads`, `status`, `result`, `confirm`, `upload`, `download`, `set-mode`, and `query-mode`. Obtain exact flags with `COMMAND --help`; never guess flags or endpoints.

## Completion handling

- `done`: verify `generation_succeeded`, deliver every `downloaded[].local_path`, and append `https://www.lovart.ai/canvas?projectId={project_id}`.
- `pending_confirmation`: show the estimated credit cost and wait for explicit user approval before running `confirm`.
- `timeout`: deliver partial downloads, then poll with `result --thread-id ... --json --download` until terminal status.
- `abort`: report that generation was aborted.
- `done` without artifacts or with `generation_succeeded: false`: show `warning` and `agent_message`; do not call it successful.
- Authentication failure: rerun the credential workflow; never expose the stored values.

When a local image, video, or audio file is downloaded, present that file to the user instead of only returning its remote URL.
