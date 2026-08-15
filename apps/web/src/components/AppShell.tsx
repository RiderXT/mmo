import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { logoutRequest } from "../lib/authApi";
import { useAuthStore } from "../store/authStore";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 text-sm transition ${
    isActive ? "bg-gold text-ink" : "text-parchment-dim hover:bg-panel-raised"
  }`;

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
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
    <div className="flex h-full flex-col">
      <div className="px-4 py-4 text-sm font-semibold uppercase tracking-wide text-gold">MMO</div>
      <nav className="flex-1 space-y-1 px-2">
        <NavLink to="/characters" className={navLinkClass} onClick={onNavigate}>
          Postacie
        </NavLink>
        {user?.role === "admin" && (
          <NavLink to="/admin/settings" className={navLinkClass} onClick={onNavigate}>
            Ustawienia
          </NavLink>
        )}
        {(user?.role === "admin" || user?.role === "moderator") && (
          <NavLink to="/admin/logs" className={navLinkClass} onClick={onNavigate}>
            Logi
          </NavLink>
        )}
      </nav>
      <div className="space-y-2 border-t border-line px-3 py-3 text-sm text-parchment-dim">
        <div className="truncate">{user?.email}</div>
        <button
          onClick={handleLogout}
          className="w-full border border-line-soft px-3 py-1.5 text-parchment-dim transition hover:bg-panel-raised"
        >
          Wyloguj
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink md:flex">
      <aside className="hidden w-56 shrink-0 border-r border-line bg-ink md:block">
        <SidebarContent />
      </aside>

      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-ink/90 px-4 py-3 backdrop-blur md:hidden">
        <span className="text-sm font-semibold uppercase tracking-wide text-gold">MMO</span>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Otwórz menu"
          className="border border-line-soft p-2 text-parchment-dim hover:bg-panel-raised"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-ink shadow-xl">
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
