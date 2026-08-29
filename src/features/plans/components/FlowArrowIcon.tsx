interface FlowArrowIconProps {
  title?: string
}

export function FlowArrowIcon({ title }: FlowArrowIconProps) {
  return (
    <svg aria-hidden={title ? undefined : true} aria-label={title} fill="none" focusable="false" viewBox="0 0 28 28">
      {title ? <title>{title}</title> : null}
      <path d="M4 14h15.5M14.5 7l7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" />
      <path d="M5 9.5c1.7-2.1 4-3.2 6.7-3.2" opacity=".55" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}
