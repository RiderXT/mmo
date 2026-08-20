import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getServerLoad,
  resetServerLoad,
  launchBots,
  listBotRuns,
  getBotLog,
  stopBot,
  listClasses,
  type BotRunDto,
} from "../../lib/adminApi";
import { ApiError } from "../../lib/apiClient";
import { Field, inputClass } from "../../components/admin/Field";

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ status }: { status: BotRunDto["status"] }) {
  const label = { running: "Działa", completed: "Zakończony", failed: "Błąd", stopped: "Zatrzymany" }[status];
  const cls = {
    running: "border-gold/50 bg-gold/10 text-gold-bright",
    completed: "border-rarity-uncommon/50 bg-rarity-uncommon/10 text-rarity-uncommon",
    failed: "border-red-500/50 bg-red-500/10 text-red-400",
    stopped: "border-line-soft bg-panel-raised text-parchment-dim",
  }[status];
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export function ServerAdminPage() {
  const queryClient = useQueryClient();
  const [expandedBotId, setExpandedBotId] = useState<string | null>(null);
  const [expandedErrorsModule, setExpandedErrorsModule] = useState<string | null>(null);
  const [form, setForm] = useState({ count: 1, className: "", targetLevel: 10, maxMinutes: 60 });
  const [launchError, setLaunchError] = useState<string | null>(null);

  const loadQuery = useQuery({
    queryKey: ["admin-server-load"],
    queryFn: getServerLoad,
    refetchInterval: 5000,
  });
  const botsQuery = useQuery({
    queryKey: ["admin-bot-runs"],
    queryFn: listBotRuns,
    refetchInterval: 3000,
  });
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
  const logQuery = useQuery({
    queryKey: ["admin-bot-log", expandedBotId],
    queryFn: () => getBotLog(expandedBotId!),
    enabled: !!expandedBotId,
    refetchInterval: 2000,
  });

  const resetMutation = useMutation({
    mutationFn: resetServerLoad,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-server-load"] }),
  });

  const launchMutation = useMutation({
    mutationFn: () => launchBots(form),
    onSuccess: () => {
      setLaunchError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-bot-runs"] });
    },
    onError: (err) => setLaunchError(err instanceof ApiError ? err.message : "Nie udało się uruchomić botów"),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => stopBot(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-bot-runs"] }),
  });

  const load = loadQuery.data;
  const bots = botsQuery.data ?? [];
  const runningCount = bots.filter((b) => b.status === "running").length;
  const classOptions = classesQuery.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-parchment">Serwer</h1>
        <p className="mt-1 text-sm text-parchment-dim">
          Obciążenie per moduł, kondycja procesu API vs cały VPS, i boty do testów obciążeniowych.
          Liczniki żyją w pamięci procesu — restart API je zeruje.
        </p>
      </div>

      {/* Proces vs system */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-parchment">Proces API vs cały VPS</h2>
        <p className="mb-2 text-xs text-parchment-faint">
          Lewa kolumna to WYŁĄCZNIE ten proces Node (ta gra) — prawa to CAŁA maszyna, łącznie z
          czymkolwiek innym tam działającym. Jeśli obciążenie systemu jest wysokie, a proces API
          ma niskie CPU/event-loop-delay, problem leży poza tą aplikacją.
        </p>
        {load?.latest ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="panel p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gold">Ten proces (API)</p>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-parchment-dim">CPU (od ost. próbki)</dt>
                  <dd className="tabular-nums text-parchment">{load.latest.processCpuPercent}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-parchment-dim">Event-loop delay p50 / p99</dt>
                  <dd className="tabular-nums text-parchment">
                    {load.latest.eventLoopDelayP50Ms}ms / {load.latest.eventLoopDelayP99Ms}ms
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-parchment-dim">Pamięć (RSS / heap)</dt>
                  <dd className="tabular-nums text-parchment">
                    {load.latest.rssMb}MB / {load.latest.heapUsedMb}MB
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-parchment-dim">Uptime procesu</dt>
                  <dd className="tabular-nums text-parchment">{Math.round(load.processUptimeSeconds / 60)} min</dd>
                </div>
              </dl>
            </div>
            <div className="panel p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gold">Cały VPS</p>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-parchment-dim">Obciążenie (1 min)</dt>
                  <dd className="tabular-nums text-parchment">
                    {load.latest.systemLoadavg1m} / {load.cpuCount} rdzeni
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-parchment-dim">Wolna pamięć</dt>
                  <dd className="tabular-nums text-parchment">{load.latest.systemFreeMemPercent}%</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-parchment-faint">
                Obciążenie {">"} liczby rdzeni = system kolejkuje pracę. Jeśli to wysokie, a CPU
                procesu API niskie — winny jest ktoś/coś inny na tym VPS-ie, nie ta gra.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-parchment-faint">Zbieranie pierwszej próbki (do 5s)...</p>
        )}
      </section>

      {/* Per-module load */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-parchment">Obciążenie per moduł</h2>
          <button
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="rounded-md border border-line-soft px-3 py-1 text-xs text-parchment-dim hover:bg-panel-raised disabled:opacity-50"
          >
            Wyzeruj liczniki
          </button>
        </div>
        <p className="mb-2 text-xs text-parchment-faint">
          Posortowane wg łącznego czasu — to najlepsza jedna miara "co realnie najbardziej obciąża
          serwer" (moduł rzadko wołany ale wolny i moduł często wołany ale szybki mogą mieć tę samą
          liczbę żądań, ale bardzo różny łączny wkład).
        </p>
        <div className="overflow-x-auto panel">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-panel text-parchment-dim">
              <tr>
                <th className="px-3 py-2">Moduł</th>
                <th className="px-3 py-2">Żądania</th>
                <th className="px-3 py-2">Śr. czas</th>
                <th className="px-3 py-2">Maks. czas</th>
                <th className="px-3 py-2">Błędy</th>
                <th className="px-3 py-2">Łączny czas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-ink">
              {(load?.modules ?? []).map((m) => {
                const moduleErrors = (load?.recentErrors ?? []).filter((e) => e.module === m.module);
                const isExpanded = expandedErrorsModule === m.module;
                return (
                  <Fragment key={m.module}>
                    <tr>
                      <td className="px-3 py-2 font-mono text-xs text-parchment">{m.module}</td>
                      <td className="px-3 py-2 tabular-nums text-parchment-dim">{m.count}</td>
                      <td className="px-3 py-2 tabular-nums text-parchment-dim">{fmtMs(m.avgMs)}</td>
                      <td className="px-3 py-2 tabular-nums text-parchment-dim">{fmtMs(m.maxMs)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {m.errorCount > 0 ? (
                          <button
                            onClick={() => setExpandedErrorsModule(isExpanded ? null : m.module)}
                            className="text-red-400 underline decoration-dotted hover:text-red-300"
                          >
                            {m.errorCount} ({m.errorRatePct}%)
                          </button>
                        ) : (
                          <span className="text-parchment-dim">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-medium text-gold-bright">{fmtMs(m.totalMs)}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="bg-panel-raised px-3 py-2">
                          <p className="mb-1 text-xs font-medium text-parchment-dim">
                            Ostatnie błędy tego modułu (najnowsze u góry, maks. 300 w pamięci łącznie):
                          </p>
                          <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="text-parchment-faint">
                                <tr>
                                  <th className="py-1 pr-3">Kiedy</th>
                                  <th className="py-1 pr-3">Metoda</th>
                                  <th className="py-1 pr-3">Ścieżka</th>
                                  <th className="py-1 pr-3">Kod</th>
                                  <th className="py-1">Komunikat</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line/50">
                                {moduleErrors.map((e, i) => (
                                  <tr key={i}>
                                    <td className="py-1 pr-3 text-parchment-faint">
                                      {new Date(e.t).toLocaleTimeString()}
                                    </td>
                                    <td className="py-1 pr-3 font-mono text-parchment-dim">{e.method}</td>
                                    <td className="py-1 pr-3 font-mono text-parchment-dim">{e.path}</td>
                                    <td className="py-1 pr-3 text-red-400">{e.statusCode}</td>
                                    <td className="py-1 text-parchment">{e.message ?? "—"}</td>
                                  </tr>
                                ))}
                                {moduleErrors.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="py-2 text-parchment-faint">
                                      Brak szczegółów w buforze (błędy sprzed resetu/startu serwera).
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {(load?.modules ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-parchment-faint">
                    Brak jeszcze żadnych żądań od ostatniego resetu/startu serwera.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bot launcher */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-parchment">Boty (test obciążenia / balansu)</h2>
        <p className="mb-3 text-xs text-parchment-faint">
          Uruchamia prawdziwe boty grające przez to samo API co przeglądarka (patrz
          apps/api/scripts/bot/README.md) — realne obciążenie, nie symulacja. Maks. 20 działających
          naraz.
        </p>
        <div className="panel grid gap-3 p-3 sm:grid-cols-4">
          <Field label="Liczba botów">
            <input
              type="number"
              min={1}
              max={20}
              className={inputClass}
              value={form.count}
              onChange={(e) => setForm({ ...form, count: Number(e.target.value) })}
            />
          </Field>
          <Field label="Klasa">
            <select
              className={inputClass}
              value={form.className}
              onChange={(e) => setForm({ ...form, className: e.target.value })}
            >
              <option value="">— wybierz —</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Docelowy poziom">
            <input
              type="number"
              min={2}
              max={200}
              className={inputClass}
              value={form.targetLevel}
              onChange={(e) => setForm({ ...form, targetLevel: Number(e.target.value) })}
            />
          </Field>
          <Field label="Limit czasu (min)">
            <input
              type="number"
              min={1}
              max={600}
              className={inputClass}
              value={form.maxMinutes}
              onChange={(e) => setForm({ ...form, maxMinutes: Number(e.target.value) })}
            />
          </Field>
        </div>
        <button
          onClick={() => launchMutation.mutate()}
          disabled={launchMutation.isPending || !form.className}
          className="mt-3 rounded-md bg-gold px-4 py-2 text-sm font-bold text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {launchMutation.isPending ? "Uruchamianie..." : `Uruchom ${form.count > 1 ? `${form.count} botów` : "bota"}`}
        </button>
        {launchError && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {launchError}
          </p>
        )}
        <p className="mt-2 text-xs text-parchment-faint">Aktualnie działa: {runningCount}</p>

        <div className="mt-4 overflow-x-auto panel">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-panel text-parchment-dim">
              <tr>
                <th className="px-3 py-2">Bot</th>
                <th className="px-3 py-2">Klasa</th>
                <th className="px-3 py-2">Cel</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-ink">
              {bots.map((bot) => (
                <Fragment key={bot.id}>
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs text-parchment">{bot.name}</td>
                    <td className="px-3 py-2 text-parchment-dim">{bot.className}</td>
                    <td className="px-3 py-2 text-parchment-dim">poz. {bot.targetLevel}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={bot.status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-parchment-faint">
                      {new Date(bot.startedAt).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setExpandedBotId(expandedBotId === bot.id ? null : bot.id)}
                        className="mr-2 text-xs text-gold-bright hover:underline"
                      >
                        {expandedBotId === bot.id ? "Ukryj log" : "Pokaż log"}
                      </button>
                      {bot.status === "running" && (
                        <button
                          onClick={() => stopMutation.mutate(bot.id)}
                          disabled={stopMutation.isPending}
                          className="text-xs text-red-400 hover:underline disabled:opacity-50"
                        >
                          Zatrzymaj
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedBotId === bot.id && (
                    <tr>
                      <td colSpan={6} className="bg-panel-raised px-3 py-2">
                        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-parchment-dim">
                          {(logQuery.data?.logLines ?? []).join("\n") || "Brak logów jeszcze."}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {bots.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-parchment-faint">
                    Żaden bot jeszcze nie był uruchamiany w tej sesji serwera.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
