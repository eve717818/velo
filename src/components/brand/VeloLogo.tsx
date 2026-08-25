import type { CSSProperties } from "react"

type LogoTone = "default" | "mono" | "reverse"

interface VeloLogoProps {
  compact?: boolean
  tone?: LogoTone
  className?: string
}

type LogoStyle = CSSProperties & Record<"--velo-logo-accent", string>

const toneStyles: Record<LogoTone, LogoStyle> = {
  default: { color: "#11131A", "--velo-logo-accent": "#574FE6" },
  mono: { "--velo-logo-accent": "currentColor" },
  reverse: { color: "#FFFFFF", "--velo-logo-accent": "#DCD9FF" },
}

export function VeloLogo({ compact = false, tone = "default", className }: VeloLogoProps) {
  const svgProps = {
    role: "img",
    "aria-label": "Velo",
    "data-tone": tone,
    className,
    style: toneStyles[tone],
  }

  if (compact) {
    return (
      <svg viewBox="0 0 64 64" {...svgProps}>
        <circle
          cx="32"
          cy="32"
          r="19"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="92 28"
          transform="rotate(-42 32 32)"
        />
        <path
          d="M47 18a22 22 0 0 1 7 14"
          fill="none"
          stroke="var(--velo-logo-accent, currentColor)"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 144 40" {...svgProps}>
      <path d="M4 7h8l10 24L32 7h8L25 35h-6L4 7Z" fill="currentColor" />
      <path
        d="M42 22c0-9 6-15 15-15 9 0 14 7 14 16v3H50c1 4 4 6 9 6 4 0 7-1 10-3v6c-3 2-7 3-11 3-10 0-16-6-16-16Zm8-2h13c0-4-2-7-6-7s-6 3-7 7Z"
        fill="currentColor"
      />
      <path d="M77 3h8v27c0 2 1 3 3 3h2v6h-4c-6 0-9-3-9-9V3Z" fill="currentColor" />
      <circle
        cx="112"
        cy="23"
        r="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="58 18"
        transform="rotate(-42 112 23)"
      />
      <path
        d="M122 13a15 15 0 0 1 5 10"
        fill="none"
        stroke="var(--velo-logo-accent, currentColor)"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  )
}
