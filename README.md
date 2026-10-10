# Youkia Skills

Shared Codex skills for the Youkia team.

## Available Skills

| Skill | Version | Purpose |
| --- | --- | --- |
| `grok-imagine-subapi` | 1.1.0 | Generate images and short videos through a direct SubAPI-compatible Grok Imagine endpoint. |
| `sub2api-4k-image-generator-ts` | 0.2.0 | Generate high-resolution images through a Sub2API OpenAI-compatible endpoint with TypeScript tooling. |
| `svn-windows-powershell` | 1.0.0 | Safely inspect, update, resolve, and commit SVN working copies from Windows PowerShell. |

## Repository Layout

Each skill lives in its own directory under `skills/`:

```text
skills/<skill-name>/
|-- SKILL.md          # Skill instructions and usage
|-- agents/           # Optional Codex metadata
`-- scripts/          # Optional implementation scripts
```

## Installing a Skill

Copy the desired skill directory into your local Codex skills directory:

- Windows: `%USERPROFILE%\\.codex\\skills\\`
- macOS/Linux: `~/.codex/skills/`

Restart or reload Codex after installation. Never commit API keys, tokens, cookies, or generated outputs. Use each skill's configuration example to create a local configuration file when needed.

## Adding a Skill

1. Add a self-contained directory under `skills/`.
2. Include a complete `SKILL.md` with configuration, usage, and safety notes.
3. Provide a redacted configuration example instead of real credentials.
4. Add a focused self-test or verification command when the skill depends on an external service.
5. Keep generated files and local credentials out of Git.
