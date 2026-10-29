# Portable workflow

## Request contract

| Field | Meaning |
|---|---|
| `character_reference` | Attached image, local path, or approved remote reference. |
| `style` | One of the five profile IDs. |
| `skills` | Named skills/functions, or derive a balanced nine-icon plan. |
| `output_mode` | Individual icons, a 3×3 sheet, or both. |
| `target_platform` | Optional host selected by the user. |
| `upload_permission` | Required only before sending a reference to a named external service. |

## Capability routing

1. Use the host's attachment/local-image mechanism for reference intake.
2. Use the host's native image generator when available.
3. If generation is remote, identify the provider and request permission before upload.
4. Use the host's composition/canvas/image tooling for previews. If unavailable, return a manifest of input and output files.

## Platform-neutral handoff

Use this same brief with WorkBuddy, 网易龙虾, Lovart, Codex, or a comparable Agent:

```text
Task: Generate a 3×3 game skill-icon sheet.
Reference role: Preserve identity, weapon/focus, palette cues, and combat temperament.
Style: <one profile ID plus its rules>.
Skill plan: <nine distinct subjects and motion grammars>.
Composition: standalone circular/rounded icons, one visual core per cell, no text or watermark.
Constraints: <profile exclusions, palette/value rules, silhouette quota>.
```

## Comparison preview

For five styles, place each character on one row:

`Input → LAYERED_2_5D → FLAT_DEPTH_CONTRAST → MONOCHROME_CHIBI_SILHOUETTE → ANIME_CHIBI_RAYLINE → BOLD_CHIBI_TRICOLOR`

Include a compact legend naming the purpose of each style. Do not substitute unrelated page screenshots for matched, character-by-character outputs.
