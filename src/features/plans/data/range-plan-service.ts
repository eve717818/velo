import type { RangePlan, RangePlanKind } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import {
  getRangePlanBounds,
  getRangePlanId,
  normalizeRangePlanInput,
  type RangePlanInput,
  type RangePlanValidation,
  validateRangePlanInput,
} from "../domain/range-plans"

export class RangePlanValidationError extends Error {
  field: Exclude<RangePlanValidation, { ok: true }>["field"]

  constructor(field: Exclude<RangePlanValidation, { ok: true }>["field"], message: string) {
    super(message)
    this.name = "RangePlanValidationError"
    this.field = field
  }
}

export function getRangePlan(
  db: VeloDB,
  kind: RangePlanKind,
  selectedDate: string,
): Promise<RangePlan | undefined> {
  return db.rangePlans.get(getRangePlanId(kind, selectedDate))
}

export async function saveRangePlan(
  db: VeloDB,
  kind: RangePlanKind,
  selectedDate: string,
  input: RangePlanInput,
  now: number,
): Promise<RangePlan> {
  const normalized = normalizeRangePlanInput(input)
  const validation = validateRangePlanInput(normalized)
  if (!validation.ok) {
    throw new RangePlanValidationError(validation.field, validation.message)
  }

  return db.transaction("rw", db.rangePlans, async () => {
    const id = getRangePlanId(kind, selectedDate)
    const existing = await db.rangePlans.get(id)
    const saved: RangePlan = {
      id,
      kind,
      ...getRangePlanBounds(kind, selectedDate),
      ...normalized,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await db.rangePlans.put(saved)
    return saved
  })
}
