# Velo Milestone 1 Foundation and Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable, offline-capable Velo PWA whose responsive home cockpit matches the approved Web/mobile direction and reads real local IndexedDB data.

**Architecture:** A React/TypeScript/Vite single-page application owns presentation and routing; Dexie owns local persistent data and exposes reactive queries; Motion owns state-driven transitions with a reduced-motion path; vite-plugin-pwa owns the manifest, service worker, and update prompt. Feature folders own domain logic and focused UI, while the app shell owns navigation and responsive composition.

**Tech Stack:** Node.js 24.19+, pnpm 11.19+, React, TypeScript, Vite, React Router, Dexie, dexie-react-hooks, Motion for React, Lucide React, vite-plugin-pwa, Vitest, Testing Library, Playwright, axe-core, Sharp, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-08-25-velo-product-design.md`

## Global Constraints

- Product name is `Velo`; the visible approved wordmark is stylized lowercase `velo` with an open blue-violet `o`; never render `Velo {微流}`.
- Supported reference widths are 375, 390, 768, 834, 1024, and 1440 CSS pixels.
- Mobile bottom navigation exposes 首页、计划、笔记、专注; 设置 is reached from the top menu. Tablet/desktop uses a left rail with 设置 at the bottom.
- Core planning/note data must remain usable offline and persist in IndexedDB; no account or cloud sync is introduced.
- Normal body text must meet WCAG 2.2 AA contrast, and touch-primary controls must be at least 44×44 CSS pixels.
- Glass surfaces are limited to navigation, drawers, and transient overlays; routine content uses opaque or softly tinted surfaces.
- Motion must explain state changes, avoid looping decoration, and provide a no-displacement `prefers-reduced-motion` path.
- Milestone 1 routes beyond the home cockpit are accessible shell destinations only; plan, note, and focus workflows are implemented in their own later milestones.

## File Map

```text
index.html                         Vite document shell and metadata
package.json                       dependencies and quality scripts
vite.config.ts                     React, aliases, Vitest and PWA config
playwright.config.ts               production-preview browser tests
scripts/generate-pwa-assets.mjs    deterministic SVG-to-PNG PWA assets
public/brand/velo-mark.svg         standalone open-current mark
public/brand/velo-wordmark.svg     approved wordmark lockup
src/app/                           router, providers and app shell composition
src/components/brand/              reusable accessible logo
src/components/navigation/         mobile bar and desktop rail
src/db/                            Dexie schema, types and deterministic seed
src/features/home/                 home query, hook, components and styles
src/pages/                         milestone route surfaces
src/pwa/                           service-worker registration/update UI
src/styles/                        tokens, reset, global responsive rules
src/test/                          Vitest/JSDOM/fake-IndexedDB setup
e2e/                               responsive, accessibility and offline checks
```

---

### Task 1: Bootstrap the React application and test harness

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `eslint.config.js`
- Create: `src/vite-env.d.ts`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/test/setup.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `App(): JSX.Element`, scripts `dev`, `build`, `typecheck`, `lint`, `test`, `test:run`, `test:e2e`, `verify`.

- [ ] **Step 1: Create package metadata and install exact dependency families**

Create `package.json`:

```json
{
  "name": "velo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@11.19.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --pretty false",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "pnpm build && playwright test",
    "assets:pwa": "node scripts/generate-pwa-assets.mjs",
    "verify": "pnpm typecheck && pnpm lint && pnpm test:run && pnpm build"
  }
}
```

Run:

```powershell
pnpm add react react-dom react-router-dom dexie dexie-react-hooks lucide-react motion clsx @fontsource-variable/plus-jakarta-sans
pnpm add -D vite @vitejs/plugin-react typescript@5.9.3 @types/react @types/react-dom vite-plugin-pwa sharp vitest jsdom fake-indexeddb @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test @axe-core/playwright eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals
```

Expected: `package.json` receives concrete compatible versions and `pnpm-lock.yaml` is created. The lockfile is the version source of truth.

- [ ] **Step 2: Add TypeScript, Vite, ESLint, HTML and test setup**

Configure strict TypeScript with `@/* -> src/*` and no deprecated `baseUrl`, Vite React with native `resolve.alias`, JSDOM, and `src/test/setup.ts` containing:

`vite.config.ts` begins with:

```ts
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": "/src" } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
  },
})
```

`eslint.config.js` uses this exact base:

```js
import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist", "coverage", "playwright-report", "test-results"] },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
```

```ts
import "@testing-library/jest-dom/vitest"
import "fake-indexeddb/auto"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => cleanup())
```

Use `index.html` metadata:

```html
<meta name="theme-color" content="#f7f7ff" />
<meta name="description" content="Velo — 捕捉灵感，保持心流" />
<title>Velo</title>
```

- [ ] **Step 3: Write the failing application smoke test**

Create `src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { App } from "./App"

describe("App", () => {
  it("exposes the Velo application landmark", () => {
    render(<App />)
    expect(screen.getByRole("application", { name: "Velo" })).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run the test and confirm the red state**

Run: `pnpm test:run src/app/App.test.tsx`

Expected: FAIL because `src/app/App.tsx` does not yet export `App`.

- [ ] **Step 5: Implement the smallest application entry**

Create `src/app/App.tsx`:

```tsx
export function App() {
  return <div role="application" aria-label="Velo" />
}
```

Create `src/main.tsx` with `createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>)`.

- [ ] **Step 6: Run the foundation checks**

Run:

```powershell
pnpm test:run src/app/App.test.tsx
pnpm typecheck
pnpm lint
```

Expected: all commands exit 0; the smoke test reports 1 passing test.

- [ ] **Step 7: Commit the foundation**

```powershell
git add package.json pnpm-lock.yaml index.html tsconfig*.json vite.config.ts eslint.config.js .gitignore src
git commit -m "build: bootstrap Velo frontend"
```

---

### Task 2: Add the versioned local database and deterministic home seed

**Files:**
- Create: `src/lib/local-date.ts`
- Create: `src/lib/local-date.test.ts`
- Create: `src/db/types.ts`
- Create: `src/db/velo-db.ts`
- Create: `src/db/seed.ts`
- Create: `src/db/velo-db.test.ts`

**Interfaces:**
- Produces: `formatLocalDate(date: Date): string` returning `YYYY-MM-DD` in local time.
- Produces: `PlanTask`, `KnowledgeNode`, `NoteDocument`, `AppMeta`, `VeloDB`, singleton `veloDb`, and `seedHomeDemo(db: VeloDB, now: Date): Promise<void>`.

- [ ] **Step 1: Write failing local-date and database tests**

Use this fixed test data:

```ts
expect(formatLocalDate(new Date(2026, 7, 5, 23, 0))).toBe("2026-08-05")
```

Database test requirements:

```ts
const db = new VeloDB(`velo-test-${crypto.randomUUID()}`)
await seedHomeDemo(db, new Date(2026, 7, 25, 9, 0))
expect(await db.planTasks.where("periodKey").equals("2026-08-25").count()).toBe(5)
expect(await db.planTasks.where("isCompleted").equals(1).count()).toBe(3)
expect(await db.notes.orderBy("updatedAt").last()).toMatchObject({ title: "线性代数：矩阵的秩" })
await db.delete()
```

Add three non-empty-database cases: task-only, note-only, and mixed task/note data. In each case `seedHomeDemo` must leave existing domain rows unchanged, must not add demo rows, and must write `homeDemoSeed = "v1:skipped-existing-data"` to `appMeta`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test:run src/lib/local-date.test.ts src/db/velo-db.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Define the milestone-1 domain types**

Create `src/db/types.ts`:

```ts
export type PlanScope = "day" | "week" | "month" | "semester"

export interface PlanTask {
  id: string
  scope: PlanScope
  periodKey: string
  title: string
  subject?: string
  estimatedMinutes?: number
  linkedNodeId?: string
  isCompleted: 0 | 1
  order: number
  createdAt: number
  updatedAt: number
}

export interface KnowledgeNode {
  id: string
  parentId: string | null
  type: "folder" | "note"
  title: string
  order: number
  createdAt: number
  updatedAt: number
}

export interface NoteDocument {
  id: string
  nodeId: string
  title: string
  content: Record<string, unknown>
  plainText: string
  createdAt: number
  updatedAt: number
}

export interface AppMeta {
  key: string
  value: string
  updatedAt: number
}
```

- [ ] **Step 4: Implement the typed Dexie schema**

Create a `VeloDB extends Dexie` whose constructor accepts a database name and whose version 1 stores are:

```ts
this.version(1).stores({
  planTasks: "id, [scope+periodKey], periodKey, isCompleted, order, updatedAt",
  knowledgeNodes: "id, parentId, type, order, updatedAt",
  notes: "id, nodeId, title, updatedAt",
  appMeta: "key, updatedAt",
})
```

Export `const veloDb = new VeloDB("velo")`.

- [ ] **Step 5: Implement idempotent seed data**

`seedHomeDemo` must use a single transaction over `planTasks`, `knowledgeNodes`, `notes`, and `appMeta`. If `appMeta.homeDemoSeed` already exists, return without domain writes. When the marker is absent, count all three domain tables: seed only if every count is zero; otherwise write `homeDemoSeed = "v1:skipped-existing-data"` and leave all domain rows untouched. A fresh database receives these five ordered day tasks: completed `英语阅读 · Chapter 3`, completed `线性代数 · 习题整理`, completed `程序设计 · 函数与递归`, incomplete `高等数学 · 导数复习`, and incomplete `物理实验报告 · 数据整理`; it also receives the recent note `线性代数：矩阵的秩` and marker `homeDemoSeed = "v1:applied"`.

- [ ] **Step 6: Run database checks**

Run:

```powershell
pnpm test:run src/lib/local-date.test.ts src/db/velo-db.test.ts
pnpm typecheck
```

Expected: both test files pass and TypeScript exits 0.

- [ ] **Step 7: Commit local persistence**

```powershell
git add src/db src/lib
git commit -m "feat: add local Velo database"
```

---

### Task 3: Establish the approved brand and design-token system

**Files:**
- Create: `public/brand/velo-mark.svg`
- Create: `public/brand/velo-wordmark.svg`
- Create: `src/components/brand/VeloLogo.tsx`
- Create: `src/components/brand/VeloLogo.test.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/reset.css`
- Create: `src/styles/global.css`
- Modify: `src/main.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `VeloLogo({ compact?: boolean, tone?: "default" | "mono" | "reverse", className?: string }): JSX.Element`.
- Produces semantic CSS tokens including `--color-brand`, `--color-surface`, `--color-coral`, `--color-mint`, `--motion-fast`, and `--motion-page`.

- [ ] **Step 1: Write the failing logo accessibility test**

```tsx
const { rerender } = render(<VeloLogo />)
expect(screen.getByRole("img", { name: "Velo" })).toBeInTheDocument()
expect(screen.queryByText(/微流/)).not.toBeInTheDocument()
rerender(<VeloLogo tone="mono" />)
expect(screen.getByRole("img", { name: "Velo" })).toHaveAttribute("data-tone", "mono")
rerender(<VeloLogo tone="reverse" />)
expect(screen.getByRole("img", { name: "Velo" })).toHaveAttribute("data-tone", "reverse")
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test:run src/components/brand/VeloLogo.test.tsx`

Expected: FAIL because `VeloLogo` does not exist.

- [ ] **Step 3: Create the scalable logo assets**

Build `velo-wordmark.svg` as path-only accessible SVG geometry containing stylized `v`, `e`, `l`, and the open circular `o`; do not use `<text>`, an external font, or an embedded raster. Build `velo-mark.svg` from the same open `o` geometry for PWA icons. Standalone assets set root `color:#11131A`; geometry uses `currentColor` for ink and `var(--velo-logo-accent, #574FE6)` for the accent, so direct rasterizers get approved defaults while CSS consumers can override both.

Install `@types/node` as a development dependency because the Node-environment Sharp rasterization test and later asset scripts import Node APIs.

Use this standalone mark geometry:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title" style="color:#11131A">
  <title id="title">Velo</title>
  <circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-dasharray="92 28" transform="rotate(-42 32 32)"/>
  <path d="M47 18a22 22 0 0 1 7 14" fill="none" stroke="var(--velo-logo-accent, #574FE6)" stroke-width="8" stroke-linecap="round"/>
</svg>
```

Use this path-only wordmark structure and keep the same `o` geometry in `VeloLogo.tsx`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 40" role="img" aria-labelledby="title" style="color:#11131A">
  <title id="title">Velo</title>
  <path d="M4 7h8l10 24L32 7h8L25 35h-6L4 7Z" fill="currentColor"/>
  <path d="M42 22c0-9 6-15 15-15 9 0 14 7 14 16v3H50c1 4 4 6 9 6 4 0 7-1 10-3v6c-3 2-7 3-11 3-10 0-16-6-16-16Zm8-2h13c0-4-2-7-6-7s-6 3-7 7Z" fill="currentColor"/>
  <path d="M77 3h8v27c0 2 1 3 3 3h2v6h-4c-6 0-9-3-9-9V3Z" fill="currentColor"/>
  <circle cx="112" cy="23" r="12" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-dasharray="58 18" transform="rotate(-42 112 23)"/>
  <path d="M122 13a15 15 0 0 1 5 10" fill="none" stroke="var(--velo-logo-accent, #574FE6)" stroke-width="7" stroke-linecap="round"/>
</svg>
```

`VeloLogo` must render the wordmark through `<svg role="img" aria-label="Velo">`, use `compact` to render the standalone mark, and accept `tone: "default" | "mono" | "reverse"`. Default uses ink `#11131A` and accent `#574FE6`; mono sets accent to `currentColor`; reverse uses white ink plus a pale-lavender accent. Component tests verify all tones preserve the accessible name, and Task 8 captures default, mono, reverse, and 24px compact browser snapshots.

- [ ] **Step 4: Define exact semantic tokens**

Create these light-theme values in `tokens.css`:

```css
:root {
  --color-canvas: #f7f7ff;
  --color-surface: #ffffff;
  --color-surface-muted: #f0efff;
  --color-text: #11131a;
  --color-text-muted: #6f7280;
  --color-brand: #574fe6;
  --color-brand-strong: #4037c8;
  --color-coral: #ff8178;
  --color-coral-soft: #ffe2df;
  --color-mint: #dff6ec;
  --color-mint-strong: #139b6b;
  --color-sticky: #ffd86a;
  --radius-control: 14px;
  --radius-card: 24px;
  --shadow-card: 0 16px 40px rgb(55 47 130 / 10%);
  --motion-fast: 160ms;
  --motion-page: 280ms;
  --ease-flow: cubic-bezier(.2, .8, .2, 1);
}
```

Add the Plus Jakarta Sans variable font import in `main.tsx`; use `"Plus Jakarta Sans Variable", "PingFang SC", "Microsoft YaHei", sans-serif` globally.

- [ ] **Step 5: Run logo and quality checks**

Run:

```powershell
pnpm test:run src/components/brand/VeloLogo.test.tsx
pnpm typecheck
pnpm lint
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the visual foundation**

```powershell
git add public/brand src/components/brand src/styles src/main.tsx
git commit -m "feat: add Velo brand system"
```

---

### Task 4: Build the responsive application shell and real routes

**Files:**
- Create: `src/app/AppRoutes.tsx`
- Create: `src/app/AppShell.tsx`
- Create: `src/app/AppShell.module.css`
- Create: `src/components/navigation/PrimaryNav.tsx`
- Create: `src/components/navigation/PrimaryNav.test.tsx`
- Create: `src/components/navigation/PrimaryNav.module.css`
- Create: `src/components/navigation/MobileTopMenu.tsx`
- Create: `src/components/navigation/MobileTopMenu.test.tsx`
- Create: `src/components/navigation/MobileTopMenu.module.css`
- Create: `src/pages/PlansPage.tsx`
- Create: `src/pages/HomePage.tsx`
- Create: `src/pages/NotesPage.tsx`
- Create: `src/pages/FocusPage.tsx`
- Create: `src/pages/SettingsPage.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `AppRoutes(): JSX.Element`, `AppShell(): JSX.Element`, `PrimaryNav({ variant }: { variant: "mobile" | "rail" }): JSX.Element`, and `MobileTopMenu(): JSX.Element`.
- Consumes: `VeloLogo` and React Router `NavLink`/`Outlet`.

- [ ] **Step 1: Write failing route and navigation tests**

Test with `MemoryRouter` that `/plans` renders heading `学习计划`, that navigation exposes 首页、计划、笔记、专注, and that 设置 appears in the rail variant but not the mobile primary list. Separately render `MobileTopMenu`, activate its `打开菜单` button, assert a menu item named `设置`, click it, and verify the router location becomes `/settings`.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `pnpm test:run src/components/navigation/PrimaryNav.test.tsx src/app/App.test.tsx`

Expected: FAIL because the app shell and routes are missing.

- [ ] **Step 3: Implement route ownership**

Use these routes:

```tsx
<Route element={<AppShell />}>
  <Route index element={<HomePage />} />
  <Route path="plans" element={<PlansPage />} />
  <Route path="notes" element={<NotesPage />} />
  <Route path="focus" element={<FocusPage />} />
  <Route path="settings" element={<SettingsPage />} />
</Route>
```

Before Task 5 exists, `src/pages/HomePage.tsx` is a focused interim component that renders heading `学习驾驶舱`; Task 5 changes the index route to `src/features/home/HomePage.tsx`.

Each shell destination uses a real landmark rather than a blank surface:

```tsx
export function PlansPage() {
  return <main><h1>学习计划</h1><p>日、周、月和学期计划将在里程碑 2 启用。</p></main>
}

export function NotesPage() {
  return <main><h1>知识笔记</h1><p>树状知识工作台将在里程碑 3 启用。</p></main>
}

export function FocusPage() {
  return <main><h1>专注</h1><p>番茄钟将在里程碑 4 启用。</p></main>
}

export function SettingsPage() {
  return <main><h1>设置</h1><p>本地数据与偏好设置。</p></main>
}
```

- [ ] **Step 4: Implement adaptive navigation**

Use Lucide icons `House`, `CalendarDays`, `NotebookTabs`, `Timer`, `Settings`. CSS displays the bottom bar below 768px and the rail at/above 768px. Every link has visible text, `aria-current` from `NavLink`, a 44px minimum target, and a stable focus ring.

`MobileTopMenu` owns the small-screen settings path. It uses a 44px `Ellipsis` button labeled `打开菜单`, opens a focusable popover containing a `设置` link, closes on Escape/outside click/navigation, and restores focus to the trigger. `AppShell` displays it below 768px and hides it at/above 768px.

- [ ] **Step 5: Verify navigation behavior**

Run:

```powershell
pnpm test:run src/components/navigation/PrimaryNav.test.tsx src/components/navigation/MobileTopMenu.test.tsx src/app/App.test.tsx
pnpm typecheck
```

Expected: route and navigation tests pass.

- [ ] **Step 6: Commit the shell**

```powershell
git add src/app src/components/navigation src/pages
git commit -m "feat: add responsive Velo shell"
```

---

### Task 5: Implement the reactive home snapshot and approved cockpit

**Files:**
- Create: `src/features/home/home-query.ts`
- Create: `src/features/home/home-query.test.ts`
- Create: `src/features/home/useHomeSnapshot.ts`
- Create: `src/features/home/HomePage.tsx`
- Create: `src/features/home/HomePage.test.tsx`
- Create: `src/features/home/HomePage.module.css`
- Create: `src/app/LocalDataBootstrap.tsx`
- Create: `src/features/home/components/ProgressPanel.tsx`
- Create: `src/features/home/components/NextTaskCard.tsx`
- Create: `src/features/home/components/RecentNoteRow.tsx`
- Create: `src/features/home/components/QuickActions.tsx`
- Modify: `src/app/AppRoutes.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `HomeSnapshot`, `loadHomeSnapshot(db: VeloDB, now: Date): Promise<HomeSnapshot>`, `useHomeSnapshot(db?: VeloDB, now?: Date): HomeSnapshot | undefined`, `HomePage({ db?, now? }): JSX.Element`, and `LocalDataBootstrap`.
- Consumes: `formatLocalDate`, `VeloDB`, `PlanTask`, `NoteDocument`, Lucide icons, and router links.

- [ ] **Step 1: Write the failing home-query tests**

Define the result contract:

```ts
export interface HomeSnapshot {
  completedCount: number
  totalCount: number
  nextTask: PlanTask | null
  recentNote: NoteDocument | null
}
```

Tests must assert `3 / 5`, choose the lowest-order incomplete task as `nextTask`, choose the highest-`updatedAt` note, and return zero/null values for an empty database.

- [ ] **Step 2: Run the query tests and confirm they fail**

Run: `pnpm test:run src/features/home/home-query.test.ts`

Expected: FAIL because `loadHomeSnapshot` does not exist.

- [ ] **Step 3: Implement the minimum reactive query**

`loadHomeSnapshot` must query only `scope="day"` and the current `periodKey`. `useHomeSnapshot` must call it inside Dexie's `useLiveQuery`, using `[db, periodKey]` as dependencies. Do not copy the database into React context or duplicate it in a global state store.

Use this query shape:

```ts
export async function loadHomeSnapshot(db: VeloDB, now: Date): Promise<HomeSnapshot> {
  const periodKey = formatLocalDate(now)
  const tasks = await db.planTasks.where("[scope+periodKey]").equals(["day", periodKey]).sortBy("order")
  const recentNote = (await db.notes.orderBy("updatedAt").reverse().limit(1).toArray())[0] ?? null
  return {
    completedCount: tasks.filter((task) => task.isCompleted === 1).length,
    totalCount: tasks.length,
    nextTask: tasks.find((task) => task.isCompleted === 0) ?? null,
    recentNote,
  }
}
```

`LocalDataBootstrap` calls `seedHomeDemo(veloDb, new Date())` once on application startup, renders a geometry-preserving busy state while seeding, and renders its children only after success. On failure it renders `本地数据初始化失败` with a retry button. Wrap `AppRoutes` with this component in `App.tsx`.

- [ ] **Step 4: Write failing cockpit component tests**

Render `HomePage` against a test database and assert:

```ts
expect(await screen.findByText("3 / 5")).toBeInTheDocument()
expect(screen.getByText("高等数学 · 导数复习")).toBeInTheDocument()
expect(screen.getByText("线性代数：矩阵的秩")).toBeInTheDocument()
expect(screen.getByRole("link", { name: "新建笔记" })).toHaveAttribute("href", "/notes?new=1")
expect(screen.getByRole("link", { name: "拍照录入" })).toHaveAttribute("href", "/notes?capture=1")
expect(screen.getByRole("link", { name: "开始专注" })).toHaveAttribute("href", "/focus?start=1")
```

- [ ] **Step 5: Run the component test and confirm it fails**

Run: `pnpm test:run src/features/home/HomePage.test.tsx`

Expected: FAIL because the cockpit components are not implemented.

- [ ] **Step 6: Implement the approved responsive composition**

Match `docs/design/velo-web-home-direction.png` and `docs/design/velo-mobile-home-approved.png`:

- header: approved wordmark, greeting, local date, notifications button;
- compact blue-violet segmented progress capsule;
- coral-to-lavender next-task card;
- mint recent-note row with a yellow annotation preview;
- lower thumb-zone quick actions;
- mobile single stream, tablet two-column transition, desktop rail plus wide canvas.

Use real `HomeSnapshot` values; when data is loading, reserve the final geometry with `aria-busy="true"`; when empty, show `今天还没有计划` and a link to `/plans?new=1`.

- [ ] **Step 7: Verify the home feature**

Run:

```powershell
pnpm test:run src/features/home
pnpm typecheck
pnpm lint
```

Expected: query and component tests pass; TypeScript and ESLint exit 0.

- [ ] **Step 8: Commit the cockpit**

```powershell
git add src/features/home src/app/AppRoutes.tsx
git commit -m "feat: add reactive home cockpit"
```

---

### Task 6: Add state-driven motion with reduced-motion guarantees

**Files:**
- Create: `src/app/MotionProvider.tsx`
- Create: `src/components/motion/PageTransition.tsx`
- Create: `src/components/motion/motion-config.ts`
- Create: `src/components/motion/motion-config.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/features/home/components/ProgressPanel.tsx`
- Modify: `src/features/home/components/NextTaskCard.tsx`
- Modify: `src/features/home/components/RecentNoteRow.tsx`

**Interfaces:**
- Produces: `getFlowTransition(reduced: boolean): Transition`, `MotionProvider`, and `PageTransition`.
- Consumes: `MotionConfig`, `AnimatePresence`, `motion`, and `useReducedMotion` from `motion/react`.

- [ ] **Step 1: Write the failing motion policy test**

```ts
expect(getFlowTransition(true)).toEqual({ duration: 0 })
expect(getFlowTransition(false)).toMatchObject({ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] })
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test:run src/components/motion/motion-config.test.ts`

Expected: FAIL because the policy module is missing.

- [ ] **Step 3: Implement bounded motion primitives**

Wrap the app in `<MotionConfig reducedMotion="user">`. `PageTransition` uses opacity and at most 12px shared-axis translation with 280ms timing. Disable initial entrance animation. Use `AnimatePresence mode="wait"` around one keyed route child.

Implement the policy as:

```ts
import type { Transition } from "motion/react"

export function getFlowTransition(reduced: boolean): Transition {
  return reduced ? { duration: 0 } : { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }
}
```

Home interactions:

- progress segments animate scaleX from the previous ratio;
- actionable cards use `whileTap={{ scale: 0.985 }}` and desktop-only hover elevation of 2px;
- recent-note annotation uses one 160ms opacity/rotate transition on entry;
- no animation repeats indefinitely.

- [ ] **Step 4: Add a reduced-motion component assertion**

Mock `window.matchMedia("(prefers-reduced-motion: reduce)")` to match and assert animated components render their final content without a translated initial state or delayed timer.

- [ ] **Step 5: Run motion and regression checks**

Run:

```powershell
pnpm test:run src/components/motion src/features/home
pnpm typecheck
pnpm lint
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit motion behavior**

```powershell
git add src/app src/components/motion src/features/home
git commit -m "feat: add Velo motion system"
```

---

### Task 7: Make Velo installable and safely updatable offline

**Files:**
- Create: `scripts/generate-pwa-assets.mjs`
- Create: `public/pwa-192x192.png`
- Create: `public/pwa-512x512.png`
- Create: `public/maskable-512x512.png`
- Create: `src/pwa/PWAUpdatePrompt.tsx`
- Create: `src/pwa/PWAUpdatePrompt.test.tsx`
- Create: `src/pwa/RegisterPWA.tsx`
- Create: `src/pwa/RegisterPWA.module.css`
- Create: `src/app/build-id.ts`
- Modify: `vite.config.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Produces: `PWAUpdatePrompt({ offlineReady, needRefresh, onReload, onClose }): JSX.Element | null` and `RegisterPWA()`.
- Consumes: `virtual:pwa-register/react` and `public/brand/velo-mark.svg`.

- [ ] **Step 1: Write the failing update-prompt tests**

Assert no dialog for both flags false; `应用已可离线使用` for `offlineReady`; `发现 Velo 新版本` plus `立即更新` for `needRefresh`; clicking update calls `onReload` exactly once.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test:run src/pwa/PWAUpdatePrompt.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Generate deterministic icon assets**

Create `scripts/generate-pwa-assets.mjs` using Sharp:

```js
import sharp from "sharp"

const source = "public/brand/velo-mark.svg"
await Promise.all([
  sharp(source).resize(192, 192).png().toFile("public/pwa-192x192.png"),
  sharp(source).resize(512, 512).png().toFile("public/pwa-512x512.png"),
  sharp(source).resize(410, 410).extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#f7f7ff" }).png().toFile("public/maskable-512x512.png"),
])
```

Run: `pnpm assets:pwa`

Expected: the three PNGs exist with exact dimensions 192×192, 512×512, and 512×512.

- [ ] **Step 4: Configure manifest and prompted updates**

Add `VitePWA` with `registerType: "prompt"`, `includeAssets: ["brand/velo-mark.svg"]`, theme/background `#f7f7ff`, display `standalone`, start URL `/`, and the three generated icons. Cache only built assets and fonts; do not runtime-cache AI requests.

`RegisterPWA` maps `useRegisterSW()` state to `PWAUpdatePrompt`; updating calls `updateServiceWorker(true)`.

Inject `__VELO_BUILD_ID__` from `process.env.VITE_BUILD_ID ?? "dev"` through Vite `define`, export it from `src/app/build-id.ts`, and expose it as `data-build-id` on the application root. This deterministic identifier is used only to verify a real two-build service-worker update in Task 8.

- [ ] **Step 5: Run component and production-build checks**

Run:

```powershell
pnpm test:run src/pwa
pnpm build
```

Expected: tests pass; build exits 0; `dist/manifest.webmanifest`, `dist/sw.js`, and generated assets exist.

- [ ] **Step 6: Commit PWA support**

```powershell
git add scripts public vite.config.ts src/pwa src/app/App.tsx src/vite-env.d.ts package.json pnpm-lock.yaml
git commit -m "feat: add offline Velo PWA"
```

---

### Task 8: Verify responsive, accessible and offline behavior end to end

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/home.spec.ts`
- Create: `e2e/pwa.spec.ts`
- Create: `scripts/verify-pwa-lifecycle.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `GLOBAL-CONSOLE.md` in the workplace root after acceptance

**Interfaces:**
- Consumes: production build served by `pnpm preview --host 127.0.0.1`.
- Produces: repeatable browser acceptance suite and developer runbook.

- [ ] **Step 1: Configure Playwright against production preview**

Use Chromium and a web server command `pnpm preview --host 127.0.0.1`; CI retries once, local retries zero. Keep trace on first retry. `test:e2e` already runs `pnpm build` first.

- [ ] **Step 2: Write the responsive cockpit test**

For widths 375, 390, 768, 834, 1024 and 1440:

```ts
await page.goto("/")
await expect(page.getByText("高等数学 · 导数复习")).toBeVisible()
await expect(page.getByText("线性代数：矩阵的秩")).toBeVisible()
expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
```

At 390px assert bottom navigation is visible and the rail is hidden; at 834px assert the rail is visible and the bottom bar is hidden. Click each destination and assert the corresponding page heading.

At 390px activate `打开菜单`, click `设置`, and assert the `设置` page landmark is visible. The test must prove settings is reachable without adding it to the bottom navigation.

- [ ] **Step 3: Write accessibility and reduced-motion checks**

Run `AxeBuilder({ page }).analyze()` and assert zero violations. Emulate reduced motion and assert navigation completes with the target heading visible within 100ms and no element reports an active transform transition longer than 1ms.

Capture four logo states in the production browser: default wordmark, monochrome wordmark, reverse wordmark on the brand surface, and compact mark at 24px. Assert each SVG has the `Velo` accessible name, non-zero bounds, and no overflow; retain snapshots for review.

- [ ] **Step 4: Write install/offline checks**

Use a new browser context with cleared cookies, Cache Storage, service workers, and IndexedDB. Assert the page links a manifest, manifest name is `Velo`, display is `standalone`, required icons exist, the service worker reaches `activated`, and the fresh database shows `homeDemoSeed = "v1:applied"`. Reload once online, switch the context offline, reload `/`, and assert `Velo` plus the locally seeded home content remain visible.

Create `scripts/verify-pwa-lifecycle.mjs` to exercise a real update:

1. run `pnpm build` with `VITE_BUILD_ID=pwa-v1`;
2. start a Node static HTTP server that serves the current `dist` directory without in-memory caching;
3. open Chromium, wait for service-worker control, and assert root `data-build-id="pwa-v1"`;
4. run a second build into the same `dist` directory with `VITE_BUILD_ID=pwa-v2`;
5. call `registration.update()`, wait for the app's `发现 Velo 新版本` prompt, click `立即更新`, and assert the reloaded root has `data-build-id="pwa-v2"`;
6. close browser and server in `finally` blocks and exit non-zero on timeout or assertion failure.

Add script `test:pwa-lifecycle: "node scripts/verify-pwa-lifecycle.mjs"` to `package.json`.

- [ ] **Step 5: Run the full fresh verification matrix**

Run:

```powershell
pnpm verify
pnpm test:e2e
pnpm test:pwa-lifecycle
git diff --check
git status --short
```

Expected: unit/component tests report zero failures; typecheck, lint and build exit 0; Playwright reports all projects passing; the two-build PWA lifecycle check reaches `pwa-v2`; `git diff --check` has no errors; only the intended README update remains before commit.

- [ ] **Step 6: Update project documentation**

README must list install, `pnpm dev`, `pnpm verify`, `pnpm test:e2e`, offline behavior, milestone-1 scope, and the limitation that plan/note/focus pages are shell destinations in this milestone.

- [ ] **Step 7: Commit the acceptance suite and documentation**

```powershell
git add playwright.config.ts e2e scripts/verify-pwa-lifecycle.mjs package.json README.md
git commit -m "test: verify Velo milestone one"
```

- [ ] **Step 8: Update workplace status after implementation acceptance**

In `D:\workplace\GLOBAL-CONSOLE.md`, change project status to `待验收`, record the implementation branch, and set next step to `验收里程碑 1`. Commit this root-only update as `docs: mark Velo milestone one for review`.

## Final Acceptance Commands

```powershell
pnpm verify
pnpm test:e2e
pnpm test:pwa-lifecycle
git diff --check
git status --short
```

All four commands must complete with zero failures or unintended changes before milestone 1 is reported complete.

## Official References

- Vite Getting Started: https://vite.dev/guide/
- Dexie React tutorial: https://dexie.org/docs/Tutorial/React
- Motion for React: https://motion.dev/docs/react
- Vite PWA React integration: https://github.com/vite-pwa/vite-plugin-pwa/blob/main/docs/frameworks/react.md
