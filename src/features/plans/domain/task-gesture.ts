export function getSwipeProgress(distance: number, width: number) {
  if (width <= 0) return 0
  return Math.min(1, Math.max(0, distance / width))
}

export function shouldCompleteSwipe(distance: number, width: number) {
  return getSwipeProgress(distance, width) >= 0.7
}
