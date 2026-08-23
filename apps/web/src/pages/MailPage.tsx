import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { PanelFrame } from "../components/common/PanelFrame";
import { ConfirmModal } from "../components/common/ConfirmModal";
import { ApiError } from "../lib/apiClient";
import {
  listConversations,
  getConversation,
  deleteConversation,
  sendMessage,
  type ConversationSummaryDto,
} from "../lib/mailApi";

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

export function MailPage() {
  const queryClient = useQueryClient();
  // ?to=CharacterName (e.g. the "Wiadomość" button on the Friends page) opens straight into that
  // person's conversation — existing thread if one already exists, otherwise a fresh compose
  // addressed to them. Read once (handledToParam guards against re-triggering while browsing).
  const [searchParams] = useSearchParams();
  const toParam = searchParams.get("to");
  const [handledToParam, setHandledToParam] = useState(false);

  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [newRecipientName, setNewRecipientName] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const conversationsQuery = useQuery({ queryKey: ["mail-conversations"], queryFn: listConversations });
  const conversationQuery = useQuery({
    queryKey: ["mail-conversation", selectedPartnerId],
    queryFn: () => getConversation(selectedPartnerId!),
    enabled: !!selectedPartnerId,
  });

  useEffect(() => {
    if (!toParam || handledToParam || !conversationsQuery.data) return;
    const existing = conversationsQuery.data.find(
      (c) => c.partnerCharacterName?.toLowerCase() === toParam.toLowerCase(),
    );
    if (existing) setSelectedPartnerId(existing.partnerUserId);
    else setNewRecipientName(toParam);
    setHandledToParam(true);
  }, [toParam, handledToParam, conversationsQuery.data]);

  // The GET marks the partner's messages read server-side — the unread badge (here and in the
  // nav) needs to catch up once that happens instead of waiting for the next 30s poll.
  useEffect(() => {
    if (!conversationQuery.data) return;
    queryClient.invalidateQueries({ queryKey: ["mail-conversations"] });
    queryClient.invalidateQueries({ queryKey: ["mail-unread-count"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationQuery.data]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [conversationQuery.data, selectedPartnerId]);

  const selectedConversation = conversationsQuery.data?.find((c) => c.partnerUserId === selectedPartnerId);
  const recipientName = newRecipientName ?? selectedConversation?.partnerCharacterName ?? null;

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendMessage({ recipientCharacterName: recipientName!.trim(), body }),
    onSuccess: (sent) => {
      setSendError(null);
      setMessageBody("");
      setNewRecipientName(null);
      setSelectedPartnerId(sent.recipientUserId);
      queryClient.invalidateQueries({ queryKey: ["mail-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["mail-conversation", sent.recipientUserId] });
      queryClient.invalidateQueries({ queryKey: ["mail-unread-count"] });
    },
    onError: (err) => setSendError(err instanceof ApiError ? err.message : "Nie udało się wysłać wiadomości"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteConversation(selectedPartnerId!),
    onSuccess: () => {
      setSelectedPartnerId(null);
      queryClient.invalidateQueries({ queryKey: ["mail-conversations"] });
    },
  });

  function openConversation(c: ConversationSummaryDto) {
    setSelectedPartnerId(c.partnerUserId);
    setNewRecipientName(null);
    setSendError(null);
  }

  function startNewConversation() {
    setSelectedPartnerId(null);
    setNewRecipientName("");
    setMessageBody("");
    setSendError(null);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!recipientName?.trim() || !messageBody.trim()) return;
    sendMutation.mutate(messageBody.trim());
  }

  const conversations = conversationsQuery.data ?? [];
  const showThread = selectedPartnerId !== null || newRecipientName !== null;

  return (
    <AppShell>
      <div className="grid gap-4 md:grid-cols-[300px_1fr] md:items-start">
        <PanelFrame
          title="Konwersacje"
          headerRight={
            <button
              onClick={startNewConversation}
              className="rounded-md bg-gold px-3 py-1 text-xs font-bold text-ink hover:bg-gold-bright"
            >
              Nowa
            </button>
          }
        >
          {conversations.length === 0 ? (
            <p className="text-sm text-parchment-faint">Brak konwersacji.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {conversations.map((c) => {
                const active = c.partnerUserId === selectedPartnerId;
                return (
                  <li key={c.partnerUserId}>
                    <button
                      onClick={() => openConversation(c)}
                      className={`w-full border p-2.5 text-left transition ${
                        active ? "border-gold bg-gold/10" : "border-transparent bg-panel-raised hover:border-line-soft"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-sm ${
                            c.unreadCount > 0 ? "font-semibold text-parchment" : "text-parchment-dim"
                          }`}
                        >
                          {c.partnerCharacterName ?? "(nieznany)"}
                        </span>
                        {c.unreadCount > 0 && (
                          <span className="shrink-0 rounded-full bg-gold-bright px-1.5 py-0.5 text-[10px] font-bold text-ink">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-parchment-faint">{c.lastMessage}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PanelFrame>

        <PanelFrame
          title={recipientName ?? "Wybierz konwersację"}
          headerRight={
            selectedPartnerId && (
              <button onClick={() => setConfirmingDelete(true)} className="text-xs text-red-400 hover:underline">
                Usuń konwersację
              </button>
            )
          }
        >
          {!showThread ? (
            <p className="text-sm text-parchment-faint">
              Wybierz konwersację z listy albo kliknij "Nowa", żeby napisać do kogoś po raz pierwszy.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {newRecipientName !== null && (
                <input
                  value={newRecipientName}
                  onChange={(e) => setNewRecipientName(e.target.value)}
                  placeholder="Nazwa postaci odbiorcy"
                  className="h-9 w-full rounded-md border border-line-soft bg-ink px-3 text-sm text-parchment outline-none focus:border-gold"
                />
              )}

              {selectedPartnerId && (
                <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
                  {(conversationQuery.data ?? []).map((m) => (
                    <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] px-3 py-2 text-sm ${
                          m.fromMe ? "bg-gold/15 text-parchment" : "bg-panel-raised text-parchment"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p className="mt-1 text-[10px] text-parchment-faint">{formatTimestamp(m.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={threadEndRef} />
                </div>
              )}

              <form onSubmit={handleSend} className="flex gap-2 border-t border-line pt-3">
                <textarea
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                  placeholder="Napisz wiadomość..."
                  rows={2}
                  className="flex-1 resize-none rounded-md border border-line-soft bg-ink px-3 py-2 text-sm text-parchment outline-none focus:border-gold"
                />
                <button
                  type="submit"
                  disabled={sendMutation.isPending || !recipientName?.trim() || !messageBody.trim()}
                  className="shrink-0 rounded-md bg-gold px-4 py-1.5 text-sm font-bold text-ink transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Wyślij
                </button>
              </form>
              {sendError && (
                <p role="alert" className="text-sm text-red-400">
                  {sendError}
                </p>
              )}
            </div>
          )}
        </PanelFrame>
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Usunąć konwersację?"
          message="Cała rozmowa zniknie z Twojego widoku. Druga strona nadal będzie ją widzieć."
          danger
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            deleteMutation.mutate();
            setConfirmingDelete(false);
          }}
        />
      )}
    </AppShell>
  );
}
