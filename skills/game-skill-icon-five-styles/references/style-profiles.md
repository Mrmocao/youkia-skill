# Five game skill-icon profiles

All profiles create stylized game assets, not photorealistic images. Use one profile per generation unless the user explicitly requests a hybrid.

## `LAYERED_2_5D`

**Best for:** richer weapon action, restrained material cues, and spatial depth.

- Use 2–3 readable planes: foreground effect, central subject, restrained background.
- Add selective highlights, contact shadows, and rim light to clarify form, never texture noise.
- Keep it illustrated/cel-shaded. Exclude PBR, photo lighting, pores, realistic fabric, depth of field, and cinematic concept-art rendering.

**Prompt cue:** `stylized 2.5D game skill icon, layered planes, selective material highlights, crisp contact shadows, controlled rim light, polished cel-shaded illustration, not photorealistic`

## `FLAT_DEPTH_CONTRAST`

**Best for:** graphic recognition and strict visual hierarchy.

- Use hard-edged, low-texture 2D cel shading and 2–5 broad color masses.
- Mandatory brightness order: **effect brightest → subject second → background lowest**.
- Reserve white/near-white for energy core, trajectory, impact, or focal rim.
- Avoid broad pure-black or pure-purple backgrounds; use a medium subdued contrast background.

**Prompt cue:** `FLAT_DEPTH_CONTRAST, hard-edged low-texture 2D cel-shaded game icon, one centered subject, effect brightest, subject second, background lowest, no realism, no PBR, no painterly shading, no 3D render`

## `MONOCHROME_CHIBI_SILHOUETTE`

**Best for:** attribute families, unified element sheets, and fast silhouette reading.

- Use one hue family with dark/light adjacent shades; white is limited to edge separation or energy focus.
- Simplify a role, weapon, creature, or symbol into chibi silhouette masses. Keep one focal silhouette.
- Use modest same-family gradient and transparent glow; avoid extra decorative hues, realism, and micro-detail.

**Prompt cue:** `MONOCHROME_CHIBI_SILHOUETTE, circular game skill icon, simplified chibi silhouette, one hue family, dark core and pale rim glow, compact symbolic read, clean cel shading, no text, no photorealism`

## `ANIME_CHIBI_RAYLINE`

**Best for:** character-forward anime/chibi icons with clear linework and directional energy.

- Choose character-faithful chibi preserving 2–4 cues, or a hue-family silhouette. Never combine them as competing subjects.
- Use crisp near-black, white, or luminous contour lines and 2–4 readable color/value groups.
- Build the background from a palette family, not a dead-flat fill. Add exactly one ray grammar: diagonal burst, horizontal sweep, vertical descent, or one-axis radial sweep.
- Rays are translucent pale white plus lighter base hue; never random crisscross beams.

**Prompt cue:** `ANIME_CHIBI_RAYLINE, circular game skill icon, cute anime chibi, crisp outline, palette-family background, translucent pale-white directional rays, clean cartoon cel shading, no text, no realism`

## `BOLD_CHIBI_TRICOLOR`

**Best for:** smallest-size readability, bold cartoon identity, and element-led skill sets.

- Reduce character and weapon to big Q-version masses: one head/hair/helmet cue, one costume mass, and one unmistakable weapon silhouette. Remove micro-decoration and realistic anatomy.
- Use a visibly thick black contour around character/weapon/object with a restrained pale-white outer halo. Do not use thin linework.
- Use 2–3 functional color families only: anchor A, element B, and background C. Black contour and white halo are neutral exceptions.
- Element B uses semantic color: fire orange/red, wind green/mint, water blue, earth brown/ochre, lightning yellow/electric blue, ice pale cyan/white.
- Background C must contrast with B by hue or warm/cool relationship. Examples: gold on muted blue-grey/blue-green; water blue on ochre/brown; green on burgundy/red-brown or muted violet.
- In a normal nine-icon set, maximum two character-action cells; use at least three pure weapon, element, light, crest, impact, barrier, rune, projectile, orbit, or summon cells.

**Prompt cue:** `BOLD_CHIBI_TRICOLOR, abstract cute anime chibi game skill icon, [character/weapon or pure element-light-object] focal subject, thick black outline, thin pale-white halo, strict palette A [anchor] + B [element] + C [contrast background], crisp cel shading, no text, no realism, no PBR, no 3D, no thin linework`
