# Velow Notebook launch-screen design QA

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

- Weekly and monthly overall plans are local-first range notes containing a theme, goal, up to five focus items, and an optional note. They never copy or own dated tasks.
- The month calendar uses seven equal-width columns and stays inside its surface. On phone and portrait tablet the selected-day panel stacks below; at 1024px and above it becomes the secondary 35% column.
- Selected-day task lists preview two items before an explicit expand control and scroll internally when long, preventing the month page from becoming an unbounded task feed.
- Incomplete task bars always show a decorative flow arrow. A slow right swipe completes at 45% width; a fast flick completes after 20% width at 0.65px/ms or faster. Vertical intent keeps page scrolling available.
- Completed cards use a saturated purple-gray glass state with text status and undo. No checkbox or thin per-task progress bar is used.
- User-facing navigation and controls use “学期” or “学期与假期”; view-specific progress copy distinguishes today, week, month, and semester completion.
- Weekly/monthly plan editing is a bottom drawer below 768px and a right drawer at 768px and above. Focus is trapped while open, Escape/cancel protects dirty drafts, and focus returns to the originating control.
- Nonessential transitions are disabled by `prefers-reduced-motion: reduce`; keyboard completion and explicit action menus remain available without gestures.

## Responsive matrix

| Width | Expected composition | Result |
| --- | --- | --- |
| 375 / 390px | Bottom navigation, contained seven-column calendar, selected-day preview below, bottom range-plan drawer | Passed |
| 768 / 834px | Navigation rail, full-width calendar with stacked selected-day panel, right range-plan drawer | Passed |
| 1024px | Full-width month surface, approximately 65/35 calendar/task split, equal secondary cards below | Passed |
| 1366 / 1440px | Expanded workspace with the same hierarchy and no page-level horizontal overflow | Passed |

## Known limitations

- Range plans are stored on the current device and do not yet sync across devices or accounts.
- Right-swipe completion is intended for pointer/touch input; keyboard users complete with Enter or Space, and all users retain explicit task actions.
- Very long selected-day lists are deliberately contained in their own scroll region rather than expanding the full month page.

Plan-workspace result: passed
