# 八方位游戏素材方向表

方向以角色自身朝向为基准；生成结果在 3×3 展示图中按下表摆放。中心格是输入图，左右纯侧面会水平镜像，使角色面部朝向展示图外侧。镜像只应用于预览图，不修改原始生成素材。每格上方显示英文提示词与中文方向说明；图片等比例缩放、居中展示，不裁剪主体。

| 方位编号 | 英文方向片段 | 中文方向 | 3×3 位置 | 推荐文件名 |
|---:|---|---|---|---|
| 1 | `front view` | 正面（角色面向观察者） | 下中 | `front` |
| 2 | `front-right quarter view` | 右前 45° | 左下 | `front_right` |
| 3 | `right side view` | 右侧面 | 右中 | `right` |
| 4 | `back-right quarter view` | 右后 45° | 左上 | `back_right` |
| 5 | `back view` | 背面 | 上中 | `back` |
| 6 | `back-left quarter view` | 左后 45° | 右上 | `back_left` |
| 7 | `left side view` | 左侧面 | 左中 | `left` |
| 8 | `front-left quarter view` | 左前 45° | 右下 | `front_left` |

## 3×3 排布

```text
右后 45°       背面          左后 45°
左侧面         输入图        右侧面
右前 45°       正面          左前 45°
```

## 提示词组合

将表中的英文方向片段与机位、景别组合：

```text
<sks> {英文方向片段} {low-angle|eye-level|elevated|high-angle} shot {close-up|medium shot|wide shot}
```

示例：

```text
<sks> front-right quarter view high-angle shot wide shot
```

中文含义：右前 45° + 高度俯视 + 广角远景。

如需约束背景，在末尾追加 `white background`。
