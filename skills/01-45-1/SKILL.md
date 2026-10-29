---
name: "01-45-1"
description: "宗门主题场景，上方五分之一区域是下方区域是盆地，仙宫，古树，山峰，云海，瀑布，植被，蓬莱古建筑，仙境楼台，仙气缭绕。方区域是试炼场，去装饰物，无石头。白天，大空间场景，45度俯视正交透视，中国卡通风格，生成两张场景，尺寸720×1280 使用GPTImage2 Medium"
displayName: "01-45度竖版场景背景技术标准"
gameProject: "指尖三国 美术管理表"
category: "场景"
---

# 45° 竖版场景背景 · 绘图技术标准（v1）

> 用途：批量生成相同画风的 SLG 场景背景（战斗走廊 / 营地 / 关卡地图）
> 基准图：蜀营帐篷走廊（补全空白处的设计并把图转化为3d渲染卡通风格,整体风格偏卡通,构图尺寸不变,地面平整。干净.png）

---

## 一、透视与构图（硬性锁定）

| 维度 | 标准参数 | 说明 |
|---|---|---|
| 视角 | 俯视约 45°（top-down 2.5D） | 介于正俯视与斜 45° 之间，能看清建筑立面+地面 |
| 机位 | 固定正拍，无旋转、无倾斜 | 批量产出时机位绝对一致 |
| 构图 | 竖版 9:16（约 608×1080） | 适配手机竖屏战斗场景 |
| 布局 | 中央留空走廊 + 两侧布置 | 中间 40-45% 宽度为干净地面（战斗区），装饰全部靠边 |
| 动线 | 中央土路/空地从上至下贯通 | 形成天然纵深，近大远小微弱（弱透视） |
| 地面 | 平整、干净、无杂草遮挡 | 中央区域禁放任何道具，保证可放置角色 |
| 边界 | 四周由山体/树林/栅栏收口 | 天然包围感，画面不出血建筑 |

## 二、风格画风（渲染标准）

| 维度 | 标准参数 |
|---|---|
| 画风 | 3D 渲染卡通风格（万国觉醒 / 部落冲突系） |
| 质感 | 软质黏土感 + 手绘贴图感，边缘圆润无硬角 |
| 光影 | 柔和全局光照，弱投影，明暗对比低，无强烈方向光 |
| 色彩 | 高饱和但柔和：草绿主调 + 土黄地面 + 米白建筑 + 点缀色 |
| 细节 | 点缀小道具（木箱、箭靶、木桶、石堆）尺寸微型化 |
| 禁忌 | 无人物、无 UI、无文字界面、无写实纹理、无照片感 |

### 标准配色板
- 草地：嫩绿 `#7CB342` → 深绿 `#558B2F`（渐变过渡）
- 土路：沙黄 `#E8C87A` / `#D9B26A`
- 岩石：青灰 `#8D9AA8` 带紫调阴影
- 帐篷/建筑：米白 `#F5EDD8` + 金铜饰件 `#C99547`
- 水体：湖蓝 `#3FA7D6` 带白色水纹

## 三、可复用提示词（中文版）

```
竖版游戏场景背景，俯视45度2.5D视角，3D渲染卡通风格，万国觉醒画风。
画面中央是一条从上至下贯通的平整沙土路，地面干净无任何遮挡物；
道路两侧布置【主题内容：如中式军营帐篷、木质栅栏、山体岩石、瀑布、松树、木箱箭靶等小型道具】；
四周由灰色岩石山体与茂密树木自然包围收口。
柔和全局光照，弱阴影，色彩高饱和偏暖，草地嫩绿、土路沙黄、岩石青灰。
软质黏土质感，边缘圆润，细节精致微型化。
无人物，无UI界面，无文字，无武器角色。
竖版9:16构图，画面整洁干净。
```

## 四、可复用提示词（英文版）

```
Vertical mobile game background, top-down 45-degree 2.5D view, 3D rendered cartoon style, casual SLG art style like Rise of Kingdoms.
A clean flat dirt path runs straight from top to bottom in the center, completely empty ground;
both sides decorated with [THEME: e.g. Chinese military tents, wooden palisade fences, rocky cliffs, waterfall, pine trees, tiny props like crates and archery targets];
naturally enclosed by grey rock formations and lush trees around the edges.
Soft global illumination, weak shadows, high-saturation warm palette: fresh green grass, sandy yellow path, blue-grey rocks.
Soft clay-like textures, rounded edges, miniature delicate details.
No people, no characters, no UI, no text, no weapons.
Vertical 9:16 composition, clean and tidy.
```

## 五、批量生成替换规则

批量产出时**只替换【主题内容】段**，其余全部锁定：

| 场景方向 | 主题替换示例 |
|---|---|
| 军营类 | 帐篷/栅栏/箭靶/军旗/辎重车 |
| 城镇类 | 瓦房/灯笼/摊位/水井/石狮子 |
| 水域类 | 码头/渔船/荷花/水车/石桥 |
| 雪原类 | 冰晶/雪松/雪屋/火盆/冰湖 |
| 熔岩类 | 火山岩/铁匠炉/锁链/黑曜石 |
| 森林类 | 古树/藤蔓/树屋/蘑菇/溪流 |

季节/昼夜变体：在英文提示词末尾追加 `winter snow version` / `sunset warm lighting` / `night with lanterns` 即可，构图不变。

## 六、负向提示词（固定）

```
人物, 角色, 士兵, UI界面, 按钮, 血条, 文字, 写实风格, 照片感, 强烈投影,
杂乱地面, 中央遮挡物, 横版构图, 透视畸变, 模糊, 低多边形
people, characters, soldiers, UI, buttons, text, watermark, realistic, photo,
harsh shadows, cluttered ground, objects in center, horizontal layout, blur, low poly
```

## 七、验收 Checklist

- [ ] 中央走廊完全留空、地面平整
- [ ] 俯视 45°，竖版 9:16，构图与基准图一致
- [ ] 3D 卡通渲染，软质圆润，无写实纹理
- [ ] 四周自然收口（山/树/栅栏）
- [ ] 无人物、无 UI、无文字
- [ ] 配色在标准色板范围内
