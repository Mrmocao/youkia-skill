# Youkia Skills

Shared Codex skills and the company skill platform source snapshot.

## Skills

Snapshot: 2026-10-29. Published skills and the company platform recovery snapshot are synchronized here. Grok 1.2.0 is now promoted and published.

| Skill | Version | Company platform status |
| --- | --- | --- |
| `grok-imagine-subapi` | 1.2.0 | Published |
| `sub2api-4k-image-generator-ts` | 0.3.1 | Published |
| `svn-windows-powershell` | 1.0.0 | Published |
| `youkia-gm` | 0.1.2 | Published |
| `youkia-midjourney-mcp` | 1.0.0 | Published |
| `youkia-local-server` | 0.1.0 | Published |
| `youkia-jira` | 0.1.0 | Published |
| `youkia-image-codex` | 1.0.0 | Published |

## Layout and installation

- `skills/<id>/`: complete installable skill files, including required runtime assets.
- `catalog.json`: version/status inventory.
- `platform/`: current workspace platform source and deployment templates; no production database, pending submissions, credentials or account records.

Copy a desired skill directory to `~/.codex/skills/` (Windows: `%USERPROFILE%\.codex\skills\`). Create a local configuration from the skill's example if needed. Reload the Agent's skills or start a new session.

For Grok validation, run `node --test skills/grok-imagine-subapi/tests/generation.test.mjs`. Generation smoke tests use provider credits; `--dry-run` does not. Grok 1.2.0 adds reference images, prompt files, recoverable video jobs, sanitized diagnostics and image/MP4 inspection. Existing output files are protected.

For platform deployment see `platform/README.md`. Its data directory starts empty; restore approved catalog data separately. The published catalog and recovery snapshot are synchronized with the company platform; local credentials and runtime state remain excluded.

Never commit local credentials, browser profiles, job records, generated output or private submission/contact metadata. Third-party runtimes and license files included by published skills are retained.

## Platform recovery

`platform/` contains the latest platform source, including the AI-first `/agent-guide.md`, `/llms.txt`, `/openapi.json` and MCP guide. `platform/restore-data/` is a sanitized recovery snapshot of the eight published catalog entries and ZIP packages; it excludes `.env`, administrator passwords, pending contact metadata and runtime secrets. After a server reset, copy the platform source, restore `platform/restore-data` as `data`, set a new `ADMIN_PASSWORD`, and run the documented Node/Nginx or Docker deployment.

## Platform 2.6.0

Independent multi-select job roles can be combined with skill categories and tags. Web and MCP submissions require an uploader name; approved releases retain contributor/version history. Administrators can edit roles and complete missing names on legacy pending submissions before approval. Historical unknown names are shown explicitly and are not inferred.
