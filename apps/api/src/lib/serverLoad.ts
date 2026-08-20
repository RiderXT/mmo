import os from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";

/** Derives a stable "module" key from a request URL for load attribution — the first path
 * segment, except admin routes (which fan out into ~15 sub-areas) where the first TWO segments
 * are kept so "which admin screen is expensive" stays visible instead of every admin action
 * collapsing into one bucket. Query string stripped, ids/uuids not attempted to be stripped
 * (route-level grouping is coarse by design — see ModuleStats below for the per-route detail). */
export function moduleForPath(url: string): string {
  const path = url.split("?")[0]!;
  const segments = path.split("/").filter(Boolean); // ["api", "expeditions", "start"]
  if (segments[0] !== "api" || segments.length < 2) return "other";
  if (segments[1] === "admin" && segments.length >= 3) return `admin/${segments[2]}`;
  return segments[1]!;
}

interface RouteStats {
  count: number;
  totalMs: number;
  maxMs: number;
  errorCount: number; // status >= 400
}

interface MinuteBucket {
  minuteStartMs: number;
  count: number;
  totalMs: number;
  errorCount: number;
}

const MAX_TIMELINE_MINUTES = 120;
const SYSTEM_SAMPLE_INTERVAL_MS = 5000;
const MAX_SYSTEM_SAMPLES = 240; // 20 minutes at 5s resolution

interface SystemSample {
  t: number; // epoch ms
  // This process only — the app's own footprint, independent of anything else on the VPS.
  rssMb: number;
  heapUsedMb: number;
  eventLoopDelayP50Ms: number;
  eventLoopDelayP99Ms: number;
  processCpuPercent: number; // this process's CPU usage since the previous sample, as % of one core
  // Whole machine — includes every other process on the VPS, not just this app. Comparing this
  // against the process-only figures above is exactly how to tell "my app is the bottleneck" from
  // "something else on this VPS is" (see the admin panel's "Serwer" tab).
  systemLoadavg1m: number;
  systemFreeMemPercent: number;
}

/** In-memory server load tracker — per-module request stats (all-time + a rolling per-minute
 * timeline) plus periodic process/system resource samples. Deliberately not persisted to the DB:
 * this is operational telemetry for "what's slow right now / over the last couple hours", not
 * game data, and a restart legitimately resetting it is fine (matches how e.g. Node's own process
 * uptime resets on restart). */
class ServerLoadTracker {
  private byModule = new Map<string, RouteStats>();
  private timelineByModule = new Map<string, MinuteBucket[]>();
  private systemSamples: SystemSample[] = [];
  private eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
  private lastCpuUsage = process.cpuUsage();
  private lastCpuSampleAt = Date.now();

  constructor() {
    this.eventLoopMonitor.enable();
    setInterval(() => this.sampleSystem(), SYSTEM_SAMPLE_INTERVAL_MS).unref();
  }

  recordRequest(module: string, durationMs: number, statusCode: number) {
    const stats = this.byModule.get(module) ?? { count: 0, totalMs: 0, maxMs: 0, errorCount: 0 };
    stats.count += 1;
    stats.totalMs += durationMs;
    stats.maxMs = Math.max(stats.maxMs, durationMs);
    if (statusCode >= 400) stats.errorCount += 1;
    this.byModule.set(module, stats);

    const minuteStartMs = Math.floor(Date.now() / 60_000) * 60_000;
    const timeline = this.timelineByModule.get(module) ?? [];
    const last = timeline[timeline.length - 1];
    if (last && last.minuteStartMs === minuteStartMs) {
      last.count += 1;
      last.totalMs += durationMs;
      if (statusCode >= 400) last.errorCount += 1;
    } else {
      timeline.push({ minuteStartMs, count: 1, totalMs: durationMs, errorCount: statusCode >= 400 ? 1 : 0 });
      while (timeline.length > MAX_TIMELINE_MINUTES) timeline.shift();
    }
    this.timelineByModule.set(module, timeline);
  }

  private sampleSystem() {
    const now = Date.now();
    const elapsedMs = now - this.lastCpuSampleAt;
    const cpuUsage = process.cpuUsage();
    const cpuDeltaMicros = cpuUsage.user - this.lastCpuUsage.user + (cpuUsage.system - this.lastCpuUsage.system);
    // % of a single core consumed since the last sample — 100% means this process kept one whole
    // core busy the entire interval, matching how top/htop report per-process CPU.
    const processCpuPercent = elapsedMs > 0 ? Math.min(100, (cpuDeltaMicros / 1000 / elapsedMs) * 100) : 0;
    this.lastCpuUsage = cpuUsage;
    this.lastCpuSampleAt = now;

    const mem = process.memoryUsage();
    const eld = this.eventLoopMonitor;
    this.systemSamples.push({
      t: now,
      rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      eventLoopDelayP50Ms: Math.round((eld.percentile(50) / 1e6) * 10) / 10,
      eventLoopDelayP99Ms: Math.round((eld.percentile(99) / 1e6) * 10) / 10,
      processCpuPercent: Math.round(processCpuPercent * 10) / 10,
      systemLoadavg1m: Math.round(os.loadavg()[0] * 100) / 100,
      systemFreeMemPercent: Math.round((os.freemem() / os.totalmem()) * 1000) / 10,
    });
    eld.reset();
    while (this.systemSamples.length > MAX_SYSTEM_SAMPLES) this.systemSamples.shift();
  }

  getSnapshot() {
    const modules = Array.from(this.byModule.entries())
      .map(([module, stats]) => ({
        module,
        count: stats.count,
        avgMs: stats.count > 0 ? Math.round((stats.totalMs / stats.count) * 10) / 10 : 0,
        maxMs: Math.round(stats.maxMs * 10) / 10,
        errorCount: stats.errorCount,
        errorRatePct: stats.count > 0 ? Math.round((stats.errorCount / stats.count) * 1000) / 10 : 0,
        // Total time this module has kept the event loop/DB busy, cumulatively — the single best
        // "which module is the biggest overall contributor to load" ranking metric (a module
        // called rarely but slowly and one called constantly but fast can have the same total).
        totalMs: Math.round(stats.totalMs),
      }))
      .sort((a, b) => b.totalMs - a.totalMs);

    const timelineByModule: Record<string, MinuteBucket[]> = {};
    for (const [module, buckets] of this.timelineByModule.entries()) timelineByModule[module] = buckets;

    return {
      modules,
      timelineByModule,
      systemSamples: this.systemSamples,
      latest: this.systemSamples[this.systemSamples.length - 1] ?? null,
      cpuCount: os.cpus().length,
      processUptimeSeconds: Math.round(process.uptime()),
    };
  }

  reset() {
    this.byModule.clear();
    this.timelineByModule.clear();
  }
}

export const serverLoadTracker = new ServerLoadTracker();
