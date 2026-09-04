# Velow Notebook

> 捕捉灵感，保持心流。Catch ideas, keep flowing.

Velow Notebook 是面向大学生的本地优先学习工作台。学习计划提供日、周、月、学期四个独立工作区：每项任务只属于一个层级及其周期，各层级共用简洁的任务列表、右滑完成和撤销操作，并能在离线状态下继续创建与完成任务。

## 已实现

- React、TypeScript、Vite、Dexie 与 PWA 本地优先应用基础
- 首页、计划、笔记、专注、设置五个可访问路由
- 首页学习驾驶舱：今日进度、下一项任务、最近笔记与专注入口
- 四个独立计划工作区：日、周、月、学期；进度仅统计当前层级与周期的任务
- 周 / 月 / 学期采用统一任务列表；周以周一、月以年月、学期以所选阶段 ID 确定归属
- 学期 / 寒暑假阶段管理：创建、编辑、删除、重叠校验与跨阶段任务复制
- 计划任务创建、编辑、删除、完成、改期与排序校验
- 常驻箭头与一次性提示帮助发现右滑完成；45% 慢滑或 20% 快速滑动即可完成
- 日任务支持 350ms 长按拖动调整安排；各层级支持键盘 Enter / Space 完成与操作菜单编辑
- 手机、平板、桌面多断点布局与 44px 最小可点击目标
- 语义化配色、`prefers-reduced-motion` 降级、axe 无障碍检查
- 离线缓存、离线重载、离线创建 / 完成任务后的本地持久化
- 版本升级兼容：保留可迁移的旧版日任务，隔离无法可靠迁移的损坏旧数据

## 学习计划使用方式

- 日计划：查看当天定时与待安排任务；日任务不会自动出现在周、月或学期中
- 周计划：在单一列表安排本周任务，通过上一周、下一周或日期选择器切换周期
- 月计划：在单一列表安排本月任务，通过上一月、下一月或月份选择器切换周期
- 学期计划：选择一个学期或假期后安排该阶段任务；管理阶段、编辑起止日期，或把上一阶段未完成的学期任务复制成新任务。复制后的任务独立完成
- 新建任务的层级由当前工作区确定；编辑只能调整同一层级内的周期。无效学期链接会显示可恢复的选择状态，不提供保存入口
- 右滑任意层级任务只更新该任务与当前工作区进度，五秒内可撤销；周和月不再显示日历、日期任务汇总或范围计划抽屉
- 键盘替代：聚焦任务条后按 Enter 或空格可完成任务；对话框关闭后焦点会返回原触发控件
- 保存失败时保留表单全部内容并提供重试；操作菜单完成后焦点返回原任务
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
- [独立计划工作区设计规格](docs/superpowers/specs/2026-09-01-velow-independent-plan-workspaces-design.md)
- [新版手机视觉对照图](docs/qa/velo-reference-mobile-comparison.png)

树状知识库、拍照录入、批注便签、番茄钟深化能力与 AI 辅助流转将在后续里程碑继续补齐。
