# 明确拍照录入尚未开放

Written against: `bc8e9ae25f0cf4e8cf933764a3a99c8998810268`。用户已同意将审核三项转为实施计划；本文件不代表已实施。

## Evidence chain
- Surface：HomePage.tsx → QuickActions.tsx；当前三个快捷项均渲染Link。
- Contract：README第99行明确拍照录入不进入首版。
- Owner：src/features/home/components/QuickActions.tsx的“拍照录入”，当前链接/notes?capture=1且说明“拍照提取并整理内容”。
- Uncertainty：不诊断该URL的数据行为，本项只修正功能可用性的呈现。

## Design decision
保留原位置，呈现不可操作的“拍照录入 · 敬请期待”。不新增拍照功能、不申请摄像头权限。

## Reuse
复用HomePage.module.css的quickAction布局和actionIcon；新增一个范围仅限未开放项的样式修饰，不创建通用组件库。

## Changes
1. QuickActions.tsx：为未开放项显式标记可用状态；该项渲染非交互容器而非Link，不含href、onClick或tabIndex。保留Camera装饰图标、显示名称与“敬请期待”。
2. HomePage.module.css：未开放项使用现有surface-muted与text-muted，不响应hover位移；避免整体opacity损害文字对比度。“敬请期待”在手机端也必须可见，不能复用会display:none的small规则。
3. 增加组件测试：不存在名为拍照录入的链接/按钮，存在可见说明；另外两项仍是原有效链接。浏览器检查手机说明不会挤出卡片。

## Scope
- Inherit：首页拍照快捷项。
- Verify：首页另外两个操作、三列布局、键盘顺序。
- Exclude：摄像头、OCR、笔记路由、其他占位页。

## Validation
pnpm verify；首页Playwright回归。320/390/768px、200%文字放大，说明不截断；点击无跳转、无权限请求，Tab跳过非交互项。

## Stop conditions
若当前代码已正式实现拍照能力，暂停此项并核对README与用户范围，不关闭真实功能。

## Design documentation
验收后更新README：拍照入口明确显示未开放；记录于design-qa.md，不宣称功能已实现。

