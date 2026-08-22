import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { PanelFrame } from "../components/common/PanelFrame";
import { ApiError } from "../lib/apiClient";
import { listMyTickets, createTicket, replyToTicket, type MyTicketDto } from "../lib/supportApi";

const STATUS_LABELS: Record<string, string> = {
  open: "Otwarty",
  in_progress: "W trakcie",
  resolved: "Rozwiązany",
  closed: "Zamknięty",
};
const STATUS_CLASSES: Record<string, string> = {
  open: "border-gold/50 bg-gold/10 text-gold-bright",
  in_progress: "border-rarity-rare/50 bg-rarity-rare/10 text-rarity-rare",
  resolved: "border-rarity-uncommon/50 bg-rarity-uncommon/10 text-rarity-uncommon",
  closed: "border-line-soft bg-panel-raised text-parchment-dim",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status] ?? ""}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function SupportPage() {
  const queryClient = useQueryClient();
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);

  const ticketsQuery = useQuery({ queryKey: ["my-tickets"], queryFn: listMyTickets });

  const createMutation = useMutation({
    mutationFn: () => createTicket({ subject: subject.trim(), body: body.trim() }),
    onSuccess: () => {
      setCreateError(null);
      setSubject("");
      setBody("");
      setComposeOpen(false);
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (err) => setCreateError(err instanceof ApiError ? err.message : "Nie udało się wysłać zgłoszenia"),
  });

  const replyMutation = useMutation({
    mutationFn: (ticketId: string) => replyToTicket(ticketId, { body: replyDraft.trim() }),
    onSuccess: () => {
      setReplyError(null);
      setReplyDraft("");
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (err) => setReplyError(err instanceof ApiError ? err.message : "Nie udało się wysłać odpowiedzi"),
  });

  const tickets: MyTicketDto[] = ticketsQuery.data ?? [];

  return (
    <AppShell>
      <PanelFrame
        title="Zgłoś problem"
        headerRight={
          <button
            onClick={() => setComposeOpen((v) => !v)}
            className="rounded-md bg-gold px-3 py-1 text-xs font-bold text-ink hover:bg-gold-bright"
          >
            {composeOpen ? "Anuluj" : "Nowe zgłoszenie"}
          </button>
        }
      >
        <p className="mb-3 text-sm text-parchment-dim">
          Znalazłeś buga albo masz pytanie do administracji? Opisz problem poniżej — odpowiemy tutaj, w tym samym miejscu.
        </p>

        {composeOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (subject.trim() && body.trim()) createMutation.mutate();
            }}
            className="mb-4 space-y-2 border-b border-line pb-4"
          >
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Temat (np. „Bug przy ulepszaniu itemu”)"
              className="h-9 w-full rounded-md border border-line-soft bg-ink px-3 text-sm text-parchment outline-none focus:border-gold"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Opisz dokładnie co się stało, najlepiej z krokami do odtworzenia"
              rows={5}
              className="w-full rounded-md border border-line-soft bg-ink px-3 py-2 text-sm text-parchment outline-none focus:border-gold"
            />
            <button
              type="submit"
              disabled={createMutation.isPending || !subject.trim() || !body.trim()}
              className="rounded-md bg-gold px-4 py-1.5 text-sm font-bold text-ink transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              Wyślij zgłoszenie
            </button>
            {createError && (
              <p role="alert" className="text-sm text-red-400">
                {createError}
              </p>
            )}
          </form>
        )}

        {tickets.length === 0 ? (
          <p className="text-sm text-parchment-faint">Nie masz jeszcze żadnych zgłoszeń.</p>
        ) : (
          <ul className="divide-y divide-line">
            {tickets.map((t) => {
              const isExpanded = expandedId === t.id;
              return (
                <li key={t.id} className="py-2">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    className="flex w-full items-center justify-between gap-2 text-left text-sm"
                  >
                    <span className="text-parchment">{t.subject}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={t.status} />
                      <span className="text-xs text-parchment-faint">{new Date(t.updatedAt).toLocaleString("pl-PL")}</span>
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="mt-2 space-y-2 border-l-2 border-gold/30 pl-3">
                      <p className="whitespace-pre-wrap text-sm text-parchment-dim">{t.body}</p>
                      {t.replies.map((r) => (
                        <div key={r.id} className="rounded-md bg-panel-raised p-2 text-sm">
                          <p className="whitespace-pre-wrap text-parchment">{r.body}</p>
                          <p className="mt-1 text-xs text-parchment-faint">{new Date(r.createdAt).toLocaleString("pl-PL")}</p>
                        </div>
                      ))}
                      {t.status !== "closed" && (
                        <div className="flex gap-2">
                          <input
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.target.value)}
                            placeholder="Dopisz odpowiedź..."
                            className="h-9 flex-1 rounded-md border border-line-soft bg-ink px-3 text-sm text-parchment outline-none focus:border-gold"
                          />
                          <button
                            onClick={() => replyMutation.mutate(t.id)}
                            disabled={replyMutation.isPending || !replyDraft.trim()}
                            className="rounded-md bg-gold px-3 py-1.5 text-xs font-bold text-ink hover:bg-gold-bright disabled:opacity-50"
                          >
                            Odpowiedz
                          </button>
                        </div>
                      )}
                      {replyError && (
                        <p role="alert" className="text-sm text-red-400">
                          {replyError}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PanelFrame>
    </AppShell>
  );
}
