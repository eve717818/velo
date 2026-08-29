# Task 8 Fix Round 1 Report

## Scope

- Base: `3d16bd1ec75aefe2590b418146dc47f098c8aa5c`
- Head: this report is committed with `fix: separate scrolling from task gestures`
- Worktree: `D:\workplace\projects\project01-velo\workspace`

## Inherited Changes

- `TaskBar` already had a `verticalScrollCancelled` pointer state before this handoff.
- The inherited implementation cancels long press, clears swipe preview and drag preview, and releases the pointer without completing or dropping once vertical movement exceeds 8px.
- The inherited `task-drop` implementation already rejects non-integer minute strings and accepts only integer minutes from 0 through 1439.

## Fix-Round Changes

- Added a direct regression test proving `setTaskCompletion` is not called when a pointer reaches 70% horizontal swipe and then exceeds the 8px vertical scroll threshold.
- Added coverage for release-time vertical cancellation, lost-capture reset followed by a fresh horizontal swipe, and active-drag vertical cancellation that must not call `movePlanTask`.
- Added TaskBar drag/drop assertions for untimed cross-date movement and timed same-lane reordering, alongside the inherited timed target and untimed same-lane cases.
- Added task-drop target parser tests for inclusive minute boundaries `0` and `1439`, plus fractional minutes rejection.

## Red/Green Evidence

- Inherited pre-edit focused test state: `pnpm test:run src/features/plans/components/TaskBar.test.tsx src/features/plans/components/TaskDragLayer.test.tsx src/features/plans/domain/task-drop.test.ts` -> 3 files passed, 21 tests passed.
- New active-drag cancellation test initially failed because the optional `startMinutes` assertion expected an explicit property instead of checking the value; the product behavior already stayed unchanged and `movePlanTask` was not called.
- After correcting that test assertion, Task8+Task7 focused tests passed: 5 files passed, 33 tests passed.

## Verification

- `pnpm test:run src/features/plans/components/TaskBar.test.tsx src/features/plans/components/TaskDragLayer.test.tsx src/features/plans/domain/task-drop.test.ts src/features/plans/domain/task-gesture.test.ts src/features/plans/data/plan-task-service.test.ts` -> 5 files passed, 33 tests passed.
- `pnpm typecheck` -> passed.
- `pnpm lint` -> passed.
- `git diff --check` -> passed.

## Remaining Items

- None known in the requested Task 8/Task 7 scope.
- `task-8-brief.md` was requested but was not present under the project `workspace` or `staging`; this report records the handoff requirements from the task prompt instead.
