import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { listRanking } from "../lib/rankingApi";
import { listPlayerClasses } from "../lib/classesApi";

export function RankingPage() {
  const [classId, setClassId] = useState<string | null>(null);

  const classesQuery = useQuery({ queryKey: ["classes"], queryFn: listPlayerClasses });
  const rankingQuery = useQuery({
    queryKey: ["ranking", classId],
    queryFn: () => listRanking(classId ?? undefined),
  });

  return (
    <AppShell>
      <div className="panel p-4">
        <h1 className="font-display text-lg font-bold text-parchment">Ranking</h1>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setClassId(null)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              classId === null
                ? "border-gold bg-gold/10 text-gold-bright"
                : "border-line-soft text-parchment-dim hover:bg-panel-raised"
            }`}
          >
            Wszyscy
          </button>
          {classesQuery.data?.map((c) => (
            <button
              key={c.id}
              onClick={() => setClassId(c.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                classId === c.id
                  ? "border-gold bg-gold/10 text-gold-bright"
                  : "border-line-soft text-parchment-dim hover:bg-panel-raised"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-parchment-dim">
              <tr>
                <th className="py-1 pr-3">#</th>
                <th className="px-2 py-1">Postać</th>
                <th className="px-2 py-1">Klasa</th>
                <th className="px-2 py-1 text-right">Poziom</th>
                <th className="py-1 pl-2 text-right">Exp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rankingQuery.data?.map((entry, idx) => (
                <tr key={entry.id}>
                  <td className="py-1.5 pr-3 text-parchment-faint">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${entry.online ? "bg-rarity-uncommon" : "bg-parchment-faint"}`} />
                      <Link to={`/profile/${entry.id}`} className="text-parchment hover:text-gold-bright">
                        {entry.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-parchment-dim">{entry.className ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums text-parchment">{entry.level}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-parchment-dim">{entry.exp}</td>
                </tr>
              ))}
              {rankingQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-parchment-faint">
                    Brak postaci.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
