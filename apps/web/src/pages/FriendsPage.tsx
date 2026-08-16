import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { ApiError } from "../lib/apiClient";
import {
  listFriends,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
} from "../lib/friendsApi";

export function FriendsPage() {
  const queryClient = useQueryClient();
  const [targetName, setTargetName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const friendsQuery = useQuery({ queryKey: ["friends"], queryFn: listFriends });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["friends"] });
  }

  const sendMutation = useMutation({
    mutationFn: () => sendFriendRequest({ targetCharacterName: targetName.trim() }),
    onSuccess: (result) => {
      setError(null);
      setMessage(result.status === "accepted" ? "Mieliście już wzajemne zaproszenie — jesteście znajomymi!" : "Zaproszenie wysłane.");
      setTargetName("");
      invalidate();
      setTimeout(() => setMessage(null), 4000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się wysłać zaproszenia"),
  });

  const acceptMutation = useMutation({ mutationFn: acceptFriendRequest, onSuccess: invalidate });
  const declineMutation = useMutation({ mutationFn: declineFriendRequest, onSuccess: invalidate });
  const cancelMutation = useMutation({ mutationFn: cancelFriendRequest, onSuccess: invalidate });
  const removeMutation = useMutation({ mutationFn: removeFriend, onSuccess: invalidate });

  const friends = friendsQuery.data;

  return (
    <AppShell>
      <div className="panel p-4">
        <h1 className="font-display text-lg font-bold text-parchment">Znajomi</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (targetName.trim()) sendMutation.mutate();
          }}
          className="mt-3 flex flex-wrap gap-2"
        >
          <input
            value={targetName}
            onChange={(e) => setTargetName(e.target.value)}
            placeholder="Nazwa postaci"
            className="h-9 flex-1 min-w-[180px] rounded-md border border-line-soft bg-ink px-3 text-sm text-parchment outline-none focus:border-gold"
          />
          <button
            type="submit"
            disabled={sendMutation.isPending || !targetName.trim()}
            className="rounded-md bg-gold px-4 text-sm font-bold text-ink transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            Zaproś
          </button>
        </form>
        {message && <p className="mt-2 text-sm text-rarity-uncommon">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      {friends && friends.incoming.length > 0 && (
        <div className="mt-4 panel p-4">
          <h2 className="font-medium text-parchment">Przychodzące zaproszenia</h2>
          <ul className="mt-2 space-y-2">
            {friends.incoming.map((r) => (
              <li key={r.friendRequestId} className="flex items-center justify-between text-sm">
                <span className="text-parchment">{r.characterName ?? "(brak postaci)"}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptMutation.mutate(r.friendRequestId)}
                    className="rounded-md bg-gold px-3 py-1 text-xs font-bold text-ink hover:bg-gold-bright"
                  >
                    Akceptuj
                  </button>
                  <button
                    onClick={() => declineMutation.mutate(r.friendRequestId)}
                    className="rounded-md border border-line-soft px-3 py-1 text-xs text-parchment-dim hover:bg-panel-raised"
                  >
                    Odrzuć
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {friends && friends.outgoing.length > 0 && (
        <div className="mt-4 panel p-4">
          <h2 className="font-medium text-parchment">Wysłane zaproszenia</h2>
          <ul className="mt-2 space-y-2">
            {friends.outgoing.map((r) => (
              <li key={r.friendRequestId} className="flex items-center justify-between text-sm">
                <span className="text-parchment">{r.characterName ?? "(brak postaci)"}</span>
                <button
                  onClick={() => cancelMutation.mutate(r.friendRequestId)}
                  className="rounded-md border border-line-soft px-3 py-1 text-xs text-parchment-dim hover:bg-panel-raised"
                >
                  Anuluj
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 panel p-4">
        <h2 className="font-medium text-parchment">Lista znajomych</h2>
        {!friends || friends.friends.length === 0 ? (
          <p className="mt-2 text-sm text-parchment-faint">Nie masz jeszcze żadnych znajomych.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {friends.friends.map((f) => (
              <li key={f.userId} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${f.online ? "bg-rarity-uncommon" : "bg-parchment-faint"}`} />
                  {f.characterId && f.characterName ? (
                    <Link to={`/profile/${f.characterId}`} className="text-parchment hover:text-gold-bright">
                      {f.characterName}
                    </Link>
                  ) : (
                    <span className="text-parchment-faint">(brak postaci)</span>
                  )}
                  {f.className && <span className="text-xs text-parchment-faint">· {f.className}</span>}
                  {f.characterLevel != null && <span className="text-xs text-parchment-faint">· lvl. {f.characterLevel}</span>}
                </div>
                <button
                  onClick={() => confirm(`Usunąć "${f.characterName}" ze znajomych?`) && removeMutation.mutate(f.userId)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Usuń
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
