import { useSearchParams } from "react-router-dom";
import { AppShell } from "../../components/AppShell";
import { SettingsAdminPage } from "./SettingsAdminPage";
import { ClassesAdminPage } from "./ClassesAdminPage";
import { ZonesAdminPage } from "./ZonesAdminPage";
import { MonstersAdminPage } from "./MonstersAdminPage";
import { ItemsAdminPage } from "./ItemsAdminPage";
import { GrantAdminPage } from "./GrantAdminPage";
import { BalanceStatsPage } from "./BalanceStatsPage";
import { EventsAdminPage } from "./EventsAdminPage";
import { NpcsAdminPage } from "./NpcsAdminPage";

const TABS = [
  { key: "general", label: "Ogólne", Component: SettingsAdminPage },
  { key: "classes", label: "Klasy", Component: ClassesAdminPage },
  { key: "zones", label: "Krainy", Component: ZonesAdminPage },
  { key: "monsters", label: "Potwory", Component: MonstersAdminPage },
  { key: "items", label: "Itemy", Component: ItemsAdminPage },
  { key: "events", label: "Eventy", Component: EventsAdminPage },
  { key: "npcs", label: "NPC", Component: NpcsAdminPage },
  { key: "testing", label: "Testowanie", Component: GrantAdminPage },
  { key: "balance", label: "Statystyki balansu", Component: BalanceStatsPage },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AdminSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey | null) ?? TABS[0].key;
  const active = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  return (
    <AppShell>
      <div className="flex flex-wrap gap-1 border-b border-line pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSearchParams({ tab: tab.key })}
            className={`px-3 py-1.5 text-sm transition ${
              tab.key === active.key ? "bg-gold text-ink" : "text-parchment-dim hover:bg-panel-raised"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <active.Component />
      </div>
    </AppShell>
  );
}
