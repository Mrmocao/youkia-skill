---
name: game-skill-icon-five-styles
description: Generate readable 3×3 game skill-icon sheets from character references in LAYERED_2_5D, FLAT_DEPTH_CONTRAST, MONOCHROME_CHIBI_SILHOUETTE, ANIME_CHIBI_RAYLINE, or BOLD_CHIBI_TRICOLOR. Use for character-derived ability icons, style comparison boards, and portable prompt packs across image-capable Agent applications.
---

# Game Skill Icon Five Styles

Create coherent game skill-icon sheets from character art or a reliable role brief. This skill is provider-neutral: it works with Codex, WorkBuddy, 网易龙虾, Lovart, and other image-capable Agents. It specifies visual intent and prompt structure; it assumes no particular model, API, upload endpoint, filesystem, or canvas tool.

## Input and permissions

- Identify the role's archetype, primary weapon/focus, element, combat temperament, and 2–4 recognisable features before planning.
- Preserve the supplied weapon/focus and combat identity unless the user explicitly requests a redesign.
- If a host must transmit a reference to an external service, state the destination and obtain permission immediately before upload. Native/local generation does not need external-upload approval.

## Select exactly one style

- `LAYERED_2_5D` — illustrated depth, controlled highlights/shadows, and action emphasis.
- `FLAT_DEPTH_CONTRAST` — hard-edged flat illustration with effect brightest → subject second → background lowest.
- `MONOCHROME_CHIBI_SILHOUETTE` — hue-family chibi silhouettes with restrained white rim/glow.
- `ANIME_CHIBI_RAYLINE` — anime/chibi subject, clear contour linework, and one-direction translucent rays.
- `BOLD_CHIBI_TRICOLOR` — abstract Q-version subject, bold black contour plus pale halo, strict anchor A + element B + contrast background C.

Read [references/style-profiles.md](references/style-profiles.md) for the chosen profile. Read [references/universal-workflow.md](references/universal-workflow.md) for platform-neutral handoff and previews.

## Plan before prompting

For a standard 3×3 sheet:

1. Draft nine distinct concepts with one central subject and one motion grammar each: orbit, burst, multi-projectile, descent, impact, barrier, rune, or diffusion.
2. Use 3–4 weapon-led skills when the role has a clear main weapon; keep their actions meaningfully distinct.
3. Unless character-action portraits are explicitly requested, use a full/half-body character in at most two cells. Use weapons, projectiles, crests, impacts, elemental objects, or light effects for the rest.
4. Build prompts as: `asset/style → identity cues → central subject → action → energy path/result → palette/value → background → exclusions`.
5. Require every cell to be a standalone icon with no text, logo, watermark, UI frame, or shared narrative scene.

## Deliverables

Return or save the skill plan, prompts, a concise negative-constraint block, and review role fidelity, weapon fidelity, central-subject clarity, style adherence, and icon-scale readability. For comparisons, use one row per character: `Input → selected style output(s)`.
