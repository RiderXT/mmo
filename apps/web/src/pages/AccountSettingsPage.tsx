import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PasswordSchema } from "@mmo/shared";
import { AppShell } from "../components/AppShell";
import { PanelFrame } from "../components/common/PanelFrame";
import { ConfirmModal } from "../components/common/ConfirmModal";
import {
  getAccountSettings,
  updateAccountSettings,
  changePassword,
  requestAccountDeletion,
  cancelAccountDeletion,
} from "../lib/accountApi";
import { ApiError } from "../lib/apiClient";
import { useAuthStore } from "../store/authStore";

function formatDate(date: Date) {
  return date.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const DELETION_GRACE_DAYS = 30;

function deletionDate(deletionRequestedAt: string): Date {
  return new Date(new Date(deletionRequestedAt).getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

export function AccountSettingsPage() {
  const navigate = useNavigate();
  const clearSession = useAuthStore((s) => s.clearSession);
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({ queryKey: ["account-settings"], queryFn: getAccountSettings });

  function invalidateSettings() {
    queryClient.invalidateQueries({ queryKey: ["account-settings"] });
  }

  // --- Link poleceń -------------------------------------------------------
  const [copied, setCopied] = useState(false);
  const referralUrl = settingsQuery.data
    ? `${window.location.origin}/register?ref=${settingsQuery.data.referralCode}`
    : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // --- Zmiana hasła ---------------------------------------------------------
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      clearSession();
      navigate("/login", { state: { message: "Hasło zmienione — zaloguj się ponownie." } });
    },
    onError: (err) => setPasswordError(err instanceof ApiError ? err.message : "Nie udało się zmienić hasła"),
  });

  function handleChangePassword() {
    setPasswordError(null);
    const parsed = PasswordSchema.safeParse(newPassword);
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? "Nieprawidłowe hasło");
      return;
    }
    if (!currentPassword) {
      setPasswordError("Podaj obecne hasło");
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword: parsed.data });
  }

  // --- Widoczność -----------------------------------------------------------
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [visibilitySaved, setVisibilitySaved] = useState(false);

  const updateVisibilityMutation = useMutation({
    mutationFn: updateAccountSettings,
    onSuccess: () => {
      invalidateSettings();
      setVisibilityError(null);
      setVisibilitySaved(true);
      setTimeout(() => setVisibilitySaved(false), 2000);
    },
    onError: (err) => setVisibilityError(err instanceof ApiError ? err.message : "Nie udało się zapisać"),
  });

  // --- Usuń konto -------------------------------------------------------------
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const requestDeletionMutation = useMutation({
    mutationFn: requestAccountDeletion,
    onSuccess: () => {
      clearSession();
      navigate("/login", {
        state: { message: "Usunięcie konta zaplanowane za 30 dni. Zaloguj się ponownie, aby cofnąć." },
      });
    },
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "Nie udało się zainicjować usunięcia"),
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: cancelAccountDeletion,
    onSuccess: invalidateSettings,
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "Nie udało się cofnąć usunięcia"),
  });

  const settings = settingsQuery.data;

  return (
    <AppShell>
      <h1 className="text-lg font-semibold text-parchment">Ustawienia konta</h1>

      {settingsQuery.isLoading && <p className="mt-4 text-parchment-dim">Wczytywanie…</p>}

      {settings && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <PanelFrame title="Link poleceń">
            <p className="text-sm text-parchment-dim">
              Zaproś znajomych swoim linkiem — obaj możecie otrzymać nagrodę (zależnie od ustawień gry).
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={referralUrl}
                className="min-w-0 flex-1 border border-line-soft bg-panel-raised px-3 py-1.5 text-sm text-parchment"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={handleCopy}
                className="shrink-0 bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
              >
                {copied ? "Skopiowano!" : "Kopiuj"}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center justify-between border border-line-soft bg-panel-raised px-2.5 py-1.5">
                <span className="text-parchment-dim">Poleconych</span>
                <span className="font-medium tabular-nums text-parchment">{settings.referralCount}</span>
              </div>
              <div className="flex items-center justify-between border border-line-soft bg-panel-raised px-2.5 py-1.5">
                <span className="text-parchment-dim">Nagrodzonych</span>
                <span className="font-medium tabular-nums text-parchment">{settings.referralRewardedCount}</span>
              </div>
            </div>
          </PanelFrame>

          <PanelFrame title="Widoczność">
            <label className="flex items-center gap-2 text-sm text-parchment">
              <input
                type="checkbox"
                checked={settings.hideOnlineStatus}
                onChange={(e) => updateVisibilityMutation.mutate({ hideOnlineStatus: e.target.checked })}
                className="h-4 w-4"
              />
              Ukryj mój status online przed innymi graczami
            </label>
            {visibilityError && (
              <p role="alert" className="mt-2 text-sm text-red-400">
                {visibilityError}
              </p>
            )}
            {visibilitySaved && <p className="mt-2 text-sm text-rarity-uncommon">Zapisano.</p>}
          </PanelFrame>

          <PanelFrame title="Zmiana hasła">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-parchment-dim" htmlFor="currentPassword">
                  Obecne hasło
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full border border-line-soft bg-panel-raised px-3 py-1.5 text-sm text-parchment outline-none focus:border-gold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-parchment-dim" htmlFor="newPassword">
                  Nowe hasło
                </label>
                <input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-line-soft bg-panel-raised px-3 py-1.5 text-sm text-parchment outline-none focus:border-gold"
                />
                <p className="text-xs text-parchment-faint">Min. 10 znaków, wielka i mała litera oraz cyfra.</p>
              </div>
              {passwordError && (
                <p role="alert" className="text-sm text-red-400">
                  {passwordError}
                </p>
              )}
              <button
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending}
                className="bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
              >
                Zmień hasło
              </button>
              <p className="text-xs text-parchment-faint">
                Po zmianie hasła zostaniesz wylogowany ze wszystkich urządzeń.
              </p>
            </div>
          </PanelFrame>

          <PanelFrame title="Usuń konto" emphasis="secondary">
            {settings.deletionRequestedAt ? (
              <div className="space-y-3">
                <p className="text-sm text-parchment">
                  Twoje konto zostanie usunięte {formatDate(deletionDate(settings.deletionRequestedAt))}.
                </p>
                <button
                  onClick={() => cancelDeletionMutation.mutate()}
                  disabled={cancelDeletionMutation.isPending}
                  className="bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
                >
                  Cofnij usunięcie
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-parchment-dim">
                  Konto zostanie usunięte po 30-dniowym okresie karencji — w tym czasie możesz cofnąć decyzję.
                </p>
                <button
                  onClick={() => {
                    setDeletePassword("");
                    setDeleteError(null);
                    setConfirmingDelete(true);
                  }}
                  className="border border-red-400 px-4 py-1.5 text-sm font-medium text-red-400 hover:bg-red-400/10"
                >
                  Usuń konto
                </button>
              </div>
            )}
            {deleteError && !confirmingDelete && (
              <p role="alert" className="mt-2 text-sm text-red-400">
                {deleteError}
              </p>
            )}
          </PanelFrame>
        </div>
      )}

      {confirmingDelete && (
        <ConfirmModal
          title="Usunąć konto?"
          danger
          confirmLabel="Usuń konto"
          message={
            <div className="space-y-2">
              <p>Podaj hasło, aby potwierdzić zaplanowanie usunięcia konta za 30 dni.</p>
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Hasło"
                className="w-full border border-line-soft bg-panel-raised px-3 py-1.5 text-sm text-parchment outline-none focus:border-gold"
              />
              {deleteError && (
                <p role="alert" className="text-sm text-red-400">
                  {deleteError}
                </p>
              )}
            </div>
          }
          onConfirm={() => {
            if (!deletePassword) {
              setDeleteError("Podaj hasło");
              return;
            }
            requestDeletionMutation.mutate({ password: deletePassword });
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </AppShell>
  );
}
