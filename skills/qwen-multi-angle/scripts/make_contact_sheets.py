#!/usr/bin/env python3
"""Compose each input and its eight directional renders into a labeled 3x3 sheet."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


LABELS = {
    "front": ("<sks> front view high-angle shot wide shot white background", "正面 + 高度俯视 + 广角 + 白色背景"),
    "front_right": ("<sks> front-right quarter view high-angle shot wide shot white background", "右前45° + 高度俯视 + 广角 + 白色背景"),
    "right": ("<sks> right side view high-angle shot wide shot white background", "右侧面 + 高度俯视 + 广角 + 白色背景"),
    "back_right": ("<sks> back-right quarter view high-angle shot wide shot white background", "右后45° + 高度俯视 + 广角 + 白色背景"),
    "back": ("<sks> back view high-angle shot wide shot white background", "背面 + 高度俯视 + 广角 + 白色背景"),
    "back_left": ("<sks> back-left quarter view high-angle shot wide shot white background", "左后45° + 高度俯视 + 广角 + 白色背景"),
    "left": ("<sks> left side view high-angle shot wide shot white background", "左侧面 + 高度俯视 + 广角 + 白色背景"),
    "front_left": ("<sks> front-left quarter view high-angle shot wide shot white background", "左前45° + 高度俯视 + 广角 + 白色背景"),
}
# Presentation layout: diagonal positions are horizontally swapped so each
# quarter-view character faces toward the center column.
GRID = [["back_right", "back", "back_left"], ["left", "input", "right"], ["front_right", "front", "front_left"]]
# Qwen's pure side-view renders look toward the center by default; mirror only
# those two cells so the face points toward the outside edge of the sheet.
MIRROR_KEYS = {"left", "right"}


def font(path: Path | None, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [path] if path else []
    candidates += [Path("C:/Windows/Fonts/Noto Sans SC.ttf"), Path("C:/Windows/Fonts/simhei.ttf"), Path("C:/Windows/Fonts/arial.ttf")]
    for candidate in candidates:
        if candidate and candidate.is_file():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def wrap_text(draw: ImageDraw.ImageDraw, text: str, selected_font: ImageFont.ImageFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split(" "):
        candidate = f"{current} {word}".strip()
        if current and draw.textbbox((0, 0), candidate, font=selected_font)[2] > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [text]


def build_labels(camera_angle: str, shot_size: str, background: str) -> dict[str, tuple[str, str]]:
    camera_zh = {"low-angle": "低机位", "eye-level": "平视", "elevated": "轻度俯视", "high-angle": "高度俯视"}[camera_angle]
    shot_zh = {"close-up": "特写", "medium shot": "中景", "wide shot": "广角远景"}[shot_size]
    labels: dict[str, tuple[str, str]] = {}
    for key, (english, chinese) in LABELS.items():
        canonical = english.removeprefix("<sks> ")
        direction_en = canonical.split(" view ")[0] + " view" if " view " in canonical else canonical.split(" side view")[0] + " side view"
        labels[key] = (
            f"<sks> {direction_en} {camera_angle} shot {shot_size} {background}".strip(),
            f"{chinese.split(' + ')[0]} + {camera_zh} + {shot_zh}" + (f" + {background}" if background else ""),
        )
    return labels


def make_sheet(
    source: Path,
    renders: Path,
    destination: Path,
    cell: int,
    label_height: int,
    font_path: Path | None,
    labels: dict[str, tuple[str, str]] | None = None,
    render_paths: dict[str, Path] | None = None,
) -> Path:
    destination.mkdir(parents=True, exist_ok=True)
    label_font = font(font_path, max(16, cell // 29))
    cn_font = font(font_path, max(19, cell // 24))
    canvas = Image.new("RGB", (cell * 3, (cell + label_height) * 3), "#20242b")
    draw = ImageDraw.Draw(canvas)
    for row, line in enumerate(GRID):
        for col, key in enumerate(line):
            x, y = col * cell, row * (cell + label_height)
            if key == "input":
                image_path = source
                english, chinese = ("INPUT IMAGE", "输入图")
            else:
                image_path = (render_paths or {}).get(key, renders / f"{source.stem}_{key}.png")
                english, chinese = (labels or LABELS)[key]
            if not image_path.is_file():
                raise FileNotFoundError(f"Missing render for {source.name}: {image_path}")
            draw.rectangle((x, y, x + cell - 1, y + label_height - 1), fill="#303742")
            english_lines = wrap_text(draw, english, label_font, cell - 20)
            for line_index, line in enumerate(english_lines[:2]):
                draw.text((x + 10, y + 7 + line_index * (label_font.size + 2)), line, fill="white", font=label_font, anchor="la")
            draw.text((x + 10, y + label_height - 10), chinese, fill="#b9d7ff", font=cn_font, anchor="ls")
            with Image.open(image_path) as opened:
                image = ImageOps.contain(opened.convert("RGB"), (cell - 12, cell - 12))
                if key in MIRROR_KEYS:
                    image = ImageOps.mirror(image)
            ix = x + (cell - image.width) // 2
            iy = y + label_height + (cell - image.height) // 2
            draw.rectangle((x, y + label_height, x + cell - 1, y + label_height + cell - 1), fill="#11151b")
            canvas.paste(image, (ix, iy))
            draw.rectangle((x, y, x + cell - 1, y + label_height + cell - 1), outline="#667080", width=2)
    target = destination / f"{source.stem}_3x3.png"
    canvas.save(target, optimize=True)
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("input-test"))
    parser.add_argument("--renders-dir", type=Path, default=Path("outputs-test/all"))
    parser.add_argument("--output-dir", type=Path, default=Path("outputs-test/contact-sheets"))
    parser.add_argument("--cell-size", type=int, default=512)
    parser.add_argument("--font", type=Path, default=None)
    parser.add_argument("--camera-angle", default="high-angle", choices=("low-angle", "eye-level", "elevated", "high-angle"))
    parser.add_argument("--shot-size", default="wide shot", choices=("close-up", "medium shot", "wide shot"))
    parser.add_argument("--background", default="white background")
    args = parser.parse_args()
    labels = build_labels(args.camera_angle, args.shot_size, args.background)
    sources = sorted(p for p in args.input_dir.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
    if not sources:
        parser.error(f"No images found in {args.input_dir}")
    for source in sources:
        print(make_sheet(source, args.renders_dir, args.output_dir, args.cell_size, 112, args.font, labels))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
