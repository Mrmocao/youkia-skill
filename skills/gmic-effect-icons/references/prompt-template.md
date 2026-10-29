# Prompt optimization and job schema

## Optimization order

Build one concise comma-separated English prompt in this order:

1. Exact LoRA trigger: `gmic icon_\(Game ai Institute\)`.
2. Primary subject: one immediately readable skill object or concentrated effect.
3. Action and direction: burst, spiral, impact, sweep, descent, bloom, or another motion actually implied by the input.
4. Materials and energy behavior: flame, lightning branches, translucent ice, liquid poison, rock cracks, light ribbons, and similar concrete properties.
5. Palette and lighting: retain user colors; add a compatible background and focal glow.
6. Composition: centered skill-icon framing with a strong silhouette; use radial, diagonal, or symmetrical structure only when it supports the concept.
7. Output intent: premium fantasy mobile game ability icon, polished 2D digital painting, crisp edges, readable at thumbnail size.

Do not let generic style language overwhelm the requested subject. Avoid unrelated props, characters, hands, UI, labels, borders, logos, watermarks, and readable text unless explicitly requested.

## Job schema

```json
[
  {
    "id": "02_thunder_spear",
    "name": "雷霆神枪",
    "user_input": "雷霆神枪，纵向武器构图，雷电分叉，金蓝配色",
    "seed": 42102002,
    "optimized_prompt": "gmic icon_\\(Game ai Institute\\), one celestial spear made entirely of blue lightning descending diagonally, sharp golden spearhead wrapped in branching electric arcs, small fragments of charged crystal, deep midnight blue background, no wielder, no humans, isolated centered weapon skill effect, strong diagonal motion, premium fantasy mobile game ability icon, luminous 2D digital painting, crisp silhouette, dramatic energy glow"
  }
]
```

`user_input` is verbatim and appears in the WebP proof sheet. `optimized_prompt` is the only field written to the positive CLIP text node.
