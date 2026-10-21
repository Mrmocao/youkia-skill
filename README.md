# Youkia Skills

Shared Codex skills and the company skill platform source snapshot.

## Skills

Snapshot: 2026-10-21. Published skills are synchronized from the company platform ZIPs. Grok 1.2.0 is the new tested local revision submitted for company review; GitHub availability does not imply company approval.

| Skill | Version | Company platform status |
| --- | --- | --- |
| `grok-imagine-subapi` | 1.2.0 | Company review pending |
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

For platform deployment see `platform/README.md`. Its data directory starts empty; restore approved catalog data separately. The GitHub skill directory may contain a proposed version still under company review; do not automatically publish it as an approved platform package.

Never commit local credentials, browser profiles, job records, generated output or private submission/contact metadata. Third-party runtimes and license files included by published skills are retained.
