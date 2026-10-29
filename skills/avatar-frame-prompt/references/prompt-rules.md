# Avatar-frame prompt rules

## Fixed 15-field order

1. `asset_type`
2. `frame_shape`
3. `theme`
4. `primary_rim`
5. `ornament_layout`
6. `primary_ornaments`
7. `secondary_details`
8. `materials`
9. `palette_lighting`
10. `render_style`
11. `camera_composition`
12. `portrait_opening`
13. `background`
14. `negative_constraints`
15. `output`

All categories use this order. A category changes values, not the schema.

## Shared defaults

```text
asset_type: a single game avatar frame
camera_composition: front-facing orthographic view, centered and fully visible, the entire frame inside the canvas with safe outer margins
portrait_opening: large clean empty portrait opening, the center must remain completely empty, all ornaments restricted to the rim, no element crossing the inner boundary
background: solid pure black background
negative_constraints: no text, no letters, no numbers, no Chinese characters, no calligraphy, no watermark, no portrait, no character, no face, no scenery or object inside the opening, no cropped edges, no unrelated extra objects
output: game UI avatar frame asset, readable at 256 by 256 pixels
```

## Category presets

| Category | Shape | Layout | Materials | Rendering | Opening |
| --- | --- | --- | --- | --- | --- |
| 休闲萌系 | circular | one or two localized mascot clusters, lightly asymmetrical | glossy colored plastic, soft enamel | bright 2D cartoon mobile-game UI | 65%–70% |
| 节庆主题 | circular | one festival anchor plus one small balancing cluster | painted lacquer, fabric, limited metal | festive 2D mobile-game UI | 62%–68% |
| 竞技徽章 | circular crest | strict bilateral symmetry, strong lower rank anchor | polished metal, gemstone | competitive badge mobile-game UI | 58%–65% |
| 奇幻宝石 | circular | strict bilateral symmetry, top and bottom gemstone anchors | gold, translucent gemstone, enamel | luxurious fantasy mobile-game UI | 58%–65% |
| 硬核机甲 | rounded-square | strict bilateral symmetry, top and bottom mechanical modules | alloy, carbon fiber, armor plate | hard-surface sci-fi game UI | 58%–65% |
| 自然东方 | circular | one-sided growth or bottom-weighted organic balance | wood, jade, flowers, leaves, water | elegant oriental 2D mobile-game UI | 65%–70% |
| 国风2D轻装饰 | circular | exactly two diagonal clusters; remaining 70% circumference plain | lacquer, jade, limited gold trim | Chinese 2D casual mobile-game UI | 68%–72% |
| 宇宙幻想 | circular | one celestial or creature anchor plus sparse starlight | luminous energy, glass, stardust | cosmic fantasy 2D mobile-game UI | 62%–68% |

Machine-readable values live in `category-presets.json`.

## Composition rules

- The portrait opening must be continuous, obvious and usable.
- Ornaments stay on the rim or outside it and never cross the inner boundary.
- Use one theme and no more than two primary ornament anchors.
- Use no more than two secondary-detail families and three material families.
- Use one main color, one supporting color and one small accent color.
- Symmetric categories need equal visual weight; asymmetric categories need deliberate balance.
- The entire frame stays inside the canvas with outer safe margins.

For 国风2D轻装饰 or an explicit sparse diagonal request, use exactly two diagonal ornament clusters, leave the remaining 70% of the circumference plain, and prohibit continuous wreaths, mirrored side ornaments, and four-direction decoration.

## Final assembly pattern

```text
[asset_type],
[frame_shape],
[theme],
[primary_rim],
[ornament_layout],
[primary_ornaments],
[secondary_details],
[materials],
[palette_lighting],
[render_style],
[camera_composition],
[portrait_opening],
[background],
[negative_constraints],
[output]
```

## Validation checklist

- All 15 fields are present in order.
- Layout and ornament positions agree.
- Ornament count stays within the preset.
- Opening has an explicit ratio and no-crossing rule.
- Background does not conflict with negative constraints.
- Materials and colors stay within their limits.
- No contradictory symmetry or density phrases are present.
- Output specification is last.
