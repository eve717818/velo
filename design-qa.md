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
