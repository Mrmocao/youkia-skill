"""Deterministically assemble the immutable 4x4 item-grid prompt."""

from __future__ import annotations

import argparse
import sys


STYLE_PRESETS = {
    "naruto": (
        "cel-shading anime art style, clean lineart, flat colors, "
        "vibrant saturated colors, sharp readable highlights"
    ),
    "clash-royale": (
        "Supercell 3D cel-shaded rendering, bright saturated colors, "
        "clean bold outlines, playful cartoon proportions"
    ),
    "brawl-stars": (
        "Supercell 3D cel-shaded rendering, bright saturated colors, "
        "clean bold outlines, playful cartoon proportions"
    ),
    "dont-starve": (
        "hand-drawn scratchy ink illustration, uneven black outlines, "
        "muted earthy colors, distressed paper texture, macabre whimsical survival aesthetic"
    ),
    "lost-castle": (
        "2D hand-painted fantasy action RPG icon style, chunky silhouettes, "
        "bold dark outlines, saturated medieval colors, painterly cel shading"
    ),
    "cuphead": (
        "1930s rubber-hose cartoon animation, hand-inked outlines, "
        "watercolor cel-painted colors, vintage film-era shapes, limited warm palette"
    ),
    "one-piece": (
        "One Piece-inspired high-energy pirate adventure anime icon style, expressive hand-drawn shapes, "
        "exaggerated playful proportions, bold clean black outlines, vibrant tropical colors, strong cel shading, "
        "chunky readable silhouettes, whimsical nautical ornamentation, humorous fantasy details, dramatic highlights"
    ),
}


def assemble_prompt(style: str, world: str, items: list[str]) -> str:
    if style not in STYLE_PRESETS:
        raise ValueError(f"Unknown style: {style}")

    world = world.strip().rstrip(".,")
    cleaned_items = [item.strip().rstrip(".,") for item in items]

    if not world:
        raise ValueError("World/theme description must not be empty")
    if len(cleaned_items) != 16:
        raise ValueError(f"Exactly 16 items are required; received {len(cleaned_items)}")
    if any(not item for item in cleaned_items):
        raise ValueError("Item descriptions must not be empty")

    item_list = ", ".join(cleaned_items)
    style_prompt = STYLE_PRESETS[style]

    return "\n".join(
        [
            "16 game item icons arranged in 4 rows of 4, evenly spaced,",
            "no visible grid lines or borders between icons,",
            f"{world},",
            f"items: {item_list},",
            "each icon standalone, centered in its own position, fully visible with spacing around it,",
            f"{style_prompt},",
            "pure green #00FF00 solid background,",
            "no text, no watermark, no extra objects, no overlapping icons, no cropped icons,",
            "game item UI asset, designed to remain readable at 256 by 256 pixels",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Assemble a fixed 4x4 item-grid image-generation prompt"
    )
    parser.add_argument("--style", required=True, choices=sorted(STYLE_PRESETS))
    parser.add_argument("--world", required=True, help="Optimized English world/theme line")
    parser.add_argument(
        "--item",
        action="append",
        default=[],
        help="Optimized English item description; repeat exactly 16 times",
    )
    args = parser.parse_args()

    try:
        print(assemble_prompt(args.style, args.world, args.item))
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
