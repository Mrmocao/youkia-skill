---
name: "03-prompt-1"
description: "主体是一座茅草农舍，辅助是枯树，水井，正在翻土的地，枯树，沙漠环境，中国卡通风格，生成两张，色调不限，尺寸1024*1024像素。"
displayName: "03-单体建筑Prompt模板"
gameProject: "指尖三国 美术管理表"
category: "场景"
---

# 03 — 单体建筑 Prompt 模板（v3）

> **核心原则：一句好提示词 × N 次独立生成 > N 句不同提示词各跑一次**

---

## 模板结构（来源：gw-phoenix_05 验证通过）

```text
a single 3D isometric building, 45-degree top-down view,
a [主体元素] with [辅助元素作为配件],
[主体物理描述 — 主导视觉、占画面大部分],
[辅助物理描述 — 微型、配件感、不抢主体],
the entire structure reading as both [概念A] and [概念B] in one bold unified form,
blind box toy proportions big chunky block forms minimal fine details cartoon toy texture,
bold readable silhouette,
Rise of Kingdoms semi-realistic 3D rendered style, clean polished rendering,
[主体色彩] with [辅助色彩点缀],
centered filling the frame, pure green #00FF00 solid background,
game asset for 2D isometric mobile SLG world map city skin
```

---

## 占位符说明

| 占位符 | 作用 | 原则 |
|--------|------|------|
| `[主体元素]` | 画面主角，占 70%+ 视觉面积 | 一个明确主题，不要多元素并列 |
| `[辅助元素]` | 配件/底座/点缀 | 微型化、装饰感，不能抢主体 |
| `[主体物理描述]` | 主体的形状、姿态、材质 | 大块面、概括化，不要细碎 |
| `[辅助物理描述]` | 配件的尺寸、位置、角色 | 始终用 tiny/miniature/delicate 等弱化词 |
| `[概念A]` + `[概念B]` | 两个元素的融合读法 | 体现「一体两读」的设计巧思 |
| `[主体色彩]` | 主体配色方案 | 一个主色 + 一个强调色 |
| `[辅助色彩点缀]` | 配件颜色 | 只作点缀，不与主体争色 |

---

## 固定关键词层（不可删减）

| 层级 | 关键词 | 作用 |
|------|--------|------|
| 视角 | `45-degree top-down view` | 等距视角 |
| 比例 | `blind box toy proportions big chunky block forms` | 盲盒比例、大块面 |
| 细节 | `minimal fine details cartoon toy texture` | 抑制细节、卡通玩具质感 |
| 轮廓 | `bold readable silhouette` | 强剪影识别度 |
| 风格 | `Rise of Kingdoms semi-realistic 3D rendered style, clean polished rendering` | 万国觉醒半写实 3D |
| 背景 | `pure green #00FF00 solid background` | 绿幕抠图 |
| 用途 | `game asset for 2D isometric mobile SLG world map city skin` | 用途锚定 |

---

## 生成策略

```
同一提示词 → 5~10 次独立 chat 调用 → 5~10 个天然风格统一变体
```

- **不要**：写 N 个不同提示词各跑一次（风格散、难定位问题）
- **要**：一个验证过的好提示词跑 N 次（风格统一、差异来自 AI 随机性）
- 并发限制：Lovart GPT Image 2 最多 5-6 并发，超量分批发（间隔 30 秒）

---

## 案例一：凤凰形塔楼（phoenix-tower-v3）

**来源**：gw-phoenix_05.png → 反查原始提示词 → 原封不动 ×10

**主体**：长城塔楼 | **辅助**：凤凰渐变塔身

```text
a single 3D isometric building, 45-degree top-down view,
a Great Wall tower shaped like a phoenix rising upward,
the stone tower base transitions into a giant phoenix silhouette with wings sweeping up,
flame crest as the tower top crown,
the entire structure reading as both fortress and phoenix in one bold unified form,
big bold forms minimal fine details, bold readable silhouette,
Rise of Kingdoms semi-realistic 3D rendered style, clean polished rendering,
warm stone and fiery orange colors,
centered filling the frame, pure green #00FF00 solid background,
game asset for 2D isometric mobile SLG world map city skin
```

**产出**：`phoenix-tower-v3_01-10.png`（10 张）

**关键设计点**：
- 塔身=凤凰身体，城墙=底座，火焰冠=塔顶
- "fortress and phoenix in one" 一体两读
- 未使用 v3 盲盒关键词（这是原始 v1 版），后续主题均升级为 v3 固定层

---

## 案例二：热气球+城池（balloon-city-v1 → v2）

**主体**：热气球 | **辅助**：古城吊篮

### v1 提示词

```text
a single 3D isometric building, 45-degree top-down view,
a giant ornate hot air balloon carrying a tiny ancient Chinese walled city as its gondola basket,
the massive balloon is the dominant form filling the upper half with bold striped canopy in warm gold and red,
a miniature walled fortress city hangs delicately beneath like a lantern with tiny towers gates and walls,
the entire structure reading as both flying vessel and floating fortress in one magical unified form,
big bold forms minimal fine details, bold readable silhouette,
Rise of Kingdoms semi-realistic 3D rendered style, clean polished rendering,
warm amber balloon glow and cool stone gray accents,
centered filling the frame, pure green #00FF00 solid background,
game asset for 2D isometric mobile SLG world map city skin
```

**问题**：城市描述 `miniature walled fortress city... with tiny towers gates and walls` 太细节，AI 画出过多建筑细节。

### v2 修复（城市概括化 + 盲盒强化）

```text
a single 3D isometric building, 45-degree top-down view,
a giant ornate hot air balloon carrying a tiny ancient Chinese city as its gondola basket,
the massive balloon is the dominant form filling the upper half with bold striped canopy in warm gold and red,
a small cluster of ancient rooftops crowns the whale back like a delicate ornament,   ← 概括化
the entire structure reading as both flying vessel and floating fortress in one magical unified form,
blind box toy proportions big chunky block forms minimal fine details cartoon toy texture,  ← 盲盒强化
bold readable silhouette,
Rise of Kingdoms semi-realistic 3D rendered style, clean polished rendering,
warm amber balloon glow and cool stone gray accents,
centered filling the frame, pure green #00FF00 solid background,
game asset for 2D isometric mobile SLG world map city skin
```

**变化**：
| 维度 | v1 | v2 |
|------|-----|-----|
| 城市描述 | `miniature walled fortress city... with tiny towers gates and walls` | `a small cluster of ancient rooftops... like a delicate ornament` |
| 盲盒关键词 | `big bold forms` | `blind box toy proportions big chunky block forms cartoon toy texture` |

**产出**：v1 ×10 + v2 ×5

**迭代教训**：
1. 辅助元素的描述越细，AI 越容易画出一堆细节
2. 用 `cluster of rooftops` / `delicate ornament` 比 `walled city with towers gates walls` 更概括
3. `blind box toy proportions` + `cartoon toy texture` 比 `big bold forms` 更精准地锁死盲盒感

---

## 快速使用清单

1. 确定主题 → 填入 `[主体元素]` + `[辅助元素]`
2. 写主体/辅助的物理描述（主体占 70%+ 视觉，辅助微型化）
3. 写 `[概念A] and [概念B]` 一体两读句
4. 确定配色方案
5. 其余固定层**不动**
6. 同一提示词跑 5-10 次（5+5 分批避免并发限制）
7. 挑选最佳变体 → 如需微调，只改一个维度再跑一轮

---

## 相关文档

- [02-Prompt工程.md](02-Prompt工程.md) — Prompt 工程方法论
- [07-建筑工作流.md](07-建筑工作流.md) — 建筑生产完整工作流
- [../../works/2026-08-11-claude-ai-building-prompt-v3.md](../../works/2026-08-11-claude-ai-building-prompt-v3.md) — 今日工作日志
- `../templates/building-grid.md` — 2×2 网格模板
