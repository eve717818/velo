import type { Transition } from "motion/react"

export function getFlowTransition(reduced: boolean): Transition {
  return reduced ? { duration: 0 } : { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }
}
