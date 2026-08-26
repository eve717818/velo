import type { ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { getFlowTransition } from "./motion-config"

export function PageTransition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion() ?? false

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={false}
      transition={getFlowTransition(reduced)}
    >
      {children}
    </motion.div>
  )
}
