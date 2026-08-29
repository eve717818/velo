import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react"

import type { PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { setTaskCompletion } from "@/features/plans/data/plan-task-service"
import { getSwipeProgress, shouldCompleteSwipe } from "@/features/plans/domain/task-gesture"

import { FlowArrowIcon } from "./FlowArrowIcon"
import { UndoNotice } from "./UndoNotice"
import styles from "./TaskBar.module.css"

interface TaskBarProps {
  db: VeloDB
  onOpen?: (task: PlanTask, trigger: HTMLButtonElement) => void
  task: PlanTask
}

export function TaskBar({ db, onOpen, task }: TaskBarProps) {
  const [completionOverride, setCompletionOverride] = useState<boolean | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showUndo, setShowUndo] = useState(false)
  const [swipeProgress, setSwipeProgress] = useState(0)
  const startX = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
  }, [])

  function clearUndoTimer() {
    if (!undoTimer.current) return
    clearTimeout(undoTimer.current)
    undoTimer.current = null
  }

  function showUndoWindow() {
    clearUndoTimer()
    setShowUndo(true)
    undoTimer.current = setTimeout(() => setShowUndo(false), 5_000)
  }

  async function changeCompletion(nextValue: boolean) {
    const isCompleted = completionOverride ?? task.isCompleted === 1
    if (isSaving || (nextValue && isCompleted)) return

    setIsSaving(true)
    setCompletionOverride(nextValue)
    try {
      await setTaskCompletion(db, task.id, nextValue, Date.now())
      if (nextValue) showUndoWindow()
      else setShowUndo(false)
    } catch {
      setCompletionOverride(null)
    } finally {
      setIsSaving(false)
    }
  }

  function getBarWidth(element: HTMLButtonElement) {
    return element.offsetWidth || element.getBoundingClientRect().width
  }

  function resetSwipe() {
    startX.current = null
    setSwipeProgress(0)
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (isCompleted || isSaving) return
    startX.current = event.clientX
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (startX.current === null) return
    const distance = event.clientX - startX.current
    setSwipeProgress(getSwipeProgress(distance, getBarWidth(event.currentTarget)))
  }

  function handlePointerRelease(event: PointerEvent<HTMLButtonElement>) {
    if (startX.current === null) return
    const distance = event.clientX - startX.current
    const width = getBarWidth(event.currentTarget)
    suppressClick.current = Math.abs(distance) > 4
    resetSwipe()
    event.currentTarget.releasePointerCapture?.(event.pointerId)

    if (shouldCompleteSwipe(distance, width)) void changeCompletion(true)
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
        onPointerCancel={resetSwipe}
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
      {showUndo ? <UndoNotice onUndo={() => void changeCompletion(false)} /> : null}
    </div>
  )
}
