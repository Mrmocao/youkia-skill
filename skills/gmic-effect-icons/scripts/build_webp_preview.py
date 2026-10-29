import argparse
import json
import os
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
FONT_CANDIDATES = (
    Path("C:/Windows/Fonts/msyh.ttc"),
    Path("C:/Windows/Fonts/msyhbd.ttc"),
    Path("/System/Library/Fonts/PingFang.ttc"),
    Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
    Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
)


def resolve_font(explicit=None):
    candidates = []
    if explicit:
        candidates.append(Path(explicit))
    if os.environ.get("GMIC_PREVIEW_FONT"):
        candidates.append(Path(os.environ["GMIC_PREVIEW_FONT"]))
    candidates.extend(FONT_CANDIDATES)
    for path in candidates:
        if path.is_file():
            return path
    raise RuntimeError("No CJK font found. Pass --font or set GMIC_PREVIEW_FONT to a Chinese-capable .ttf/.ttc file.")


def load_font(path, size):
    return ImageFont.truetype(str(path), size=size)


def wrap_text(draw, text, used_font, max_width):
    lines, current = [], ""
    for char in text:
        trial = current + char
        if current and draw.textbbox((0, 0), trial, font=used_font)[2] > max_width:
            lines.append(current)
            current = char
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


def validate_cases(cases):
    if not isinstance(cases, list) or not cases:
        raise ValueError("cases must be a non-empty JSON array")
    seen = set()
    for case in cases:
        for key in ("id", "name", "user_input", "seed"):
            if key not in case:
                raise ValueError(f"case is missing field: {key}")
        if not ID_PATTERN.fullmatch(str(case["id"])):
            raise ValueError(f"invalid case id: {case['id']!r}")
        if case["id"] in seen:
            raise ValueError(f"duplicate case id: {case['id']}")
        seen.add(case["id"])


def main():
    parser = argparse.ArgumentParser(description="Build a WebP proof sheet from original prompts and generated PNG files.")
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--images-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--title", default="GMIC 特效模型 · 用户输入与最终成图")
    parser.add_argument("--font", help="Path to a Chinese-capable .ttf or .ttc font.")
    parser.add_argument("--allow-missing", action="store_true", help="Render placeholders instead of failing when PNG files are missing.")
    args = parser.parse_args()

    cases = json.loads(args.cases.read_text(encoding="utf-8"))
    validate_cases(cases)
    font_path = resolve_font(args.font)
    missing = [str(args.images_dir / f"{case['id']}.png") for case in cases if not (args.images_dir / f"{case['id']}.png").is_file()]
    if missing and not args.allow_missing:
        raise FileNotFoundError("Missing generated images:\n" + "\n".join(missing))

    columns = 2
    card_width, card_height = 720, 850
    gap, margin, header = 28, 38, 130
    rows = (len(cases) + columns - 1) // columns
    width = margin * 2 + columns * card_width + (columns - 1) * gap
    height = header + margin + rows * card_height + (rows - 1) * gap + margin
    canvas = Image.new("RGB", (width, height), "#0d1119")
    draw = ImageDraw.Draw(canvas)
    title_font, meta_font = load_font(font_path, 36), load_font(font_path, 21)
    name_font, input_font, seed_font = load_font(font_path, 27), load_font(font_path, 21), load_font(font_path, 18)
    draw.text((margin, 28), args.title, fill="#f4f7ff", font=title_font)
    draw.text((margin, 78), f"共 {len(cases)} 个测试用例 · 原始输入保留 · Qwen-Image GMIC 工作流", fill="#aeb9d1", font=meta_font)

    for index, case in enumerate(cases):
        row, col = divmod(index, columns)
        x = margin + col * (card_width + gap)
        y = header + row * (card_height + gap)
        draw.rounded_rectangle((x, y, x + card_width, y + card_height), radius=24, fill="#171d29", outline="#34405a", width=2)
        image_path = args.images_dir / f"{case['id']}.png"
        if image_path.is_file():
            with Image.open(image_path) as opened:
                source = opened.convert("RGB")
                source.thumbnail((660, 660), Image.Resampling.LANCZOS)
                image_x = x + (card_width - source.width) // 2
                canvas.paste(source, (image_x, y + 24))
        else:
            draw.rectangle((x + 30, y + 30, x + card_width - 30, y + 660), fill="#252d3b")
            draw.text((x + 60, y + 300), "图片缺失", fill="#ff8a8a", font=name_font)
        info_y = y + 702
        draw.text((x + 28, info_y), f"{index + 1:02d}  {case['name']}", fill="#ffffff", font=name_font)
        seed_text = f"Seed {case['seed']}"
        seed_width = draw.textbbox((0, 0), seed_text, font=seed_font)[2]
        draw.text((x + card_width - 28 - seed_width, info_y + 5), seed_text, fill="#89d7ff", font=seed_font)
        prompt_y = info_y + 43
        label = "模拟用户输入："
        draw.text((x + 28, prompt_y), label, fill="#9cabc5", font=input_font)
        label_width = draw.textbbox((0, 0), label, font=input_font)[2]
        lines = wrap_text(draw, str(case["user_input"]), input_font, card_width - 56 - label_width)
        if lines:
            draw.text((x + 28 + label_width, prompt_y), lines[0], fill="#e1e7f2", font=input_font)
            for offset, line in enumerate(lines[1:3], 1):
                draw.text((x + 28, prompt_y + offset * 28), line, fill="#e1e7f2", font=input_font)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, "WEBP", quality=92, method=6)
    print(json.dumps({"output": str(args.output.resolve()), "width": width, "height": height, "count": len(cases), "font": str(font_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
