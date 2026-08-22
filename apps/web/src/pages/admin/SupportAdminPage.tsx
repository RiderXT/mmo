import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TicketStatus } from "@mmo/shared";
import { inputClass } from "../../components/admin/Field";
import { ApiError } from "../../lib/apiClient";
import { listAllTickets, replyToTicketAsAdmin, updateTicketStatus } from "../../lib/adminApi";

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Otwarty" },
  { value: "in_progress", label: "W trakcie" },
  { value: "resolved", label: "Rozwiązany" },
  { value: "closed", label: "Zamknięty" },
];
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));
const STATUS_CLASSES: Record<string, string> = {
  open: "border-gold/50 bg-gold/10 text-gold-bright",
  in_progress: "border-rarity-rare/50 bg-rarity-rare/10 text-rarity-rare",
  resolved: "border-rarity-uncommon/50 bg-rarity-uncommon/10 text-rarity-uncommon",
  closed: "border-line-soft bg-panel-raised text-parchment-dim",
};

export function SupportAdminPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);

  const ticketsQuery = useQuery({
    queryKey: ["admin-tickets", statusFilter],
    queryFn: () => listAllTickets(statusFilter || undefined),
  });

  const replyMutation = useMutation({
    mutationFn: (ticketId: string) => replyToTicketAsAdmin(ticketId, { body: replyDraft.trim() }),
    onSuccess: () => {
      setReplyError(null);
      setReplyDraft("");
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
    onError: (err) => setReplyError(err instanceof ApiError ? err.message : "Nie udało się wysłać odpowiedzi"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: string; status: TicketStatus }) => updateTicketStatus(ticketId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-tickets"] }),
  });

  const tickets = ticketsQuery.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-parchment">Tickety</h1>
        <select
          className={`${inputClass} w-48`}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TicketStatus | "")}
        >
          <option value="">Wszystkie statusy</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Temat</th>
              <th className="px-3 py-2">Autor</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Ostatnia zmiana</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {tickets.map((t) => {
              const isExpanded = expandedId === t.id;
              return (
                <Fragment key={t.id}>
                  <tr>
                    <td className="px-3 py-2 text-parchment">{t.subject}</td>
                    <td className="px-3 py-2 text-parchment-dim">{t.authorEmail}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[t.status] ?? ""}`}>
                        {STATUS_LABELS[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-parchment-faint">{new Date(t.updatedAt).toLocaleString("pl-PL")}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                        className="text-xs text-gold-bright hover:underline"
                      >
                        {isExpanded ? "Ukryj wątek" : "Pokaż wątek"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} className="bg-panel-raised px-3 py-3">
                        <p className="mb-2 whitespace-pre-wrap text-sm text-parchment-dim">{t.body}</p>
                        <div className="max-h-64 space-y-2 overflow-y-auto">
                          {t.replies.map((r) => (
                            <div
                              key={r.id}
                              className={`rounded-md p-2 text-sm ${r.isAdminReply ? "bg-gold/10" : "bg-ink"}`}
                            >
                              <p className="whitespace-pre-wrap text-parchment">{r.body}</p>
                              <p className="mt-1 text-xs text-parchment-faint">
                                {r.authorEmail} {r.isAdminReply && "(admin)"} · {new Date(r.createdAt).toLocaleString("pl-PL")}
                              </p>
                            </div>
                          ))}
                          {t.replies.length === 0 && <p className="text-xs text-parchment-faint">Brak odpowiedzi jeszcze.</p>}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <input
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.target.value)}
                            placeholder="Odpowiedz graczowi..."
                            className={`${inputClass} flex-1 min-w-[200px]`}
                          />
                          <button
                            onClick={() => replyMutation.mutate(t.id)}
                            disabled={replyMutation.isPending || !replyDraft.trim()}
                            className="bg-gold px-3 py-1.5 text-xs font-bold text-ink hover:bg-gold-bright disabled:opacity-50"
                          >
                            Odpowiedz
                          </button>
                          <select
                            className={`${inputClass} w-40`}
                            value={t.status}
                            onChange={(e) => statusMutation.mutate({ ticketId: t.id, status: e.target.value as TicketStatus })}
                          >
                            {STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {replyError && (
                          <p role="alert" className="mt-2 text-sm text-red-400">
                            {replyError}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-parchment-faint">
                  Brak zgłoszeń.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
