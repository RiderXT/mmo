import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import type { Role } from "@mmo/shared";
import { useAuthStore } from "../store/authStore";

interface ProtectedRouteProps {
  children: ReactElement;
  allowedRoles?: Role[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps): ReactElement {
  const { user, isBootstrapping } = useAuthStore();

  if (isBootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Ładowanie…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/game" replace />;
  }

  return children;
}
