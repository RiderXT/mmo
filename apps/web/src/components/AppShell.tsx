import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { expForLevel } from "@mmo/shared";
import { logoutRequest } from "../lib/authApi";
import { useAuthStore } from "../store/authStore";
import { useCharacterStore } from "../store/characterStore";
import { getCharacter } from "../lib/charactersApi";
import { listPlayerZones } from "../lib/zonesApi";
import { getUnreadMailCount } from "../lib/mailApi";
import { UpdateBanner } from "./UpdateBanner";
import { ActiveBuffsBar } from "./expedition/ActiveBuffsBar";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm font-medium transition ${
    isActive
      ? "border-gold-bright bg-gold/10 text-parchment"
      : "border-transparent text-parchment-dim hover:bg-panel-raised"
  }`;

function NavIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-gradient-to-br from-panel-raised to-panel ${
        active ? "border-gold/60" : "border-line-soft"
      }`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

/** Nav icon backed by real medallion artwork (apps/web/public/icons/nav/*.png) instead of the
 * plain colored dot — used for the character-scoped links that have dedicated icon art. */
function NavIconImg({
  src,
  alt,
  active,
  dim = false,
}: {
  src: string;
  alt: string;
  active: boolean;
  dim?: boolean;
}) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-panel transition ${
        active ? "border-gold shadow-[0_0_8px_oklch(76%_0.09_85_/_0.4)]" : "border-line-soft"
      } ${dim ? "opacity-50 grayscale" : ""}`}
    >
      <img src={src} alt={alt} className="h-full w-full object-cover" />
    </span>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center gap-2 border-b border-gold/15 px-3 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-parchment-faint">
      <span className="h-1.5 w-1.5 shrink-0 rotate-45 border border-gold/40" />
      {children}
    </div>
  );
}

/** Character-scoped header bar (avatar/level/XP/gold) — rendered whenever a character is
 * active. Shares the exact ["character", characterId] query key GamePage.tsx already uses, so
 * react-query dedupes the fetch instead of firing an extra request. */
function CharacterHeaderBar() {
  const characterId = useCharacterStore((s) => s.activeCharacterId);
  const characterQuery = useQuery({
    queryKey: ["character", characterId],
    queryFn: () => getCharacter(characterId!),
    enabled: !!characterId,
  });

  if (!characterId || !characterQuery.data) return null;
  const character = characterQuery.data;
  // computeLevel() in apps/api/.../expeditions/service.ts uses a cubic exp curve (packages/shared
  // lib/leveling.ts) — progress within the current level is how far exp sits between this
  // level's floor and the next level's floor, as a percentage.
  const levelFloor = expForLevel(character.level);
  const levelSpan = Math.max(1, expForLevel(character.level + 1) - levelFloor);
  const expIntoLevel = Math.min(100, Math.max(0, ((character.exp - levelFloor) / levelSpan) * 100));

  return (
    <div className="flex flex-1 items-center justify-between gap-4 overflow-hidden">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-gold/60 bg-gradient-to-br from-panel-raised to-panel font-display text-base font-bold text-gold">
          {character.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-parchment">{character.name}</span>
            <span className="shrink-0 rounded border border-gold/50 bg-gold/10 px-1.5 py-0.5 text-xs font-bold text-gold">
              lvl. {character.level}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-panel-raised sm:w-40">
            <div className="h-full bg-gradient-to-r from-mp to-mp-bright" style={{ width: `${expIntoLevel}%` }} />
          </div>
        </div>
      </div>
      <ActiveBuffsBar character={character} />
      <div className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-gold">
        <span className="h-3 w-3 rounded-full bg-gold" />
        {character.gold.toLocaleString("pl-PL")}
      </div>
    </div>
  );
}

/** Each character-scoped tab has its own pathname (/game/:tab), so NavLink's built-in isActive
 * matching (by pathname) works without any manual comparison. The active character itself lives
 * in characterStore, not the URL. */
function TabNavLink({
  tab,
  icon,
  label,
  onNavigate,
}: {
  tab: string;
  icon: string;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <NavLink to={`/game/${tab}`} className={navLinkClass} onClick={onNavigate}>
      {({ isActive }) => (
        <>
          <NavIconImg src={icon} alt="" active={isActive} />
          {label}
        </>
      )}
    </NavLink>
  );
}

/** Character-scoped nav links (Postać/Ekwipunek/Ekspedycje/Kowadło/NPC) — rendered whenever a
 * character is active (Kowadło/NPC additionally gated to town zones). Shares the exact
 * ["character", characterId] / ["player-zones"] query keys GamePage.tsx and ExpeditionPanel.tsx
 * already use, so react-query dedupes the fetch instead of firing an extra request. */
function CharacterNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const characterId = useCharacterStore((s) => s.activeCharacterId);
  const characterQuery = useQuery({
    queryKey: ["character", characterId],
    queryFn: () => getCharacter(characterId!),
    enabled: !!characterId,
  });
  const zonesQuery = useQuery({
    queryKey: ["player-zones"],
    queryFn: listPlayerZones,
    enabled: !!characterId,
  });

  if (!characterId) return null;

  const currentZone = zonesQuery.data?.find((z) => z.id === characterQuery.data?.currentZoneId);
  const inTown = currentZone?.isTown ?? false;
  const characterName = characterQuery.data?.name;

  return (
    <>
      <SectionTitle>Postać</SectionTitle>
      <div className="space-y-1 px-2">
        <TabNavLink
          tab="character"
          icon="/icons/nav/postac.png"
          label="Postać"
          onNavigate={onNavigate}
        />
        <TabNavLink
          tab="equipment"
          icon="/icons/nav/ekwipunek.png"
          label="Ekwipunek"
          onNavigate={onNavigate}
        />
        <TabNavLink
          tab="expeditions"
          icon="/icons/nav/ekspedycje.png"
          label="Ekspedycje"
          onNavigate={onNavigate}
        />
        {/* No dedicated map icon exists yet — reuses the Ekspedycje icon as a placeholder, same
            precedent as Poczta borrowing the Znajomi icon before its own art was ready. */}
        <TabNavLink
          tab="world-map"
          icon="/icons/nav/ekspedycje.png"
          label="Mapa świata"
          onNavigate={onNavigate}
        />
        <TabNavLink
          tab="skills"
          icon="/icons/nav/umiejetnosci.png"
          label="Umiejętności"
          onNavigate={onNavigate}
        />
        <TabNavLink
          tab="daily-login"
          icon="/icons/nav/postac.png"
          label="Nagrody dzienne"
          onNavigate={onNavigate}
        />
        {characterName && (
          <NavLink to={`/profile/${encodeURIComponent(characterName)}`} className={navLinkClass} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                <NavIconImg src="/icons/nav/postac.png" alt="" active={isActive} />
                Profil
              </>
            )}
          </NavLink>
        )}
      </div>

      <SectionTitle>Miasto</SectionTitle>
      <div className="space-y-1 px-2">
        {inTown ? (
          <TabNavLink
            tab="anvil"
            icon="/icons/nav/kowadlo.png"
            label="Kowadło"
            onNavigate={onNavigate}
          />
        ) : (
          <div
            title="Dostępne tylko w mieście"
            className="flex cursor-not-allowed items-center gap-2.5 px-3 py-2 text-sm text-parchment-faint/50"
          >
            <NavIconImg src="/icons/nav/kowadlo.png" alt="" active={false} dim />
            Kowadło
          </div>
        )}
        {inTown ? (
          <TabNavLink
            tab="npc"
            icon="/icons/nav/npc.png"
            label="NPC"
            onNavigate={onNavigate}
          />
        ) : (
          <div
            title="Dostępne tylko w mieście"
            className="flex cursor-not-allowed items-center gap-2.5 px-3 py-2 text-sm text-parchment-faint/50"
          >
            <NavIconImg src="/icons/nav/npc.png" alt="" active={false} dim />
            NPC
          </div>
        )}
      </div>
    </>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { user, clearSession } = useAuthStore();
  // 30s poll — frequent enough that an unread badge feels current without hammering the API the
  // way ServerAdminPage's 2-5s dashboards do (those are admin-only and already accepted as busy).
  const unreadMailQuery = useQuery({ queryKey: ["mail-unread-count"], queryFn: getUnreadMailCount, refetchInterval: 30000 });
  const unreadMailCount = unreadMailQuery.data?.count ?? 0;

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
      <div className="px-4 py-4 font-display text-base font-bold uppercase tracking-[0.1em] text-gold">MMO</div>
      <nav className="flex-1 pb-4">
        <SectionTitle>Nawigacja</SectionTitle>
        <div className="px-2">
          <NavLink to="/characters" className={navLinkClass} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                <NavIconImg src="/icons/nav/postacie.png" alt="" active={isActive} />
                Postacie
              </>
            )}
          </NavLink>
          <NavLink to="/friends" className={navLinkClass} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                <NavIconImg src="/icons/nav/znajomi.png" alt="" active={isActive} />
                Znajomi
              </>
            )}
          </NavLink>
          {/* Brak jeszcze dedykowanej grafiki dla Poczty/Zgłoś problem/Changelog (Tymczasowe/rpg_menu_design
             miał tylko puste placeholdery dla poczty) — reużyte istniejące ikony tymczasowo. */}
          <NavLink to="/mail" className={navLinkClass} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                <span className="relative">
                  <NavIconImg src="/icons/nav/znajomi.png" alt="" active={isActive} />
                  {unreadMailCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-bright px-1 text-[10px] font-bold text-ink">
                      {unreadMailCount > 9 ? "9+" : unreadMailCount}
                    </span>
                  )}
                </span>
                Poczta
              </>
            )}
          </NavLink>
          <NavLink to="/support" className={navLinkClass} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                <NavIconImg src="/icons/nav/npc.png" alt="" active={isActive} />
                Zgłoś problem
              </>
            )}
          </NavLink>
          <NavLink to="/changelog" className={navLinkClass} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                <NavIconImg src="/icons/nav/ranking.png" alt="" active={isActive} />
                Co nowego
              </>
            )}
          </NavLink>
          <NavLink to="/ranking" className={navLinkClass} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                <NavIconImg src="/icons/nav/ranking.png" alt="" active={isActive} />
                Ranking
              </>
            )}
          </NavLink>
        </div>

        <CharacterNavLinks onNavigate={onNavigate} />

        {(user?.role === "admin" || user?.role === "moderator") && (
          <>
            <SectionTitle>Admin</SectionTitle>
            <div className="space-y-1 px-2">
              {user?.role === "admin" && (
                <NavLink to="/admin/settings" className={navLinkClass} onClick={onNavigate}>
                  {({ isActive }) => (
                    <>
                      <NavIcon color="oklch(60% 0.02 50)" active={isActive} />
                      Ustawienia
                    </>
                  )}
                </NavLink>
              )}
              <NavLink to="/admin/logs" className={navLinkClass} onClick={onNavigate}>
                {({ isActive }) => (
                  <>
                    <NavIcon color="oklch(60% 0.02 50)" active={isActive} />
                    Logi
                  </>
                )}
              </NavLink>
            </div>
          </>
        )}
      </nav>
      <div className="space-y-2 border-t border-line px-3 py-3 text-sm text-parchment-dim">
        <div className="truncate">{user?.email}</div>
        <button
          onClick={handleLogout}
          className="w-full rounded-md border border-line-soft px-3 py-1.5 text-parchment-dim transition hover:bg-panel-raised"
        >
          Wyloguj
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children, mainClassName = "" }: { children: ReactNode; mainClassName?: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink">
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-ink/90 px-4 py-2.5 backdrop-blur md:px-6">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Otwórz menu"
          className="shrink-0 rounded-md border border-line-soft p-2 text-parchment-dim hover:bg-panel-raised md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <CharacterHeaderBar />
      </div>

      <div className="md:flex">
        <aside className="hidden w-60 shrink-0 border-r border-line bg-ink md:block">
          <SidebarContent />
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-30 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-ink shadow-xl">
              <SidebarContent onNavigate={() => setDrawerOpen(false)} />
            </aside>
          </div>
        )}

        <main className={`flex-1 px-4 py-6 md:px-8 ${mainClassName}`}>
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>

      <UpdateBanner />
    </div>
  );
}
