# Notes Foundation 浏览器验收

日期：2026-09-05

范围：本地 Markdown 笔记第一阶段闭环

浏览器：已安装的 Google Chrome，由 Playwright `channel: "chrome"` 驱动

## 验收结论

`/notes` 已具备可用的本地优先基础闭环：收件箱创建、Markdown 标题与正文、自动保存及重载恢复、任意节点正文、子笔记、同级笔记、移动、子树软删除与恢复，以及单文件 Markdown 下载。

Markdown 阅读模式不会执行原始 HTML/脚本；Markdown 远程图片会被替换为“已阻止加载”提示，验收监听到的远程图片请求为 0。`javascript:` 与 `data:` 链接的 `href` 会被清空，普通 `https:` 链接保留原地址，并明确带 `target="_blank"` 与 `rel="noreferrer noopener"`。

审查增强断言发现 768px 内容栏曾被内部操作区撑宽并由 `overflow: hidden` 掩盖。最小 CSS 修复在 768–834px 收窄目录栏、纵向排列笔记操作区，并让 Markdown 格式按钮等分可用宽度；同一断言随后覆盖全部六档宽度及 200% 文字并通过。

## 自动化覆盖

- 从首次引导进入笔记页，在收件箱创建父笔记，保存 Markdown 后重载，并逐字段核对 IndexedDB 文档。
- 创建子笔记和同级目录，将父节点移动到新目录；移动前后父/子节点 ID 与正文保持不变。
- 将父节点及子树移入回收站并恢复；恢复后没有缺失节点，父子关系、ID 与正文保持不变。
- 下载 Markdown，核对 `.md` 文件名以及父、子标题和正文内容。
- 对 `javascript:`、`data:` 与普通 `https:` Markdown 链接直接核对渲染后的 `href`、`target`、`rel`，并确认危险脚本标记未执行。
- 注入一次 IndexedDB 写入失败，核对失败状态、本地草稿、重载恢复与后续成功保存。
- 在两个真实页面中制造修订冲突，核对不会覆盖新版本，并可下载本地草稿或重新载入当前版本。
- 在 HTTP 预览中禁用 `crypto.randomUUID`，连续创建两个符合 UUID v4 形状且互不相同的 ID。
- 对空态及已填充主状态执行 axe；检查键盘焦点轮廓、抽屉 Escape 关闭与焦点返回。

## 响应式与可读性

| 视口宽度 | 布局 | 200% 文字 | 元素边界/裁切 | 44px 目标 | 全局横向溢出 |
| ---: | --- | --- | --- | --- | --- |
| 390 | 手机正文 + 目录抽屉 | 通过 | 通过 | 通过 | 无 |
| 402 | 手机正文 + 目录抽屉；标题与按钮文字单行 | 通过 | 通过 | 通过 | 无 |
| 768 | 紧凑双栏平板 | 通过 | 通过 | 通过 | 无 |
| 834 | 紧凑双栏平板 | 通过 | 通过 | 通过 | 无 |
| 1024 | 双栏平板/桌面 | 通过 | 通过 | 通过 | 无 |
| 1366 | 桌面 | 通过 | 通过 | 通过 | 无 |

每个宽度均核对 header、笔记内容区、编辑器、正文输入、目录/抽屉、区域导航与树节点在视口/所属容器内；目录和内容区互不覆盖，关键按钮具备至少 44×44px 命中区域且文字不裁切。200% 文字后重复执行关键边界、重叠、裁切及触控目标检查。边界数据由 Playwright 作为 JSON 附件保存到当次测试结果。稳定截图位于项目的忽略目录 `staging/notes-foundation/`：

- `notes-402-editor.png`
- `notes-402-directory.png`
- `notes-1024-editor.png`

截图使用固定的通用样本文字，不含个人或真实用户数据。

## 验证命令

```powershell
pnpm verify
node node_modules\@playwright\test\cli.js test "e2e/notes.spec.ts" --project=chromium --output=test-results-notes
pnpm test:pwa-lifecycle
```

本机 `pnpm exec playwright` 无法解析已安装 CLI，因此浏览器测试直接调用同一份 `node_modules/@playwright/test/cli.js`。这不改变 Playwright 配置、Chrome channel 或用例行为。

2026-09-05 的最终证据：

- `pnpm verify`：退出码 0；54 个测试文件、253 项单元/组件测试通过；TypeScript、ESLint 与生产构建通过。
- Notes Chrome 验收：6/6 通过（20.9 秒），包含链接协议属性与六档逐元素布局边界增强断言。
- PWA Chrome 浏览器验收：2/2 通过；`pnpm test:pwa-lifecycle` 验证 `pwa-v1 → 更新提示 → pwa-v2` 通过。
- Home 全量运行中 12/13 通过；唯一失败是旧测试仍寻找笔记标题“知识笔记”，更新为实际主标题“笔记工作台”后目标回归 1/1 通过。
- Plans 长流程在本轮额外回归中停在一个旧测试定位器：测试等待已不再存在的“学期卡片”按钮，而当前页面与快照显示学习周期已改由“选择学期或假期”下拉框选择。Notes Task 3 没有修改计划产品代码，此脚本漂移留给计划工作区单独修订。
- `http://127.0.0.1:4176/` 可访问，返回 HTML 与最新 `dist/index.html` 完全一致；审查修复构建的入口指纹为 `index-qhX17ck-.js` 与 `index-CPY2iiVm.css`。
- 构建保留既有提示：主入口压缩前约 562.53 kB，超过 Vite 的 500 kB 建议阈值；Markdown 阅读器已独立分块。

## 已知边界

- 数据保存在当前浏览器 origin 的 IndexedDB/localStorage；不同地址、浏览器或设备之间不会自动同步。
- 多页面冲突可发现并恢复，但不是实时协作或云同步。
- HTTP 局域网预览支持本地数据与 ID 创建；Service Worker 离线缓存仍需要受信任的安全上下文。
- 本轮只使用浏览器视口模拟验证手机/平板布局，没有声称完成物理 Android、触摸键盘或厂商浏览器验证。
- 搜索、当日灵感、录音、AI、附件、PDF 与永久删除不属于第一阶段。
