/** Generic width%-driven progress bar (blue "bg-mp"/"from-mp to-mp-bright" by default, same
 * token used by the exp bar in AppShell.tsx) — extracted from PlayerVitalsBar's private VitalBar
 * so other timed-countdown UI (e.g. the gathering panel) can reuse the exact same bar. */
export function ProgressBar({
  pct,
  barClassName = "bg-mp",
  trackClassName = "",
}: {
  pct: number;
  barClassName?: string;
  trackClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={`h-2.5 overflow-hidden bg-panel-raised ${trackClassName}`}>
      <div className={`h-full transition-all ${barClassName}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
