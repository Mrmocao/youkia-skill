#!/usr/bin/env python3
"""Assemble and validate an avatar-frame prompt with the Python standard library."""

import argparse
import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PRESETS_PATH = BASE_DIR / "references" / "category-presets.json"


def load_json(path):
    with Path(path).open("r", encoding="utf-8") as file:
        return json.load(file)


def require_text(data, key):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing non-empty string: {key}")
    return value.strip()


def assemble(data, presets):
    category = require_text(data, "category")
    if category not in presets:
        raise ValueError("Unknown category: " + category)
    preset = presets[category]
    theme = require_text(data, "theme")
    palette = require_text(data, "palette_lighting")
    ornaments = data.get("primary_ornaments")
    if not isinstance(ornaments, list) or not ornaments:
        raise ValueError("primary_ornaments must be a non-empty list")
    ornaments = [str(item).strip() for item in ornaments if str(item).strip()]
    if len(ornaments) > preset["max_primary_ornaments"]:
        raise ValueError(f"{category} allows at most {preset['max_primary_ornaments']} primary ornaments")

    overrides = data.get("optional_overrides") or {}
    additions = overrides.get("negative_constraints", [])
    if not isinstance(additions, list):
        raise ValueError("optional_overrides.negative_constraints must be a list")
    negative = "no text, no letters, no numbers, no Chinese characters, no calligraphy, no watermark, no portrait, no character, no face, no scenery or object inside the opening, no cropped edges, no unrelated extra objects"
    if additions:
        negative += ", " + ", ".join(str(item).strip() for item in additions if str(item).strip())

    fields = [
        "a single game avatar frame",
        overrides.get("frame_shape", preset["frame_shape"]),
        theme,
        overrides.get("primary_rim", preset["primary_rim"]),
        overrides.get("ornament_layout", preset["ornament_layout"]),
        ", ".join(ornaments),
        overrides.get("secondary_details", "sparse restrained secondary details confined near the primary ornament clusters"),
        overrides.get("materials", preset["materials"]),
        palette,
        overrides.get("render_style", preset["render_style"]),
        "front-facing orthographic view, centered and fully visible, the entire frame inside the canvas with safe outer margins",
        "large clean empty portrait opening occupying about " + preset["portrait_opening_ratio"] + " of the frame width, the center must remain completely empty, all ornaments restricted to the rim, no element crossing the inner boundary",
        overrides.get("background", "solid pure black background"),
        negative,
        "game UI avatar frame asset, readable at " + overrides.get("target_size", "256 by 256 pixels"),
    ]
    return ",\n".join(fields)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="UTF-8 JSON input file")
    parser.add_argument("--output", help="Optional UTF-8 prompt output file")
    args = parser.parse_args()
    try:
        prompt = assemble(load_json(args.input), load_json(PRESETS_PATH))
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2
    if args.output:
        Path(args.output).write_text(prompt + "\n", encoding="utf-8")
    else:
        print(prompt)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
