import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { CharactersPage } from "./pages/CharactersPage";
import { GamePage } from "./pages/GamePage";
import { AdminLogsPage } from "./pages/AdminLogsPage";
import { ZonesAdminPage } from "./pages/admin/ZonesAdminPage";
import { MonstersAdminPage } from "./pages/admin/MonstersAdminPage";
import { ItemsAdminPage } from "./pages/admin/ItemsAdminPage";
import { SettingsAdminPage } from "./pages/admin/SettingsAdminPage";
import { ClassesAdminPage } from "./pages/admin/ClassesAdminPage";
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
      <Route path="/game" element={<Navigate to="/characters" replace />} />
      <Route
        path="/game/:characterId"
        element={
          <ProtectedRoute>
            <GamePage />
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
        path="/admin/zones"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <ZonesAdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/monsters"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <MonstersAdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/items"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <ItemsAdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <SettingsAdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/classes"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <ClassesAdminPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/characters" replace />} />
      <Route path="*" element={<Navigate to="/characters" replace />} />
    </Routes>
  );
}
