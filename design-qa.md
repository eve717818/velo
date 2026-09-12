# Velow Notebook launch-screen design QA

## UI baseline follow-up — 2026-09-13

### Typography and spacing follow-up

- Shared font tokens now define a system fallback stack, 24–32px regular page headings, 18px section headings, 16px body text, and 13px captions. Plans, notes, focus and settings page headings use the common role; welcome artwork and the home greeting remain deliberate exceptions.
- Removed duplicated focus page gutters/bottom padding because AppShell owns outer spacing. Small note headers wrap actions onto a separate row instead of truncating the page title.
- Build and lint passed; four browser cases covering home, note paths, focus, plans and settings at 320/390/768px passed. Inspected mobile screenshots. Deep dialog typography and 200% text enlargement are not yet comprehensively verified.

- Implemented the three selected plans under design-plans/: 44px home/path targets, shared focus tokens and clearly unavailable capture action.
- Browser checks at 320/390/768px measured both dimensions of target controls at >=44px, checked long note paths without horizontal overflow, and verified visible capture availability text. Home/focus axe checks passed. Focus refresh/pause/history regression passed.
- Retained the original logo, compact frameless tree, paper card and timer-specific visuals. This is not a full-site redesign or accessibility certification; 200% text scaling and real-phone review remain for the next typography pass.

## Source truth and render evidence

- Approved logo source: `D:\新建文件夹 (2)\2.jpg` (1413 × 2721 px).
- Approved mobile source: `D:\新建文件夹 (2)\4.jpg` (1413 × 3025 px).
- Approved tablet source: `D:\新建文件夹 (2)\3.jpg` (4237 × 3071 px).
- Mobile implementation: `docs/qa/velow-welcome-mobile-390.png`, captured at a 390 × 844 CSS viewport after 2200 ms.
- Tablet implementation: `docs/qa/velow-welcome-tablet-1180.png`, captured at a 1180 × 820 CSS viewport after 2200 ms.
- Mobile comparison: `docs/qa/velow-welcome-mobile-comparison.jpg` (source left, implementation right; both normalized to 390 × 844).
- Tablet comparison: `docs/qa/velow-welcome-tablet-comparison.jpg` (source left, implementation right; source fitted without cropping into 1180 × 820).
- Tested state: first run, final animation frame, before the user clicks `Get started`.

## Visual match

- Logo: the shipped mark, curve, vertical wordmark, and horizontal lockup are transparent PNG assets extracted from the approved source rather than reconstructed approximations.
- Color: the sampled core brand purple is `#901D78`; the welcome canvas remains near-white and the call-to-action uses the reference's pale yellow.
- Typography: the two-line promise uses Outfit with the approved quiet, lightly weighted treatment; the line breaks, center alignment, and mobile/tablet scale match the source hierarchy.
- Spacing: mobile and landscape-tablet use separate responsive ratios for logo position, message offset, button width, and bottom safe-area spacing.
- Image quality: exported mark layers retain transparent padding and contain no opaque black edge pixels.
- Copy: product naming is consistently `Velow Notebook`; the promise is `Catch ideas` / `Keep flowing`.

## Motion and interaction

- The white inner curve loops indefinitely using compositor-only `transform` animation.
- The two promise lines flash in sequentially, then rest in a static final frame.
- The `Get started` control arrives last and remains available until clicked; there is no automatic dismissal.
- First completion is stored locally. Subsequent launches bypass onboarding and open the home cockpit directly.
- Body scrolling is locked while the fixed welcome screen is present and restored after it closes.
- `prefers-reduced-motion: reduce` removes all entrance and looping motion without hiding content.
- Keyboard focus, hover, and pressed states remain visible, and the button exceeds the 44 px touch-target minimum.

## Comparison history

- P1: the first implementation used an approximate inline SVG. Replaced it with assets extracted from the approved logo source.
- P1: extracted transparent padding initially contained opaque black hairline pixels. Corrected the Sharp padding alpha and added a regression test.
- P2: the fixed welcome screen initially allowed the underlying page scrollbar to remain active. Added and tested body scroll locking.
- P2: tablet logo, promise, and button ratios were too large for the landscape source. Added a landscape-tablet layout and proportion assertions.
- P2: the mobile button was wider than the source. Reduced it to 296 × 54 px and verified its final-frame bottom spacing.
- P2: the first mobile assertion sampled the button during its delayed entrance transform. The test now waits for the user-approved final static frame before measuring.

## Findings

- P0: none.
- P1: none.
- P2: none after source-asset, scroll-lock, responsive-ratio, and final-frame revisions.
- P3: the tablet vertical logo renders approximately 5–10% smaller than the raster reference; keeping it avoids displacing the already aligned promise block and does not affect recognition.

Final result: passed

---

# Responsive learning-plan workspace QA

## Verified behavior

- Day, week, month, and semester are independent task workspaces. Each row belongs to exactly one scope and period; progress never aggregates another scope.
- Day retains timed and unscheduled lanes. Week, month, and semester reuse one ordered task list; there are no seven-column calendars, selected-day panels, or range-plan drawers.
- The existing quiet workspace style, brand purple, cool-blue navigation and teal progress are retained. Task lists take the available width; at 1024px and above the workspace is centered within 1040px, with secondary progress beside it on large desktops.
- Incomplete task bars always show a decorative flow arrow. A slow right swipe completes at 45% width; a fast flick completes after 20% width at 0.65px/ms or faster. Vertical intent keeps page scrolling available.
- Completed cards use a saturated purple-gray glass state with text status and undo. No checkbox or thin per-task progress bar is used.
- User-facing navigation and controls use “学期” or “学期与假期”; view-specific progress copy distinguishes today, week, month, and semester completion.
- Task creation locks scope to the current workspace. Invalid semester links show a recoverable selector and cannot open a save form. Injected IndexedDB failures preserve title, period, subject, estimate and notes; retry succeeds and restores the create/edit trigger focus.
- Task-menu completion restores the same row's focus after native dialog teardown. Error/retry occupies a full-width row above equal-height cancel/save controls.
- Nonessential transitions are disabled by `prefers-reduced-motion: reduce`; keyboard completion and explicit action menus remain available without gestures.

## Responsive matrix

| Width | Expected composition | Result |
| --- | --- | --- |
| 375×900 / 390×844 | Bottom navigation; compact previous/picker/next row; full-width task list and stacked progress | Passed |
| 768×1024 / 834×1112 | Navigation rail; readable single-list workspace with stacked progress | Passed |
| 1024×820 | Centered workspace within 1040px; task list above progress | Passed |
| 1366×900 / 1440×900 | Centered task surface beside progress | Passed |

The matrix checks all four scopes at every size, both normal and 200% root text size: no page-level horizontal overflow, cards inside their nearest list surface, growing task height, doubled task text, and no title/metadata/status overlap. Previous/next, picker, management, create and view controls expose at least 44×44 CSS pixels. Screenshots are produced in `test-results/plans-independent-plan-wor-34714-ccessible-and-offline-ready-chromium/` using `<width>-<view>[-text200].png`, plus `invalid-semester.png` and `failed-save.png`.

## Known limitations

- Tasks are stored on the current device and do not yet sync across devices or accounts.
- Right-swipe completion is intended for pointer/touch input; keyboard users complete with Enter or Space, and all users retain explicit task actions.
- Automated axe scans and keyboard checks do not constitute screen-reader or full WCAG certification; physical-device touch and screen-reader review remain manual acceptance items. Root-text scaling exercises rem-based task text; browser page zoom is not claimed as tested.

Verification on 2026-09-04: `pnpm verify` passed typecheck, lint, all 51 Vitest files / 223 tests, and build. `pnpm exec playwright test` passed all 17 tests, including unchanged home and PWA suites and a native Chrome development-StrictMode regression. That regression first failed on a stale native close event delivered after reopening; the shared dialog now ignores that event while preserving Escape, cancel, edit chaining, intentional native close and task completion focus. `pnpm test:pwa-lifecycle` verified `pwa-v1 → prompt → pwa-v2`. `git diff --check` passed. The existing production bundle-size warning remains (approximately 535 kB minified main JS); runtime dependencies are unchanged.

All 58 screenshots were generated; representative screenshots across every width, normal/200% mobile text, invalid selection and failed save were visually inspected. Compact mobile navigation, timed-day layout and full-width retry/error layout were rechecked in final captures. Full-page phone screenshots include the fixed bottom navigation at its viewport position; the underlying content is reachable by scrolling.

Plan-workspace result: automated and rendered verification passed; ready for manual acceptance of the four independent workspaces.
