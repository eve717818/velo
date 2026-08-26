# Velo

> 捕捉灵感，保持心流。Catch ideas, keep flowing.

Velo 是面向大学生的本地优先学习工作台。本里程碑交付了可运行、可安装、可离线打开的响应式应用基础，以及黑白 Bento + Velo 紫点睛的首页学习驾驶舱。

## 已实现

- React、TypeScript、Vite 与 Dexie 本地数据层
- 首页种子数据：当日任务 3/5、下一项“高等数学 · 导数复习”、最近笔记“线性代数：矩阵的秩”
- 首页、计划、笔记、专注、设置五个可访问路由
- 手机、平板与桌面响应式导航和布局
- 全局页面转场、进度动效和 `prefers-reduced-motion` 降级
- PWA manifest、离线缓存、更新提示与版本切换验证
- 单元测试、无障碍检查与六档视口端到端测试

## 本地运行

```powershell
pnpm install
pnpm dev
```

生产预览：

```powershell
pnpm build
pnpm preview
```

## 验证

```powershell
pnpm verify
pnpm test:e2e
pnpm test:pwa-lifecycle
```

`test:pwa-lifecycle` 会依次构建 `pwa-v1` 与 `pwa-v2`，在本机 Chrome 中验证“发现新版本 → 立即更新 → 载入新构建”的完整链路。

## 设计资料

- [产品设计规格](docs/superpowers/specs/2026-08-25-velo-product-design.md)
- [里程碑 1 实施计划](docs/superpowers/plans/2026-08-25-velo-milestone-1-foundation-home.md)
- [最终设计 QA](design-qa.md)
- [视觉对照图](docs/qa/velo-style-comparison-final.png)

计划、笔记、专注与设置页目前展示清晰的阶段状态；树状知识库、学习计划卡片、拍照录入、批注便签、番茄钟和 AI 能力将在后续里程碑逐项实现。
