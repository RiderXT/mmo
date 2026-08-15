import { useQuery } from "@tanstack/react-query";
import { getBalanceStats } from "../../lib/adminApi";

export function BalanceStatsPage() {
  const statsQuery = useQuery({ queryKey: ["admin-balance-stats"], queryFn: getBalanceStats });
  const stats = statsQuery.data;

  return (
    <div>
      <h1 className="text-lg font-semibold text-parchment">Statystyki balansu</h1>
      <p className="mt-1 text-sm text-parchment-dim">
        Agregacja z rzeczywistych, rozstrzygniętych ekspedycji ({stats?.expeditionsAnalyzed ?? 0}{" "}
        przeanalizowanych) — wskazówka do czego dostroić potworów/dropy/krainy.
      </p>

      {statsQuery.isLoading && <p className="mt-4 text-sm text-parchment-faint">Wczytywanie...</p>}

      {stats && (
        <div className="mt-4 space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-medium text-parchment">Potwory</h2>
            <div className="overflow-x-auto panel">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-panel text-parchment-dim">
                  <tr>
                    <th className="px-3 py-2">Potwór</th>
                    <th className="px-3 py-2">Starcia</th>
                    <th className="px-3 py-2">Wygrane</th>
                    <th className="px-3 py-2">Przegrane</th>
                    <th className="px-3 py-2">% wygranych</th>
                    <th className="px-3 py-2">Śr. obrażenia</th>
                    <th className="px-3 py-2">Śr. rundy</th>
                    <th className="px-3 py-2">Śr. potionów</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-ink">
                  {stats.byMonster.map((m) => (
                    <tr key={m.monsterName}>
                      <td className="px-3 py-2 text-parchment">{m.monsterName}</td>
                      <td className="px-3 py-2 text-parchment-dim">{m.encounters}</td>
                      <td className="px-3 py-2 text-parchment-dim">{m.wins}</td>
                      <td className="px-3 py-2 text-parchment-dim">{m.losses}</td>
                      <td className="px-3 py-2 text-parchment-dim">{m.winRatePct}%</td>
                      <td className="px-3 py-2 text-parchment-dim">{m.avgDamageTaken}</td>
                      <td className="px-3 py-2 text-parchment-dim">{m.avgRounds}</td>
                      <td className="px-3 py-2 text-parchment-dim">{m.avgPotionsUsed}</td>
                    </tr>
                  ))}
                  {stats.byMonster.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-parchment-faint">
                        Brak danych — potrzebne rozstrzygnięte ekspedycje z realną walką.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-parchment">Dropy itemów</h2>
            <div className="overflow-x-auto panel">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-panel text-parchment-dim">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Łącznie wypadło</th>
                    <th className="px-3 py-2">Ekspedycje z dropem</th>
                    <th className="px-3 py-2">Śr. na ekspedycję</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-ink">
                  {stats.byItem.map((i) => (
                    <tr key={i.itemId}>
                      <td className="px-3 py-2 text-parchment">{i.itemName}</td>
                      <td className="px-3 py-2 text-parchment-dim">{i.totalDropped}</td>
                      <td className="px-3 py-2 text-parchment-dim">{i.expeditionsWithDrop}</td>
                      <td className="px-3 py-2 text-parchment-dim">{i.dropsPerExpedition}</td>
                    </tr>
                  ))}
                  {stats.byItem.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-parchment-faint">
                        Brak danych o dropach.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-parchment">Krainy — exp/h i złoto/h</h2>
            <div className="overflow-x-auto panel">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-panel text-parchment-dim">
                  <tr>
                    <th className="px-3 py-2">Kraina</th>
                    <th className="px-3 py-2">Ekspedycje</th>
                    <th className="px-3 py-2">exp/h (walka)</th>
                    <th className="px-3 py-2">złoto/h (walka)</th>
                    <th className="px-3 py-2">exp/h (pełny cykl)</th>
                    <th className="px-3 py-2">złoto/h (pełny cykl)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-ink">
                  {stats.byZone.map((z) => (
                    <tr key={z.zoneId}>
                      <td className="px-3 py-2 text-parchment">{z.zoneName}</td>
                      <td className="px-3 py-2 text-parchment-dim">{z.expeditions}</td>
                      <td className="px-3 py-2 text-parchment-dim">{z.expPerHourCombat}</td>
                      <td className="px-3 py-2 text-parchment-dim">{z.goldPerHourCombat}</td>
                      <td className="px-3 py-2 text-parchment-dim">{z.expPerHourRoundTrip}</td>
                      <td className="px-3 py-2 text-parchment-dim">{z.goldPerHourRoundTrip}</td>
                    </tr>
                  ))}
                  {stats.byZone.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-parchment-faint">
                        Brak danych o krainach.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
