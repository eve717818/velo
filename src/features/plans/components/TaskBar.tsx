import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react"

import type { PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { movePlanTask, setTaskCompletion } from "@/features/plans/data/plan-task-service"
import { readTaskDropTarget, type TaskDropTarget } from "@/features/plans/domain/task-drop"
import { getSwipeProgress, shouldCompleteSwipe } from "@/features/plans/domain/task-gesture"

import { FlowArrowIcon } from "./FlowArrowIcon"
import { TaskDragLayer } from "./TaskDragLayer"
import { UndoNotice } from "./UndoNotice"
import { PlanErrorState } from "./PlanErrorState"
import styles from "./TaskBar.module.css"
import { useRequestSession } from "./useRequestSession"

interface TaskBarProps {
  db: VeloDB
  onOpen?: (task: PlanTask, trigger: HTMLButtonElement) => void
  task: PlanTask
}

export function TaskBar({ db, onOpen, task }: TaskBarProps) {
  const sessionKey = `${task.id}-${task.updatedAt}`

  return <TaskBarSession db={db} key={sessionKey} onOpen={onOpen} task={task} />
}

function TaskBarSession({ db, onOpen, task }: TaskBarProps) {
  const [completionOverride, setCompletionOverride] = useState<boolean | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showUndo, setShowUndo] = useState(false)
  const [swipeProgress, setSwipeProgress] = useState(0)
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null)
  const [undoMessage, setUndoMessage] = useState("任务已完成")
  const [undoAction, setUndoAction] = useState<(() => void) | null>(null)
  const [writeError, setWriteError] = useState<{ message: string; retry: () => void } | null>(null)
  const activePointerId = useRef<number | null>(null)
  const dragActive = useRef(false)
  const verticalScrollCancelled = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(false)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSession = useRequestSession()

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (undoTimer.current) clearTimeout(undoTimer.current)
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
      undoTimer.current = null
      longPressTimer.current = null
    }
  }, [])

  function clearUndoTimer() {
    if (!undoTimer.current) return
    clearTimeout(undoTimer.current)
    undoTimer.current = null
  }

  function showUndoWindow(message: string, onUndo: () => void) {
    if (!mounted.current) return
    clearUndoTimer()
    setUndoMessage(message)
    setUndoAction(() => onUndo)
    setShowUndo(true)
    undoTimer.current = setTimeout(() => {
      undoTimer.current = null
      if (mounted.current) setShowUndo(false)
    }, 5_000)
  }

  async function changeCompletion(nextValue: boolean) {
    const isCompleted = completionOverride ?? task.isCompleted === 1
    if (isSaving || (nextValue && isCompleted)) return

    const requestToken = requestSession.beginRequest()
    setIsSaving(true)
    setWriteError(null)
    setCompletionOverride(nextValue)
    try {
      await setTaskCompletion(db, task.id, nextValue, Date.now())
      if (!mounted.current || !requestSession.isCurrent(requestToken)) return
      if (nextValue) showUndoWindow("任务已完成", () => void changeCompletion(false))
      else setShowUndo(false)
    } catch (error) {
      if (mounted.current && requestSession.isCurrent(requestToken)) {
        setCompletionOverride(null)
        setWriteError({
          message: error instanceof Error ? error.message : "更新任务失败",
          retry: () => { void changeCompletion(nextValue) },
        })
      }
    } finally {
      if (mounted.current && requestSession.isCurrent(requestToken)) setIsSaving(false)
    }
  }

  function getBarWidth(element: HTMLButtonElement) {
    return element.offsetWidth || element.getBoundingClientRect().width
  }

  function clearLongPressTimer() {
    if (!longPressTimer.current) return
    clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }

  function resetPointer(pointerId?: number) {
    if (pointerId !== undefined && pointerId !== activePointerId.current) return
    clearLongPressTimer()
    activePointerId.current = null
    startX.current = null
    startY.current = null
    dragActive.current = false
    verticalScrollCancelled.current = false
    setSwipeProgress(0)
    setDragPosition(null)
  }

  function releasePointerCapture(element: HTMLButtonElement, pointerId: number) {
    element.releasePointerCapture?.(pointerId)
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (activePointerId.current !== null || isCompleted || isSaving) return
    activePointerId.current = event.pointerId
    verticalScrollCancelled.current = false
    startX.current = event.clientX
    startY.current = event.clientY
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const { clientX, clientY, pointerId } = event
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      if (!mounted.current || activePointerId.current !== pointerId || startX.current === null || startY.current === null) return
      dragActive.current = true
      suppressClick.current = true
      setSwipeProgress(0)
      setDragPosition({ x: clientX, y: clientY })
    }, 350)
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerId !== activePointerId.current || startX.current === null || startY.current === null) return
    const distance = event.clientX - startX.current
    const verticalDistance = event.clientY - startY.current
    if (Math.abs(verticalDistance) > 8) {
      verticalScrollCancelled.current = true
      dragActive.current = false
      clearLongPressTimer()
      setSwipeProgress(0)
      setDragPosition(null)
      return
    }

    if (verticalScrollCancelled.current) return
    if (dragActive.current) {
      setDragPosition({ x: event.clientX, y: event.clientY })
      return
    }

    if (Math.abs(distance) > 8) clearLongPressTimer()
    setSwipeProgress(getSwipeProgress(distance, getBarWidth(event.currentTarget)))
  }

  async function moveTask(target: TaskDropTarget) {
    if (isSaving) return
    const previous = {
      scheduledDate: task.scheduledDate,
      startMinutes: task.startMinutes,
      order: task.order,
    }

    const requestToken = requestSession.beginRequest()
    setIsSaving(true)
    setWriteError(null)
    try {
      await movePlanTask(db, task.id, target, Date.now())
      if (!mounted.current || !requestSession.isCurrent(requestToken)) return
      showUndoWindow("已移动到目标位置", () => void restoreTaskPosition(previous))
    } catch (error) {
      if (mounted.current && requestSession.isCurrent(requestToken)) {
        setWriteError({
          message: error instanceof Error ? error.message : "移动任务失败",
          retry: () => { void moveTask(target) },
        })
      }
    } finally {
      if (mounted.current && requestSession.isCurrent(requestToken)) setIsSaving(false)
    }
  }

  async function restoreTaskPosition(previous: { scheduledDate: string; startMinutes: number | undefined; order: number }) {
    if (isSaving) return
    const requestToken = requestSession.beginRequest()
    setIsSaving(true)
    setWriteError(null)
    try {
      await movePlanTask(db, task.id, previous, Date.now())
      if (mounted.current && requestSession.isCurrent(requestToken)) setShowUndo(false)
    } catch (error) {
      if (mounted.current && requestSession.isCurrent(requestToken)) {
        setWriteError({
          message: error instanceof Error ? error.message : "恢复任务位置失败",
          retry: () => { void restoreTaskPosition(previous) },
        })
      }
    } finally {
      if (mounted.current && requestSession.isCurrent(requestToken)) setIsSaving(false)
    }
  }

  function handlePointerRelease(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerId !== activePointerId.current || startX.current === null) return
    if (startY.current !== null && Math.abs(event.clientY - startY.current) > 8) {
      verticalScrollCancelled.current = true
      dragActive.current = false
      clearLongPressTimer()
      setSwipeProgress(0)
      setDragPosition(null)
    }
    if (verticalScrollCancelled.current) {
      suppressClick.current = true
      releasePointerCapture(event.currentTarget, event.pointerId)
      resetPointer(event.pointerId)
      return
    }

    if (dragActive.current) {
      const pointedElement = document.elementFromPoint?.(event.clientX, event.clientY)
      const target = pointedElement instanceof HTMLElement ? readTaskDropTarget(pointedElement) : null
      releasePointerCapture(event.currentTarget, event.pointerId)
      resetPointer(event.pointerId)
      if (target) void moveTask(target)
      return
    }

    const distance = event.clientX - startX.current
    const width = getBarWidth(event.currentTarget)
    suppressClick.current = Math.abs(distance) > 4
    resetPointer(event.pointerId)
    releasePointerCapture(event.currentTarget, event.pointerId)

    if (shouldCompleteSwipe(distance, width)) void changeCompletion(true)
  }

  function handlePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    resetPointer(event.pointerId)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    void changeCompletion(true)
  }

  const isCompleted = completionOverride ?? task.isCompleted === 1
  const className = [
    styles.taskBar,
    isCompleted ? styles.completed : "",
    swipeProgress > 0 ? styles.swiping : "",
  ].filter(Boolean).join(" ")
  const style = {
    "--swipe-offset": `${Math.round(swipeProgress * 24)}px`,
    "--swipe-progress": String(swipeProgress),
  } as CSSProperties

  return (
    <div className={styles.taskBarGroup}>
      <button
        aria-label={isCompleted ? `已完成：${task.title}` : `打开任务操作：${task.title}`}
        className={className}
        onClick={(event) => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          onOpen?.(task, event.currentTarget)
        }}
        onKeyDown={handleKeyDown}
        onLostPointerCapture={handlePointerCancel}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerRelease}
        style={style}
        type="button"
      >
        <span aria-hidden="true" className={styles.completionFill} />
        {swipeProgress > 0 ? <FlowArrowIcon /> : null}
        <span className={styles.copy}>
          <span className={styles.taskTitle}>{task.title}</span>
          <span className={styles.taskMeta}>{task.subject ?? "未分类"} · {task.estimatedMinutes ? `${task.estimatedMinutes} 分钟` : "未估时"}</span>
        </span>
        <span className={styles.trailing}>{isCompleted ? "已完成" : task.startMinutes === undefined ? "未定时" : `${String(Math.floor(task.startMinutes / 60)).padStart(2, "0")}:${String(task.startMinutes % 60).padStart(2, "0")}`}</span>
      </button>
      {dragPosition ? <TaskDragLayer task={task} x={dragPosition.x} y={dragPosition.y} /> : null}
      {showUndo ? <UndoNotice message={undoMessage} onUndo={() => undoAction?.()} /> : null}
      {writeError ? <PlanErrorState error={writeError.message} onRetry={writeError.retry} /> : null}
    </div>
  )
}
