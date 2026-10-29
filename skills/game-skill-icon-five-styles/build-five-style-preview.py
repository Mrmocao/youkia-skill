from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"E:\826\assert\newtest-skill\game-skill-icon-five-styles")
SOURCE = Path(r"C:\Users\admin\AppData\Local\Temp\codex-clipboard-dcc434ae-ca6e-4266-a1ad-41b53ddeed83.webp")
MONO = Path(r"E:\826\assert\test-output\character-skill-icon-prompt-test\monochrome-chibi-silhouette-five-characters-v2")
RAYLINE = Path(r"E:\826\assert\newtest-skill\game-skill-icon-dual-style\examples\anime-chibi-rayline-test")
BOLD = Path(r"E:\826\assert\newtest-skill\game-skill-icon-dual-style\examples\bold-chibi-tricolor-contrast-v2")
OUT = ROOT / "five-style-input-output-preview.webp"

FONT = "C:/Windows/Fonts/msyh.ttc"
title = ImageFont.truetype(FONT, 48)
sub = ImageFont.truetype(FONT, 20)
head = ImageFont.truetype(FONT, 21)
row_font = ImageFont.truetype(FONT, 20)

W, HEADER, ROW, FOOTER = 4100, 360, 610, 135
canvas = Image.new("RGB", (W, HEADER + ROW * 5 + FOOTER), "#0d1722")
draw = ImageDraw.Draw(canvas)

def label(x, y, value, font, color):
    draw.text((x, y), value, font=font, fill=color)

def panel(x, y, w, h):
    draw.rounded_rectangle((x, y, x + w, y + h), radius=14, fill="#132333", outline="#29435d", width=3)

def asset(path, x, y, w, h):
    draw.rounded_rectangle((x, y, x + w, y + h), radius=9, fill="#e8edf2")
    im = Image.open(path).convert("RGB")
    im.thumbnail((w - 16, h - 16), Image.Resampling.LANCZOS)
    canvas.paste(im, (x + (w - im.width) // 2, y + (h - im.height) // 2))

label(50, 30, "技能图标五风格对照｜角色输入 → 五种输出", title, "#eaf3fb")
label(52, 94, "同一角色设定的 3×3 技能图标测试：从分层 2.5D 到粗描边三色 Q 版，便于直观选择视觉语言。", sub, "#a9bdcf")
draw.line((50, 142, W - 50, 142), fill="#35516a", width=2)

cols = [
    (50, 370, "输入角色", "身份／武器／元素", "#65d3b2"),
    (435, 690, "LAYERED_2_5D", "材质高光／空间层次", "#e1b14e"),
    (1140, 690, "FLAT_DEPTH_CONTRAST", "特效最亮／平涂符号化", "#52cced"),
    (1845, 690, "MONOCHROME_CHIBI", "单色系／Q版剪影", "#86e675"),
    (2550, 690, "ANIME_CHIBI_RAYLINE", "描边／方向性光线", "#ef86c4"),
    (3255, 795, "BOLD_CHIBI_TRICOLOR", "粗描边／三色对比", "#f4bd5c"),
]
for x, w, name, desc, color in cols:
    label(x, 174, name, head, color)
    label(x, 207, desc, sub, "#91a9bc")

source = Image.open(SOURCE).convert("RGB")
ys = [320, 1095, 1870, 2645, 3420]
layered = [source.crop((452, y, 1174, y + 690)) for y in ys]
flat = [source.crop((1210, y, 1923, y + 690)) for y in ys]

roles = [
    ("01 双刃恶魔猎手", r"C:\Users\admin\AppData\Local\Temp\codex-clipboard-3c410c87-d0db-4969-8d45-1368886268cf.png", MONO / "dual-dagger-hunter_green.png", RAYLINE / "01-dual-blade-demon-hunter.png", BOLD / "01-dual-blade-demon-hunter.png"),
    ("02 大剑骑士", r"C:\Users\admin\AppData\Local\Temp\codex-clipboard-4fc5b90a-b17b-4b36-903c-028d8d992f6c.png", MONO / "greatsword-guardian_blue.png", RAYLINE / "02-greatsword-knight.png", BOLD / "02-greatsword-knight.png"),
    ("03 月精灵弓手", r"C:\Users\admin\AppData\Local\Temp\codex-clipboard-2ecb0f9b-cadb-45d7-b897-890baef97435.png", MONO / "moon-elf-archer_teal.png", RAYLINE / "03-moon-elf-archer.png", BOLD / "03-moon-elf-archer.png"),
    ("04 黑魔法女巫", r"C:\Users\admin\AppData\Local\Temp\codex-clipboard-e65f3f30-6937-4a55-992c-e26d5289654e.png", MONO / "star-witch_violet.png", RAYLINE / "04-dark-witch.png", BOLD / "04-dark-witch.png"),
    ("05 南瓜扫帚女巫", r"C:\Users\admin\AppData\Local\Temp\codex-clipboard-a16055ec-5611-4c67-bd3d-6aaca38b3d9f.png", MONO / "autumn-witch_amber.png", RAYLINE / "05-pumpkin-broom-witch.png", BOLD / "05-pumpkin-broom-witch.png"),
]

slots = [(50, 370), (435, 690), (1140, 690), (1845, 690), (2550, 690), (3255, 795)]
for idx, role in enumerate(roles):
    y = 250 + idx * ROW
    panel(32, y, W - 64, ROW - 18)
    label(52, y + 17, role[0], row_font, "#d5e5ef")
    items = [role[1], layered[idx], flat[idx], role[2], role[3], role[4]]
    for (x, w), item in zip(slots, items):
        if isinstance(item, Image.Image):
            temp = ROOT / f".tmp-{idx}-{x}.png"
            item.save(temp)
            asset(temp, x, y + 52, w, ROW - 86)
            temp.unlink()
        else:
            asset(item, x, y + 52, w, ROW - 86)

fy = HEADER + ROW * 5
panel(32, fy, W - 64, FOOTER - 26)
label(55, fy + 18, "选择提示", head, "#d5e5ef")
label(55, fy + 50, "2.5D：强化动作与空间。 平涂：强化亮度层级。 单色剪影：统一属性。 描边放射：角色动势。 粗描边三色：最强小尺寸识别与元素/背景对比。", sub, "#a9bdcf")

canvas.save(OUT, "WEBP", quality=92, method=6)
print(OUT)
