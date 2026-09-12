# 补足首页与笔记路径点击区域

Written against: `bc8e9ae25f0cf4e8cf933764a3a99c8998810268`。用户已同意将审核三项转为实施计划；本文件不代表已实施。

## Evidence chain
- Surface：首页 HomePage → RecentNoteRow 的“查看全部”；NotesPage → NotesWorkspace 的当前笔记路径。
- Contract：README 第21行规定44px最小点击目标。
- Owner：src/features/home/HomePage.module.css 的 .sectionLink；src/features/notes/NotesWorkspace.module.css 的 .breadcrumbs button，两者当前 min-height:36px。
- Uncertainty：需在浏览器测量实际矩形；上次浏览器连接失败，不能沿用旧截图作为新验收。

## Design decision
把这两类入口实际点击区域提高至至少44×44 CSS px，不放大文字，不增加知识树节点边框。

## Reuse
沿用现有局部选择器、颜色、焦点样式和链接/按钮语义；44px来自README，不引入新组件。

## Changes
1. HomePage.module.css：.sectionLink 设置 min-height:44px、min-width:44px，保持文字垂直居中及胶囊外观。
2. NotesWorkspace.module.css：.breadcrumbs button 设置 min-height:44px、min-width:44px；保留150px最大宽度、ellipsis和路径换行。
3. e2e/home.spec.ts、e2e/notes.spec.ts（实施前核实文件）：增加实际 boundingBox 断言，覆盖短名称与长路径。不得只断言CSS字符串。

## Scope
- Inherit：使用上述两个选择器的入口。
- Verify：笔记返回和更多按钮不被挤出视口，长路径可换行。
- Exclude：树节点行距、目录加号、保存逻辑和数据模型。

## Validation
- 320/390/428/768px、200%文字放大：点击区域不重叠，无横向溢出，路径仍可操作。
- 键盘Tab可见焦点；点击查看全部进入笔记，路径按钮保持原行为。
- pnpm verify；相关Playwright用例通过。记录实测矩形而非宣称外部认证。

## Stop conditions
若选择器拥有者改变或存在更高优先级覆盖，先重新追踪；不可用负边距或重叠伪元素伪造触控尺寸。

## Design documentation
验收后在design-qa.md记录两个入口的实际44px验证及视口；不新增第二套尺寸规范。

