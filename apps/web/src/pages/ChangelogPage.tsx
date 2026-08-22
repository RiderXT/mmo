import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { PanelFrame } from "../components/common/PanelFrame";
import { listChangelogEntries } from "../lib/changelogApi";

export function ChangelogPage() {
  const entriesQuery = useQuery({ queryKey: ["changelog"], queryFn: listChangelogEntries });
  const entries = entriesQuery.data ?? [];

  return (
    <AppShell>
      <PanelFrame title="Co nowego">
        {entries.length === 0 ? (
          <p className="text-sm text-parchment-faint">Brak jeszcze żadnych wpisów.</p>
        ) : (
          <ul className="space-y-4">
            {entries.map((e) => (
              <li key={e.id} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-gold-bright">{e.title}</h3>
                  <span className="shrink-0 text-xs text-parchment-faint">{new Date(e.createdAt).toLocaleDateString("pl-PL")}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-parchment-dim">{e.body}</p>
              </li>
            ))}
          </ul>
        )}
      </PanelFrame>
    </AppShell>
  );
}
