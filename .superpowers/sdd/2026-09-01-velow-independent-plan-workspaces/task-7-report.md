# Task 7 Report: Integrate Independent Plan Workspaces

## Scope

- Base: `af2d44c45e9a084d13bf04e9909d8c08602035b5`
- Branch: `feat/multiday-plan-task`
- Commit: pending at report creation; exact commit SHA is available from `git log -1 --format=%H` after commit.
- Controller amendment: include `src/features/home/home-query.ts`, `src/features/home/home-query.test.ts`, and the tracked plan-file amendment for Task 7.

## RED

- Prior implementer state: `pnpm test:run src/pages/PlansPage.test.tsx src/features/plans/components/PlanHeader.test.tsx src/features/plans/components/LearningPeriodView.test.tsx src/features/plans/components/PlanProgress.test.tsx src/features/plans/domain/learning-periods.test.ts src/features/plans/data/learning-period-service.test.ts src/features/plans/components/PeriodMigrationPanel.test.tsx`
  - Result after resume: 7 files, 33 tests, 32 passed, 1 failed.
  - Failure: `src/features/plans/data/learning-period-service.test.ts` expected 5 plan tasks after seeding only 4 tasks.
- Added `home-query` isolation fixture before implementation.
  - Command: `pnpm test:run src/features/home/home-query.test.ts`
  - Result: 1 file, 2 tests, 2 failed.
  - Expected failure: `SchemaError: KeyPath scheduledDate on object store planTasks is not indexed`.

## GREEN

- Fixed period deletion fixture by seeding a month-scope task, preserving coverage that day/week/month tasks do not count as semester-owned tasks.
- Updated `loadHomeSnapshot` to preserve its API while querying `[scope+periodKey] = ["day", today]`.
- Updated home-query tests to use the v5 `PlanTask` shape and assert week/month/semester tasks do not affect today's home snapshot.
- Fixed Task 7 typecheck leftovers:
  - Removed stale `scheduledDate` fields from learning-period test helpers.
  - Typed the empty migration-task query branch as `PlanTask[]`.

## Files

- `docs/superpowers/plans/2026-09-01-velow-independent-plan-workspaces.md`
- `src/features/home/home-query.ts`
- `src/features/home/home-query.test.ts`
- `src/pages/PlansPage.tsx`
- `src/pages/PlansPage.test.tsx`
- `src/features/plans/components/PlanHeader.tsx`
- `src/features/plans/components/PlanHeader.test.tsx`
- `src/features/plans/components/LearningPeriodView.tsx`
- `src/features/plans/components/LearningPeriodView.test.tsx`
- `src/features/plans/components/PlanProgress.tsx`
- `src/features/plans/components/PlanProgress.test.tsx`
- `src/features/plans/domain/learning-periods.ts`
- `src/features/plans/domain/learning-periods.test.ts`
- `src/features/plans/data/learning-period-service.ts`
- `src/features/plans/data/learning-period-service.test.ts`
- `src/features/plans/components/PeriodMigrationPanel.test.tsx`

## Verification

- `pnpm test:run src/features/home/home-query.test.ts`
  - PASS: 1 file, 2 tests.
- `pnpm test:run src/features/home/home-query.test.ts src/pages/PlansPage.test.tsx src/features/plans/components/PlanHeader.test.tsx src/features/plans/components/LearningPeriodView.test.tsx src/features/plans/components/PlanProgress.test.tsx src/features/plans/domain/learning-periods.test.ts src/features/plans/data/learning-period-service.test.ts src/features/plans/components/PeriodMigrationPanel.test.tsx`
  - PASS: 8 files, 35 tests.
- `pnpm typecheck`
  - Initial result: FAIL with stale Task 7 migration types.
  - Final result: PASS.
- `pnpm exec eslint src/features/home/home-query.ts src/features/home/home-query.test.ts src/pages/PlansPage.tsx src/pages/PlansPage.test.tsx src/features/plans/components/PlanHeader.tsx src/features/plans/components/PlanHeader.test.tsx src/features/plans/components/LearningPeriodView.tsx src/features/plans/components/LearningPeriodView.test.tsx src/features/plans/components/PlanProgress.tsx src/features/plans/components/PlanProgress.test.tsx src/features/plans/domain/learning-periods.ts src/features/plans/domain/learning-periods.test.ts src/features/plans/data/learning-period-service.ts src/features/plans/data/learning-period-service.test.ts src/features/plans/components/PeriodMigrationPanel.tsx src/features/plans/components/PeriodMigrationPanel.test.tsx --max-warnings 0`
  - PASS.
- `git diff --check`
  - PASS.

## Residual Issues

- Full `pnpm lint` is blocked outside the amended Task 7 file list:
  - `src/db/velo-db.ts:104:43` `_groupId` assigned but never used.
  - `src/db/velo-db.ts:104:64` `_stepIndex` assigned but never used.
  - `src/db/velo-db.ts:104:91` `_stepTitleMode` assigned but never used.
- No Task 7-scoped lint, typecheck, focused-test, or diff-check residual issue remains.
