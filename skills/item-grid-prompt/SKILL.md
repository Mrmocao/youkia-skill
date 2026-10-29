---
name: item-grid-prompt
description: Build a fixed 4x4 game-item icon generation prompt from a supported game-art style, a world/theme description, and exactly 16 item descriptions. Use when the user wants Codex to prepare, optimize, assemble, or display a 16-item grid prompt without generating images. Optimize variable content directly with the current Codex model; never call a separate text-model API or rewrite the fixed prompt contract.
---

# Item Grid Prompt

Build and display one final image-generation prompt. Do not generate images unless the user separately asks.

## Workflow

1. Show these available styles before collecting missing input:

   - **火影** — anime cel-shading, clean lineart, flat colors.
   - **皇室战争** — Supercell-style 3D cel-shading, saturated colors, bold outlines, playful proportions.
   - **荒野乱斗** — Supercell-style 3D cel-shading, saturated colors, bold outlines, playful proportions.
   - **饥荒** — scratchy hand-drawn ink lines, muted earthy colors, distressed texture, macabre whimsy.
   - **失落城堡** — hand-painted 2D fantasy action-RPG icons, chunky silhouettes, dark outlines, saturated medieval colors.
   - **茶杯头** — 1930s rubber-hose animation, hand-inked outlines, watercolor/cel-painted colors, vintage warm palette.
   - **海贼王** — high-energy pirate adventure anime, expressive hand-drawn shapes, exaggerated proportions, bold black outlines, vibrant tropical colors, strong cel shading.

   皇室战争和荒野乱斗当前共用仓库中已验证的 Supercell 3D 风格预设。

2. Collect only the missing fields:

   - one style choice;
   - one world/theme subject description;
   - exactly 16 item descriptions in intended row-major order.

3. Use the current Codex model directly to optimize only the variable fields. Do not call `gpt-5.5`, the Responses API, another text-model API, or an external prompt optimizer.

   - Convert the world/theme into one concise English visual context line.
   - Convert every item into a concrete English physical-object description, normally 2–6 words.
   - Preserve the user's meaning, order, named objects, and count.
   - Do not invent, merge, split, remove, or reorder items.
   - Avoid abstract lore prose, actions, camera instructions, and redundant style words in item descriptions.
   - If an item is ambiguous enough to change what is drawn, ask one concise clarification question before assembling.

4. Validate that there are exactly 16 non-empty items. Label their grid mapping when helpful:

   - items 1–4 → row 1;
   - items 5–8 → row 2;
   - items 9–12 → row 3;
   - items 13–16 → row 4.

5. Review the Codex-optimized values against the originals. Correct any lost noun, changed meaning, count error, or ordering error before assembly.

6. Resolve `{baseDir}` to the absolute directory containing this `SKILL.md`, then run `{baseDir}/scripts/assemble_prompt.py` with the optimized theme, chosen style, and 16 optimized items. This script owns the immutable Prompt text. Do not manually paraphrase its output.

7. Display:

   - selected style;
   - optimized world/theme line;
   - numbered optimized item list;
   - final assembled Prompt in one text code block.

8. Stop after displaying the Prompt. Offer generation only if the user asks for it.

## Codex-native optimization

Optimize the values in the current conversation and keep this internal structure:

```json
{"world":"optimized English world/theme","items":["item 1","item 2","...exactly 16 items..."]}
```

Do not require an API key or model configuration. The real structure must contain exactly 16 items in the user's original order.

## Prompt assembly

```text
python "{baseDir}/scripts/assemble_prompt.py" --style naruto --world "<optimized English world/theme>" --item "<item 1>" --item "<item 2>" ... --item "<item 16>"
```

Treat `{baseDir}` as a placeholder and substitute the real absolute Skill directory before execution. Never pass the literal `{baseDir}` to the shell. Never resolve `scripts/assemble_prompt.py` relative to the workspace, repository, current shell directory, or user home. Quote the absolute script path because the migrated Skill directory may contain spaces.

The command is intentionally shown as one line so it is portable across PowerShell, Command Prompt, Bash, and zsh. Supply `--item` exactly 16 times in row-major order.

Allowed style IDs: `naruto`, `clash-royale`, `brawl-stars`, `dont-starve`, `lost-castle`, `cuphead`, `one-piece`.

The fixed Prompt contract, background, layout, constraints, and target use are implemented only in `{baseDir}/scripts/assemble_prompt.py`.
