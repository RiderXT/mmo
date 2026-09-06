import { useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

/** Permanent, so confirmation is the account password (same gate as Account Settings' "request
 * account deletion"), not just a click-through ConfirmModal — a single misclick must not be able
 * to delete a character. */
export function DeleteCharacterModal({
  characterName,
  onConfirm,
  onCancel,
  error,
  isPending,
}: {
  characterName: string;
  onConfirm: (password: string) => void;
  onCancel: () => void;
  error: string | null;
  isPending: boolean;
}) {
  const [password, setPassword] = useState("");
  useEscapeKey(onCancel);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    onConfirm(password);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <form onSubmit={handleSubmit} className="relative w-full max-w-sm panel p-4">
        <h2 className="font-medium text-parchment">Usuń postać {characterName}</h2>
        <p className="mt-2 text-sm text-parchment-dim">
          Ta operacja jest nieodwracalna — postać, jej ekwipunek, umiejętności i historia zostaną
          usunięte na zawsze. Wpisz hasło do konta, żeby potwierdzić.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Hasło do konta"
          className="mt-4 w-full border border-line-soft bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-gold"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={!password || isPending}
            className="rounded-md bg-red-500 px-4 py-1.5 text-sm font-medium text-ink hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Usuń postać
          </button>
        </div>
      </form>
    </div>
  );
}
