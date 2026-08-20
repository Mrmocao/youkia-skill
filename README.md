# Youkia Skills

Shared Codex skills for the Youkia team.

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
