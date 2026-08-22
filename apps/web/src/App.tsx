import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { CharactersPage } from "./pages/CharactersPage";
import { GamePage } from "./pages/GamePage";
import { ProfilePage } from "./pages/ProfilePage";
import { AccountSettingsPage } from "./pages/AccountSettingsPage";
import { FriendsPage } from "./pages/FriendsPage";
import { MailPage } from "./pages/MailPage";
import { SupportPage } from "./pages/SupportPage";
import { ChangelogPage } from "./pages/ChangelogPage";
import { RankingPage } from "./pages/RankingPage";
import { AdminLogsPage } from "./pages/AdminLogsPage";
import { AdminSettingsPage } from "./pages/admin/AdminSettingsPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuthStore } from "./store/authStore";
import { tryRefresh } from "./lib/apiClient";

export function App() {
  const setBootstrapping = useAuthStore((s) => s.setBootstrapping);

  useEffect(() => {
    tryRefresh().finally(() => setBootstrapping(false));
  }, [setBootstrapping]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/characters"
        element={
          <ProtectedRoute>
            <CharactersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/game"
        element={
          <ProtectedRoute>
            <GamePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/game/:tab"
        element={
          <ProtectedRoute>
            <GamePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/:name"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AccountSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/friends"
        element={
          <ProtectedRoute>
            <FriendsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mail"
        element={
          <ProtectedRoute>
            <MailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/support"
        element={
          <ProtectedRoute>
            <SupportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/changelog"
        element={
          <ProtectedRoute>
            <ChangelogPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ranking"
        element={
          <ProtectedRoute>
            <RankingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/logs"
        element={
          <ProtectedRoute allowedRoles={["admin", "moderator"]}>
            <AdminLogsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/characters" replace />} />
      <Route path="*" element={<Navigate to="/characters" replace />} />
    </Routes>
  );
}
