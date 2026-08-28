import type { LearningPeriod } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import {
  type LearningPeriodInput,
  type PeriodValidation,
  countTasksInPeriod,
  validateLearningPeriod,
} from "../domain/learning-periods"

export class LearningPeriodValidationError extends Error {
  field: Exclude<PeriodValidation, { ok: true }>["field"]

  constructor(field: Exclude<PeriodValidation, { ok: true }>["field"], message: string) {
    super(message)
    this.name = "LearningPeriodValidationError"
    this.field = field
  }
}

function normalizeLearningPeriodInput(input: LearningPeriodInput): LearningPeriodInput {
  return {
    kind: input.kind,
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    goal: input.goal?.trim() || undefined,
  }
}

function assertValidLearningPeriod(candidate: LearningPeriodInput & Partial<Pick<LearningPeriod, "id">>, periods: LearningPeriod[]) {
  const validation = validateLearningPeriod(candidate, periods)
  if (!validation.ok) {
    throw new LearningPeriodValidationError(validation.field, validation.message)
  }
}

export async function createLearningPeriod(db: VeloDB, input: LearningPeriodInput, now: number): Promise<LearningPeriod> {
  const normalized = normalizeLearningPeriodInput(input)

  return db.transaction("rw", db.learningPeriods, async () => {
    const periods = await db.learningPeriods.toArray()
    assertValidLearningPeriod(normalized, periods)

    const created: LearningPeriod = {
      id: crypto.randomUUID(),
      ...normalized,
      createdAt: now,
      updatedAt: now,
    }

    await db.learningPeriods.add(created)
    return created
  })
}

export async function updateLearningPeriod(
  db: VeloDB,
  id: string,
  input: LearningPeriodInput,
  now: number,
): Promise<LearningPeriod> {
  const normalized = normalizeLearningPeriodInput(input)

  return db.transaction("rw", db.learningPeriods, async () => {
    const existing = await db.learningPeriods.get(id)
    if (!existing) {
      throw new Error("Learning period not found")
    }

    const periods = await db.learningPeriods.toArray()
    assertValidLearningPeriod({ id, ...normalized }, periods)

    const updated: LearningPeriod = {
      ...existing,
      ...normalized,
      id,
      updatedAt: now,
    }

    await db.learningPeriods.put(updated)
    return updated
  })
}

export async function deleteLearningPeriod(db: VeloDB, id: string): Promise<{ affectedTaskCount: number }> {
  return db.transaction("rw", db.learningPeriods, db.planTasks, async () => {
    const existing = await db.learningPeriods.get(id)
    if (!existing) {
      return { affectedTaskCount: 0 }
    }

    const tasks = await db.planTasks.toArray()
    const affectedTaskCount = countTasksInPeriod(tasks, existing)

    await db.learningPeriods.delete(id)

    return { affectedTaskCount }
  })
}
