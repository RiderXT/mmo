/** Timestamped milestone log + final report generation. Every bot action gets recorded here so
 * the end-of-run report can reconstruct exact timings/costs per level, and flag outliers — the
 * point isn't to guess WHY something was slow, just to surface what stands out so a human can dig
 * in (e.g. "level 12 took 4x the median level time — check the combat log/zone config there"). */

export interface Milestone {
  t: number; // ms since bot start
  wallClock: string; // ISO timestamp
  kind: string;
  detail: string;
  data?: Record<string, unknown>;
}

export interface LevelSpan {
  level: number;
  startedAtMs: number;
  endedAtMs: number | null;
  goldSpent: number;
  goldEarned: number;
  potionsConsumed: number;
  expeditionsRun: number;
  errors: number;
}

export class BotReport {
  readonly startedAt = Date.now();
  readonly milestones: Milestone[] = [];
  readonly levelSpans = new Map<number, LevelSpan>();
  totalGoldSpent = 0;
  totalGoldEarned = 0;
  totalPotionsConsumed = 0;
  totalUpgradeAttempts = 0;
  totalUpgradeSuccesses = 0;
  totalErrors = 0;

  constructor(
    public readonly botName: string,
    public readonly className: string,
  ) {}

  private now() {
    return Date.now() - this.startedAt;
  }

  log(kind: string, detail: string, data?: Record<string, unknown>) {
    this.milestones.push({ t: this.now(), wallClock: new Date().toISOString(), kind, detail, data });
    // eslint-disable-next-line no-console
    console.log(`[+${(this.now() / 1000).toFixed(1)}s] ${kind}: ${detail}`);
  }

  enterLevel(level: number) {
    if (!this.levelSpans.has(level)) {
      this.levelSpans.set(level, {
        level,
        startedAtMs: this.now(),
        endedAtMs: null,
        goldSpent: 0,
        goldEarned: 0,
        potionsConsumed: 0,
        expeditionsRun: 0,
        errors: 0,
      });
    }
  }

  leaveLevel(level: number) {
    const span = this.levelSpans.get(level);
    if (span && span.endedAtMs === null) span.endedAtMs = this.now();
  }

  private currentSpan(level: number): LevelSpan {
    this.enterLevel(level);
    return this.levelSpans.get(level)!;
  }

  recordGoldSpent(level: number, amount: number) {
    this.currentSpan(level).goldSpent += amount;
    this.totalGoldSpent += amount;
  }

  recordGoldEarned(level: number, amount: number) {
    this.currentSpan(level).goldEarned += amount;
    this.totalGoldEarned += amount;
  }

  recordPotionsConsumed(level: number, count: number) {
    this.currentSpan(level).potionsConsumed += count;
    this.totalPotionsConsumed += count;
  }

  recordExpedition(level: number) {
    this.currentSpan(level).expeditionsRun += 1;
  }

  recordUpgradeAttempt(success: boolean) {
    this.totalUpgradeAttempts += 1;
    if (success) this.totalUpgradeSuccesses += 1;
  }

  recordError(level: number, detail: string, data?: Record<string, unknown>) {
    this.currentSpan(level).errors += 1;
    this.totalErrors += 1;
    this.log("error", detail, data);
  }

  /** Wall-clock duration (ms) of each completed level span — used to flag outliers. */
  private levelDurations(): { level: number; ms: number }[] {
    return Array.from(this.levelSpans.values())
      .filter((s) => s.endedAtMs !== null)
      .map((s) => ({ level: s.level, ms: s.endedAtMs! - s.startedAtMs }));
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  private fmtDuration(ms: number): string {
    const totalSeconds = Math.round(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}min ${s}s`;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
  }

  toMarkdown(): string {
    const totalMs = this.now();
    const durations = this.levelDurations();
    const median = this.median(durations.map((d) => d.ms));
    // Outlier = more than 2x the median level duration — only meaningful once we have a few
    // completed levels to compare against, otherwise every level trivially "looks like" 100% of
    // a median of one sample.
    const outliers = durations.length >= 3 ? durations.filter((d) => median > 0 && d.ms > median * 2) : [];

    const lines: string[] = [];
    lines.push(`# Raport bota: ${this.botName} (${this.className})`);
    lines.push("");
    lines.push(`- Całkowity czas: ${this.fmtDuration(totalMs)}`);
    lines.push(`- Złoto zarobione / wydane: ${this.totalGoldEarned} / ${this.totalGoldSpent}`);
    lines.push(`- Mikstury zużyte: ${this.totalPotionsConsumed}`);
    lines.push(`- Próby ulepszeń: ${this.totalUpgradeAttempts} (sukces: ${this.totalUpgradeSuccesses})`);
    lines.push(`- Błędy napotkane: ${this.totalErrors}`);
    lines.push("");
    lines.push("## Czas per poziom");
    lines.push("");
    lines.push("| Poziom | Czas | Ekspedycje | Złoto +/− | Mikstury | Błędy |");
    lines.push("|---|---|---|---|---|---|");
    for (const span of Array.from(this.levelSpans.values()).sort((a, b) => a.level - b.level)) {
      const duration = span.endedAtMs !== null ? this.fmtDuration(span.endedAtMs - span.startedAtMs) : "(w toku)";
      lines.push(
        `| ${span.level} | ${duration} | ${span.expeditionsRun} | +${span.goldEarned} / -${span.goldSpent} | ${span.potionsConsumed} | ${span.errors} |`,
      );
    }
    lines.push("");
    if (outliers.length > 0) {
      lines.push("## Anomalie (poziom trwał >2x medianę)");
      lines.push("");
      for (const o of outliers) {
        lines.push(`- Poziom ${o.level}: ${this.fmtDuration(o.ms)} (mediana: ${this.fmtDuration(median)})`);
      }
      lines.push("");
    }
    lines.push("## Pełny dziennik zdarzeń");
    lines.push("");
    for (const m of this.milestones) {
      lines.push(`- [+${(m.t / 1000).toFixed(1)}s] **${m.kind}** — ${m.detail}`);
    }
    return lines.join("\n");
  }

  toJson() {
    return {
      botName: this.botName,
      className: this.className,
      totalMs: this.now(),
      totalGoldEarned: this.totalGoldEarned,
      totalGoldSpent: this.totalGoldSpent,
      totalPotionsConsumed: this.totalPotionsConsumed,
      totalUpgradeAttempts: this.totalUpgradeAttempts,
      totalUpgradeSuccesses: this.totalUpgradeSuccesses,
      totalErrors: this.totalErrors,
      levelSpans: Array.from(this.levelSpans.values()),
      milestones: this.milestones,
    };
  }
}
