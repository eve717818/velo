# Velo

> 捕捉灵感，保持心流。Catch ideas, keep flowing.

Velo 是面向大学生的本地优先学习工作台，提供学习驾驶舱、日/周/月/学期计划、树状知识笔记、番茄钟，以及由用户自带 API 驱动的 AI 学习能力。

## 当前状态

- 阶段：产品设计规格待验收
- 分支：`docs/initial-product-spec`
- 规格：[Velo 产品设计规格](docs/superpowers/specs/2026-08-25-velo-product-design.md)
- 首个实现里程碑：响应式应用基础、PWA、本地数据库、主页驾驶舱

## 设计基准

- [Web 主页方向](docs/design/velo-web-home-direction.png)
- [手机版主页（已确认）](docs/design/velo-mobile-home-approved.png)
- [Logo 方案 3](docs/design/velo-logo-concept-3.png)

## 开发约定

实际开发只在本目录对应的项目 worktree 中进行；同级 `repository` 保留稳定 `main` 基线。每个功能使用独立的 `feat/*`、`fix/*`、`docs/*` 或 `chore/*` 分支，并在提交前运行适用测试、`git diff --check` 与变更范围检查。
