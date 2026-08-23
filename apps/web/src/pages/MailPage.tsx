import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { PanelFrame } from "../components/common/PanelFrame";
import { ConfirmModal } from "../components/common/ConfirmModal";
import { ApiError } from "../lib/apiClient";
import { listInbox, listSent, sendMessage, markMessageRead, deleteMessage, type MessageDto } from "../lib/mailApi";

type Tab = "inbox" | "sent";

export function MailPage() {
  const queryClient = useQueryClient();
  // ?to=CharacterName (e.g. the "Wiadomość" button on the Friends page) opens straight into a
  // pre-addressed compose instead of the inbox — read once on mount, not kept in sync with the
  // URL afterwards, so navigating tabs inside this page doesn't fight the query string.
  const [searchParams] = useSearchParams();
  const prefilledRecipient = searchParams.get("to") ?? "";
  const [tab, setTab] = useState<Tab>("inbox");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(prefilledRecipient.length > 0);
  const [recipient, setRecipient] = useState(prefilledRecipient);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);

  const inboxQuery = useQuery({ queryKey: ["mail-inbox"], queryFn: listInbox, enabled: tab === "inbox" });
  const sentQuery = useQuery({ queryKey: ["mail-sent"], queryFn: listSent, enabled: tab === "sent" });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["mail-inbox"] });
    queryClient.invalidateQueries({ queryKey: ["mail-sent"] });
    queryClient.invalidateQueries({ queryKey: ["mail-unread-count"] });
  }

  const sendMutation = useMutation({
    mutationFn: () => sendMessage({ recipientCharacterName: recipient.trim(), subject: subject.trim(), body: body.trim() }),
    onSuccess: () => {
      setSendError(null);
      setSendOk("Wiadomość wysłana.");
      setRecipient("");
      setSubject("");
      setBody("");
      setComposeOpen(false);
      invalidateAll();
      setTimeout(() => setSendOk(null), 4000);
    },
    onError: (err) => setSendError(err instanceof ApiError ? err.message : "Nie udało się wysłać wiadomości"),
  });

  const markReadMutation = useMutation({ mutationFn: markMessageRead, onSuccess: invalidateAll });
  const deleteMutation = useMutation({ mutationFn: deleteMessage, onSuccess: invalidateAll });

  const list: MessageDto[] = (tab === "inbox" ? inboxQuery.data : sentQuery.data) ?? [];

  function toggleExpand(message: MessageDto) {
    const opening = expandedId !== message.id;
    setExpandedId(opening ? message.id : null);
    if (opening && tab === "inbox" && !message.read) {
      markReadMutation.mutate(message.id);
    }
  }

  return (
    <AppShell>
      <PanelFrame
        title="Poczta"
        headerRight={
          <button
            onClick={() => setComposeOpen((v) => !v)}
            className="rounded-md bg-gold px-3 py-1 text-xs font-bold text-ink hover:bg-gold-bright"
          >
            {composeOpen ? "Anuluj" : "Nowa wiadomość"}
          </button>
        }
      >
        {composeOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (recipient.trim() && subject.trim() && body.trim()) sendMutation.mutate();
            }}
            className="mb-4 space-y-2 border-b border-line pb-4"
          >
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Nazwa postaci odbiorcy"
              className="h-9 w-full rounded-md border border-line-soft bg-ink px-3 text-sm text-parchment outline-none focus:border-gold"
            />
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Temat"
              className="h-9 w-full rounded-md border border-line-soft bg-ink px-3 text-sm text-parchment outline-none focus:border-gold"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Treść wiadomości"
              rows={4}
              className="w-full rounded-md border border-line-soft bg-ink px-3 py-2 text-sm text-parchment outline-none focus:border-gold"
            />
            <button
              type="submit"
              disabled={sendMutation.isPending || !recipient.trim() || !subject.trim() || !body.trim()}
              className="rounded-md bg-gold px-4 py-1.5 text-sm font-bold text-ink transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              Wyślij
            </button>
            {sendError && (
              <p role="alert" className="text-sm text-red-400">
                {sendError}
              </p>
            )}
          </form>
        )}
        {sendOk && (
          <p role="status" className="mb-2 text-sm text-rarity-uncommon">
            {sendOk}
          </p>
        )}

        <div className="mb-3 flex gap-1 border-b border-line pb-2">
          {(["inbox", "sent"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setExpandedId(null);
              }}
              className={`px-3 py-1.5 text-sm transition ${
                tab === t ? "bg-gold text-ink" : "text-parchment-dim hover:bg-panel-raised"
              }`}
            >
              {t === "inbox" ? "Odebrane" : "Wysłane"}
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-parchment-faint">
            {tab === "inbox" ? "Brak wiadomości." : "Nie wysłałeś jeszcze żadnej wiadomości."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((m) => (
              <li key={m.id} className="py-2">
                <button onClick={() => toggleExpand(m)} className="flex w-full items-center justify-between gap-2 text-left text-sm">
                  <span className={tab === "inbox" && !m.read ? "font-semibold text-parchment" : "text-parchment-dim"}>
                    {tab === "inbox" && !m.read && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gold-bright" />}
                    {m.subject}
                    <span className="ml-2 text-xs text-parchment-faint">
                      {tab === "inbox" ? "od" : "do"} {m.counterpartCharacterName ?? "(nieznany)"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-parchment-faint">{new Date(m.createdAt).toLocaleString("pl-PL")}</span>
                </button>
                {expandedId === m.id && (
                  <div className="mt-2 space-y-2 border-l-2 border-gold/30 pl-3">
                    <p className="whitespace-pre-wrap text-sm text-parchment">{m.body}</p>
                    <button onClick={() => setConfirmingDeleteId(m.id)} className="text-xs text-red-400 hover:underline">
                      Usuń
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </PanelFrame>

      {confirmingDeleteId && (
        <ConfirmModal
          title="Usunąć wiadomość?"
          message="Wiadomość zniknie z Twojego widoku. Druga strona nadal będzie ją widzieć."
          danger
          onCancel={() => setConfirmingDeleteId(null)}
          onConfirm={() => {
            deleteMutation.mutate(confirmingDeleteId);
            setExpandedId(null);
            setConfirmingDeleteId(null);
          }}
        />
      )}
    </AppShell>
  );
}
