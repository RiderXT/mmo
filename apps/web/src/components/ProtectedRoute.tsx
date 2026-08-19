import type { ReactElement } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import type { Role } from "@mmo/shared";
import { useAuthStore } from "../store/authStore";
import { cancelAccountDeletion } from "../lib/accountApi";
import { logoutRequest } from "../lib/authApi";

interface ProtectedRouteProps {
  children: ReactElement;
  allowedRoles?: Role[];
}

const DELETION_GRACE_DAYS = 30;

function formatDeletionDate(deletionRequestedAt: string): string {
  const date = new Date(new Date(deletionRequestedAt).getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  return date.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Full-screen block shown instead of `children` while account deletion is pending — see
 * user.deletionRequestedAt (set by POST /api/auth/request-deletion, cleared by
 * /api/auth/cancel-deletion). Kept intentionally simple (no AppShell chrome). */
function DeletionPendingScreen({ deletionRequestedAt }: { deletionRequestedAt: string }) {
  const navigate = useNavigate();
  const { user, accessToken, setSession, clearSession } = useAuthStore();

  const cancelMutation = useMutation({
    mutationFn: cancelAccountDeletion,
    onSuccess: () => {
      // Clear the field locally so the block lifts immediately, without a full page reload.
      if (user && accessToken) setSession({ ...user, deletionRequestedAt: null }, accessToken);
    },
  });

  async function handleLogout() {
    try {
      await logoutRequest();
    } finally {
      clearSession();
      navigate("/login");
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm space-y-4 panel p-6 text-center">
        <p className="text-parchment">
          Twoje konto zostanie usunięte {formatDeletionDate(deletionRequestedAt)}.
        </p>
        <div className="flex justify-center gap-2">
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
          >
            Cofnij usunięcie
          </button>
          <button
            onClick={handleLogout}
            className="border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
          >
            Wyloguj
          </button>
        </div>
        {cancelMutation.isError && (
          <p role="alert" className="text-sm text-red-400">
            Nie udało się cofnąć usunięcia.
          </p>
        )}
      </div>
    </div>
  );
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps): ReactElement {
  const { user, isBootstrapping } = useAuthStore();

  if (isBootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center text-parchment-dim">
        Ładowanie…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.deletionRequestedAt) {
    return <DeletionPendingScreen deletionRequestedAt={user.deletionRequestedAt} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/game" replace />;
  }

  return children;
}
