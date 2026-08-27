# Velo Logo Exploration

本轮探索围绕 `velocity + flow`，以黑白为主、Velo 紫为流动节点。它是候选方案，不会在选定前替换产品中的现有品牌资产。

## V2 推荐方向：Breathing Loop

用户将品牌感受收敛为“安静专注为主、快速高效为辅”，并确认采用“抽象心流环 + Velo”组合。V2 位于 `v2/`：

- `breathing-loop-mark.svg` — 不对称连续轨迹由外向内收束，紫色节点代表被捕捉并进入专注状态的灵感。
- `velo-refined-wordmark.svg` — 定制 `Velo` 字标；大写 V 有轻微前行动势，完整 o 保证清晰阅读。
- `breathing-loop-lockup.svg` — 心流环与字标的标准横向组合，避免“图形 V + 文字 Velo”造成双 V 重复。
- `index.html` — V2 响应式展示与应用示例；动效只在首次出现时完成一次，不持续旋转或呼吸。
- `typography.html` — 标准英文字体锁定对照：Manrope、Outfit 与 Inter Display 使用同一心流环和统一比例，仅比较字体气质与光学字距。

这一方向仍是候选品牌系统，用户确认定稿前不替换 `public/brand/` 中的生产 Logo。

## 三类方案

### 纯图形标志

- `symbol-flowfold.svg` — **Flowfold / 流折**。一条连续曲线折成 V，紫色端点代表刚被捕捉的灵感。结构最简，在 App 图标和 16–32px 场景中辨识度最好。
- `symbol-orbit-v.svg` — **Orbit V / 心流轨道**。开放轨道包围负形 V，强调知识循环、持续复习与前进。信息更丰富，更适合产品启动页和社交头像。

推荐：**Flowfold**。它更独特、缩放稳定，也最容易形成长期品牌记忆。

### 纯英文标志

- `wordmark-soft-current.svg` — **Soft Current / 柔流字标**。圆润单线结构和开放的 `o` 让阅读节奏平静、连续，适合学习工具的长期使用气质。
- `wordmark-forward.svg` — **Forward / 前行字标**。整体微微前倾，速度感更明显，适合更年轻、更运动化的品牌表达。

推荐：**Soft Current**。在“高效”与“心流”之间更平衡，也更适合黑白 Bento 界面。

### 图形与英文组合

- `lockup-flowfold.svg` — **Flowfold Lockup / 流折组合**。最简图形搭配柔流字标，适合网站导航、登录页、宣传物料。
- `lockup-orbit.svg` — **Orbit Lockup / 轨道组合**。信息密度和动势更强，适合活动页或 AI 功能品牌化场景。

推荐：**Flowfold Lockup**。它与推荐的独立图形和字标组成完整、可拆分的品牌系统。

## 使用约束

- 主墨色：`#0B0B0C`
- Velo 紫：`#6D5DFC`
- 最小图形尺寸：16px；组合标志建议不小于 96px 宽
- SVG 几何统一使用 `currentColor`，紫色通过 `--velo-accent` 注入；移除变量后可自然退化为单色
- 当前阶段为方向探索，不做商标注册可用性结论；正式发布前需进行近似商标检索
