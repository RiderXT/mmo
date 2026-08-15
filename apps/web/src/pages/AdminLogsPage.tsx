import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { fetchLogs, fetchLogModules, type LogsFilter } from "../lib/logsApi";

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-parchment-dim",
  info: "text-sky-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

export function AdminLogsPage() {
  const [filter, setFilter] = useState<LogsFilter>({ page: 1, pageSize: 25 });

  const modulesQuery = useQuery({ queryKey: ["log-modules"], queryFn: fetchLogModules });
  const logsQuery = useQuery({
    queryKey: ["logs", filter],
    queryFn: () => fetchLogs(filter),
    placeholderData: (prev) => prev,
  });

  function updateFilter(patch: Partial<LogsFilter>) {
    setFilter((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }

  const totalPages = logsQuery.data ? Math.max(1, Math.ceil(logsQuery.data.total / filter.pageSize)) : 1;

  return (
    <AppShell>
      <h1 className="text-lg font-semibold text-parchment">Dziennik zdarzeń (GameLog)</h1>
      <p className="mt-1 text-sm text-parchment-dim">
        Każda akcja w grze jest tu logowana — filtruj po module, poziomie, dacie lub treści, by
        szybko zlokalizować błąd.
      </p>

      <div className="mt-4 flex flex-wrap gap-3 panel p-4">
        <select
          value={filter.module ?? ""}
          onChange={(e) => updateFilter({ module: e.target.value || undefined })}
          className=" border border-line-soft bg-panel-raised px-3 py-1.5 text-sm text-parchment"
        >
          <option value="">Wszystkie moduły</option>
          {modulesQuery.data?.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={filter.level ?? ""}
          onChange={(e) => updateFilter({ level: e.target.value || undefined })}
          className=" border border-line-soft bg-panel-raised px-3 py-1.5 text-sm text-parchment"
        >
          <option value="">Wszystkie poziomy</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>

        <input
          type="text"
          placeholder="Szukaj w akcji/module…"
          value={filter.search ?? ""}
          onChange={(e) => updateFilter({ search: e.target.value || undefined })}
          className="min-w-[180px] flex-1  border border-line-soft bg-panel-raised px-3 py-1.5 text-sm text-parchment"
        />

        <input
          type="datetime-local"
          value={filter.from ? filter.from.slice(0, 16) : ""}
          onChange={(e) =>
            updateFilter({ from: e.target.value ? new Date(e.target.value).toISOString() : undefined })
          }
          className=" border border-line-soft bg-panel-raised px-3 py-1.5 text-sm text-parchment"
        />
        <input
          type="datetime-local"
          value={filter.to ? filter.to.slice(0, 16) : ""}
          onChange={(e) =>
            updateFilter({ to: e.target.value ? new Date(e.target.value).toISOString() : undefined })
          }
          className=" border border-line-soft bg-panel-raised px-3 py-1.5 text-sm text-parchment"
        />
      </div>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Czas</th>
              <th className="px-3 py-2">Moduł</th>
              <th className="px-3 py-2">Poziom</th>
              <th className="px-3 py-2">Akcja</th>
              <th className="px-3 py-2">Aktor</th>
              <th className="px-3 py-2">Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {logsQuery.data?.entries.map((entry) => (
              <tr key={entry.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-parchment-dim">
                  {new Date(entry.createdAt).toLocaleString("pl-PL")}
                </td>
                <td className="px-3 py-2 text-parchment">{entry.module}</td>
                <td className={`px-3 py-2 font-medium ${LEVEL_COLORS[entry.level] ?? ""}`}>
                  {entry.level}
                </td>
                <td className="px-3 py-2 text-parchment">{entry.action}</td>
                <td className="px-3 py-2 text-parchment-faint">{entry.actorUserId ?? "—"}</td>
                <td className="max-w-xs truncate px-3 py-2 font-mono text-xs text-parchment-faint">
                  {JSON.stringify(entry.payload)}
                </td>
              </tr>
            ))}
            {logsQuery.data?.entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-parchment-faint">
                  Brak wpisów spełniających filtry.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-parchment-dim">
        <span>
          Strona {filter.page} / {totalPages} ({logsQuery.data?.total ?? 0} wpisów)
        </span>
        <div className="flex gap-2">
          <button
            disabled={filter.page <= 1}
            onClick={() => updateFilter({ page: filter.page - 1 })}
            className=" border border-line-soft px-3 py-1 disabled:opacity-40"
          >
            Poprzednia
          </button>
          <button
            disabled={filter.page >= totalPages}
            onClick={() => updateFilter({ page: filter.page + 1 })}
            className=" border border-line-soft px-3 py-1 disabled:opacity-40"
          >
            Następna
          </button>
        </div>
      </div>
    </AppShell>
  );
}
