import styles from "./VeloLogo.module.css"

type LogoTone = "default" | "mono" | "reverse"
type LogoLayout = "horizontal" | "vertical"

interface VeloLogoProps {
  animated?: boolean
  compact?: boolean
  layout?: LogoLayout
  tone?: LogoTone
  className?: string
}

export function VeloLogo({
  animated = false,
  compact = false,
  layout = "horizontal",
  tone = "default",
  className,
}: VeloLogoProps) {
  const resolvedLayout = compact ? "mark" : layout
  const classes = [styles.logo, styles[resolvedLayout], className].filter(Boolean).join(" ")

  return (
    <span
      aria-label="Velow Notebook"
      className={classes}
      data-animated={animated}
      data-logo-layout={resolvedLayout}
      data-tone={tone}
      data-wordmark-font="Outfit"
      role="img"
    >
      {resolvedLayout === "horizontal" ? (
        <img alt="" aria-hidden="true" className={styles.horizontalAsset} src="/brand/velow-lockup-horizontal.png" />
      ) : null}
      {resolvedLayout === "vertical" ? (
        <>
          <span aria-hidden="true" className={styles.markLayers}>
            <img alt="" className={styles.markBase} src="/brand/velow-mark-base.png" />
            <img alt="" className={styles.markCurve} src="/brand/velow-mark-curve.png" />
          </span>
          <img alt="" aria-hidden="true" className={styles.verticalWordmark} src="/brand/velow-wordmark-vertical.png" />
        </>
      ) : null}
      {resolvedLayout === "mark" ? (
        <img alt="" aria-hidden="true" className={styles.markAsset} src="/brand/velow-mark.png" />
      ) : null}
    </span>
  )
}
