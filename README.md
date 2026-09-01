# Velow Notebook

> 捕捉灵感，保持心流。Catch ideas, keep flowing.

Velow Notebook 是面向大学生的本地优先学习工作台。当前仓库已经完成里程碑 2 的学习计划验收与响应式计划工作台优化：计划页支持按日期组织任务、为整周或整月设定学习方向、用学期与假期管理阶段，并能在离线状态下继续创建与完成任务。

## 已实现

- React、TypeScript、Vite、Dexie 与 PWA 本地优先应用基础
- 首页、计划、笔记、专注、设置五个可访问路由
- 首页学习驾驶舱：今日进度、下一项任务、最近笔记与专注入口
- 学习计划四视图：日、周、月、学期
- 本地优先的周 / 月总体计划：保存主题、总体目标、重点事项与备注，不复制范围内的日期任务
- 学期 / 寒暑假阶段管理：创建、编辑、删除、重叠校验与跨阶段任务复制
- 计划任务创建、编辑、删除、完成、改期与排序校验
- 常驻箭头与一次性提示帮助发现右滑完成；45% 慢滑或 20% 快速滑动即可完成
- 350ms 长按拖动改期、键盘 Enter / Space 完成、操作菜单改期
- 手机、平板、桌面多断点布局与 44px 最小可点击目标
- 语义化配色、`prefers-reduced-motion` 降级、axe 无障碍检查
- 离线缓存、离线重载、离线创建 / 完成任务后的本地持久化
- 版本升级兼容：保留可迁移的旧版日任务，隔离无法可靠迁移的损坏旧数据

## 学习计划使用方式

- 日视图：查看当天定时与待安排任务，右滑完成，长按后拖到新日期
- 周视图：浏览一周任务分布，并通过“制定本周计划”保存整周主题与目标
- 月视图：按月查看任务密度与完成数，通过“制定本月计划”保存整月方向；选中日期只预览前两项任务，可按需展开
- 学期视图：管理学期 / 假期范围，查看当前学期上下文，并把上一学期或假期的未完成任务复制到新阶段
- 范围计划抽屉：手机从底部打开，平板与桌面从右侧打开；关闭后焦点返回原入口
- 键盘替代：聚焦任务条后按 Enter 或空格可完成任务；对话框关闭后焦点会返回原触发控件
- 离线使用：首次在线加载后，即使断网重载计划页，仍可继续创建、完成并保留本地任务状态

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

- `pnpm verify`：类型、单元 / 组件测试、lint 与生产构建
- `pnpm test:e2e`：学习计划创建、四视图、真实指针手势、跨学期任务复制、响应式、无障碍、减弱动画与离线持久化
- `pnpm test:pwa-lifecycle`：验证 `pwa-v1` → `pwa-v2` 的更新发现、刷新与新版本激活链路

## 设计与实施资料

- [里程碑 2 实施计划](docs/superpowers/plans/2026-08-28-velow-milestone-2-learning-plan.md)
- [里程碑 2 设计规格](docs/superpowers/specs/2026-08-28-velow-milestone-2-learning-plan-design.md)
- [里程碑 1 实施计划](docs/superpowers/plans/2026-08-25-velo-milestone-1-foundation-home.md)
- [最终设计 QA](design-qa.md)
- [新版手机视觉对照图](docs/qa/velo-reference-mobile-comparison.png)

树状知识库、拍照录入、批注便签、番茄钟深化能力与 AI 辅助流转将在后续里程碑继续补齐。
