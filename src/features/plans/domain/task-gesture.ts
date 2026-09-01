export function getSwipeProgress(distance: number, width: number) {
  if (width <= 0) return 0
  return Math.min(1, Math.max(0, distance / width))
}

export function shouldCompleteSwipe(distance: number, width: number, velocity = 0) {
  const progress = getSwipeProgress(distance, width)
  return progress >= 0.45 || (progress >= 0.2 && velocity >= 0.65)
}
