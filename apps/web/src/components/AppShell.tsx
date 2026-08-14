import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { logoutRequest } from "../lib/authApi";
import { useAuthStore } from "../store/authStore";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm transition ${
    isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"
  }`;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user, clearSession } = useAuthStore();

  async function handleLogout() {
    try {
      await logoutRequest();
    } finally {
      clearSession();
      navigate("/login");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/characters" className={navLinkClass}>
              Postacie
            </NavLink>
            {user?.role === "admin" && (
              <>
                <NavLink to="/admin/classes" className={navLinkClass}>
                  Klasy
                </NavLink>
                <NavLink to="/admin/zones" className={navLinkClass}>
                  Krainy
                </NavLink>
                <NavLink to="/admin/monsters" className={navLinkClass}>
                  Potwory
                </NavLink>
                <NavLink to="/admin/items" className={navLinkClass}>
                  Itemy
                </NavLink>
                <NavLink to="/admin/settings" className={navLinkClass}>
                  Ustawienia
                </NavLink>
              </>
            )}
            {(user?.role === "admin" || user?.role === "moderator") && (
              <NavLink to="/admin/logs" className={navLinkClass}>
                Logi
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="hidden sm:inline">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:bg-slate-800"
            >
              Wyloguj
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
