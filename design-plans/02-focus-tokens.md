# 专注页复用公共视觉规范

Written against: `bc8e9ae25f0cf4e8cf933764a3a99c8998810268`。用户已同意将审核三项转为实施计划；本文件不代表已实施。

## Evidence chain
- Surface：AppRoutes → FocusPage → src/pages/FocusPage.module.css。
- Contract：用户明确要求各页面颜色和容器统一；src/main.tsx加载公共tokens.css。
- Owner：FocusPage.module.css目前独立定义正文#242128、次级色#635868、背景#f2eff4、卡片25px圆角。
- Uncertainty：视觉复核尚未完成；此次不改变字体等级或页面宽度。

## Design decision
普通文本、面板与控件映射现有token，保留计时专属表现，不重写公共token影响其他页。

## Reuse
src/styles/tokens.css；示例src/features/plans/PlansPage.module.css使用同一套surface、brand、radius-control。

## Changes
仅修改FocusPage.module.css：
- .page文字 → --color-text。
- .heading p、普通按钮文字、.timer small、.hint、.custom、.stats small、.grid > span → --color-text-muted。
- 普通按钮底色 → --color-surface-muted；普通按钮圆角 → --radius-control。
- .surface底色 → --color-surface；圆角 → --radius-card。
- 所有普通品牌色#901d78引用 → --color-brand；主按钮/选中按钮文字 → --color-text-inverse。
- .actions .pause背景 → --color-brand-soft；保留150px宽和浅色按钮，不改成整块深紫。
- .custom input边界、记录分隔线 → --color-border；输入框圆角 → --radius-control。
- 保留计时圆环、圆形日期、记录圆点、呼吸动画、44px高度和减弱动画。
不全局替换所有十六进制颜色；计时轨道等特殊值不在此项硬改。

## Scope
- Inherit：专注与心流时间的普通文字、按钮和面板。
- Verify：自由/关联任务、运行/暂停/结束、错误提示、记录月历。
- Exclude：计时服务、任务状态、Logo、其他页面配色和纸张质感。

## Validation
pnpm verify；pnpm exec playwright test --config playwright.focus.config.ts。
390px与桌面实际截图，检查主/次操作区分、文字对比度、长任务标题和选中日期；自动无障碍检查通过不能替代人工阅读验证。

## Stop conditions
若token解析值已变更，先重新核对；如果低对比度出现，不可调低验收标准或通过opacity隐藏问题。

## Design documentation
验收后在design-qa.md记录专注普通控件复用公共token，保留计时专属圆形样式与浅紫暂停例外。

