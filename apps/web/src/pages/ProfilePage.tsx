import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { PanelFrame } from "../components/common/PanelFrame";
import { getCharacterProfile } from "../lib/profileApi";
import { STAT_LABELS, COMBAT_STAT_TO_STAT_KEY, formatBreakdownValue, formatStatValue } from "../lib/statFormat";

const CORE_LABELS = {
  strength: "Siła",
  vitality: "Witalność",
  dexterity: "Zręczność",
  intelligence: "Inteligencja",
} as const;

const DERIVED_KEYS = [
  "attack",
  "defense",
  "evasion",
  "attackSpeed",
  "critChance",
  "critDamage",
  "damageReduction",
  "movementSpeedPct",
] as const satisfies (keyof typeof COMBAT_STAT_TO_STAT_KEY)[];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "long", timeStyle: "short" });
}

export function ProfilePage() {
  const { characterId } = useParams<{ characterId: string }>();
  const profileQuery = useQuery({
    queryKey: ["profile", characterId],
    queryFn: () => getCharacterProfile(characterId!),
    enabled: !!characterId,
  });

  if (profileQuery.isLoading) {
    return (
      <AppShell>
        <p className="text-parchment-dim">Wczytywanie…</p>
      </AppShell>
    );
  }

  const profile = profileQuery.data;
  if (!profile) {
    return (
      <AppShell>
        <p className="text-parchment-dim">Nie znaleziono postaci.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PanelFrame title="Profil postaci">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold text-parchment">{profile.name}</h1>
              <span className="rounded border border-gold/50 bg-gold/10 px-1.5 py-0.5 text-[10px] font-bold text-gold">
                lvl. {profile.level}
              </span>
            </div>
            <p className="mt-1 text-sm text-parchment-dim">{profile.className ?? "Bez klasy"}</p>
          </div>
          <div className="text-right">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                profile.online
                  ? "border-rarity-uncommon/50 bg-rarity-uncommon/10 text-rarity-uncommon"
                  : "border-line-soft text-parchment-faint"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${profile.online ? "bg-rarity-uncommon" : "bg-parchment-faint"}`} />
              {profile.online ? "Online" : "Offline"}
            </span>
            {!profile.online && profile.lastSeenAt && (
              <p className="mt-1 text-xs text-parchment-faint">Ostatnia aktywność: {formatDate(profile.lastSeenAt)}</p>
            )}
          </div>
        </div>

        <div className="mt-3 grid gap-1 text-xs text-parchment-faint sm:grid-cols-2">
          <p>Data utworzenia postaci: {formatDate(profile.createdAt)}</p>
          <p>
            Lokalizacja:{" "}
            {profile.zoneName
              ? `${profile.zoneName} (${profile.zoneMinLevel}–${profile.zoneMaxLevel})`
              : "Nieznana"}
          </p>
        </div>
      </PanelFrame>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <PanelFrame title="Statystyki">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {(Object.keys(CORE_LABELS) as (keyof typeof CORE_LABELS)[]).map((key) => (
              <div key={key} className="flex items-center justify-between border border-line-soft bg-panel-raised px-2.5 py-1.5">
                <span className="text-parchment-dim">{CORE_LABELS[key]}</span>
                <span className="font-medium tabular-nums text-parchment">{profile.core[key]}</span>
              </div>
            ))}
          </div>
        </PanelFrame>

        <PanelFrame title="Statystyki pochodne">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {DERIVED_KEYS.map((key) => (
              <div key={key} className="flex items-center justify-between border border-line-soft bg-panel-raised px-2.5 py-1.5">
                <span className="text-parchment-dim">{STAT_LABELS[COMBAT_STAT_TO_STAT_KEY[key]]}</span>
                <span className="font-medium tabular-nums text-parchment">
                  {formatBreakdownValue(key, profile.derived[key])}
                </span>
              </div>
            ))}
          </div>
        </PanelFrame>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <PanelFrame title={`Ekwipunek — ${profile.equippedCount} / ${profile.totalEquipSlots} slotów założonych`}>
          {profile.equipmentBonuses.length === 0 ? (
            <p className="text-sm text-parchment-faint">Brak założonego ekwipunku.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {profile.equipmentBonuses.map((b) => (
                <li key={b.stat} className="flex items-center justify-between">
                  <span className="text-parchment-dim">{STAT_LABELS[b.stat]}</span>
                  <span className="font-medium tabular-nums text-gold-bright">{formatStatValue(b.stat, b.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </PanelFrame>

        <PanelFrame title="Umiejętności">
          {profile.skills.length === 0 ? (
            <p className="text-sm text-parchment-faint">Brak wykupionych umiejętności.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {profile.skills.map((s) => (
                <li key={s.name} className="flex items-center justify-between">
                  <span className="text-parchment-dim">{s.name}</span>
                  <span className="font-medium tabular-nums text-parchment">
                    {s.level}/{s.maxLevel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelFrame>
      </div>

      <PanelFrame title="Życiowe" className="mt-4">
        <div className="grid grid-cols-2 gap-2 text-sm sm:w-64">
          <div className="flex items-center justify-between border border-line-soft bg-panel-raised px-2.5 py-1.5">
            <span className="text-parchment-dim">Zabite potwory</span>
            <span className="font-medium tabular-nums text-parchment">{profile.monstersKilled}</span>
          </div>
          <div className="flex items-center justify-between border border-line-soft bg-panel-raised px-2.5 py-1.5">
            <span className="text-parchment-dim">Otwarte skrzynie</span>
            <span className="font-medium tabular-nums text-parchment">{profile.chestsOpened}</span>
          </div>
        </div>
      </PanelFrame>
    </AppShell>
  );
}
