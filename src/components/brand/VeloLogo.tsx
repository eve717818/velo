import styles from "./VeloLogo.module.css"

type LogoTone = "default" | "mono" | "reverse"

interface VeloLogoProps {
  compact?: boolean
  tone?: LogoTone
  className?: string
}

export function VeloLogo({ compact = false, tone = "default", className }: VeloLogoProps) {
  const classes = [styles.logo, compact ? styles.compact : "", className].filter(Boolean).join(" ")
  const markSource = tone === "reverse" ? "/brand/velo-mark-reverse.svg" : "/brand/velo-mark.svg"

  return (
    <span
      aria-label="Velo"
      className={classes}
      data-tone={tone}
      data-wordmark-font="Outfit"
      role="img"
    >
      <img alt="" aria-hidden="true" className={styles.mark} src={markSource} />
      {compact ? null : (
        <span aria-hidden="true" className={styles.wordmark}>
          <span data-letter="V">V</span>
          <span className={styles.letterE} data-letter="e">e</span>
          <span className={styles.letterL} data-letter="l">l</span>
          <span className={styles.letterO} data-letter="o">o</span>
        </span>
      )}
    </span>
  )
}
