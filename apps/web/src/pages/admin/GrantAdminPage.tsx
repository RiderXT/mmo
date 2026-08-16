import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminGrantInput, AdminCharacterDto } from "@mmo/shared";
import { Field, inputClass } from "../../components/admin/Field";
import { ItemPickerFilterBar } from "../../components/admin/ItemPickerFilterBar";
import { useItemPickerFilter } from "../../hooks/useItemPickerFilter";
import { ApiError } from "../../lib/apiClient";
import {
  listAllCharacters,
  grantToCharacter,
  listItems,
  listClasses,
  revertExpedition,
  resolveFlaggedExpedition,
  listFlaggedExpeditions,
  type RevertExpeditionResult,
} from "../../lib/adminApi";

function emptyGrant(): AdminGrantInput {
  return { exp: 0, gold: 0, items: [] };
}

export function GrantAdminPage() {
  const queryClient = useQueryClient();
  const charactersQuery = useQuery({ queryKey: ["admin-characters"], queryFn: listAllCharacters });
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
  const flaggedQuery = useQuery({ queryKey: ["flagged-expeditions"], queryFn: listFlaggedExpeditions });

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<AdminGrantInput>(emptyGrant());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const itemPicker = useItemPickerFilter(itemsQuery.data);
  const [revertId, setRevertId] = useState("");
  const [revertError, setRevertError] = useState<string | null>(null);
  const [revertResult, setRevertResult] = useState<RevertExpeditionResult | null>(null);
  const [resolveId, setResolveId] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveResult, setResolveResult] = useState<string | null>(null);

  const characters = charactersQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) => c.name.toLowerCase().includes(q) || c.ownerEmail.toLowerCase().includes(q),
    );
  }, [characters, search]);

  const selected: AdminCharacterDto | undefined = characters.find((c) => c.id === selectedId);

  const grantMutation = useMutation({
    mutationFn: (input: AdminGrantInput) => grantToCharacter(selectedId!, input),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-characters"] });
      setError(null);
      setResult(
        res.levelsGained > 0
          ? `Wykonano. Postać awansowała o ${res.levelsGained} poz. (teraz poz. ${res.newLevel}).`
          : "Wykonano.",
      );
      setForm(emptyGrant());
      setTimeout(() => setResult(null), 4000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się wykonać"),
  });

  const revertMutation = useMutation({
    mutationFn: (expeditionId: string) => revertExpedition(expeditionId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-characters"] });
      setRevertError(null);
      setRevertResult(res);
    },
    onError: (err) => {
      setRevertResult(null);
      setRevertError(err instanceof ApiError ? err.message : "Nie udało się cofnąć ekspedycji");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, grant }: { id: string; grant: boolean }) => resolveFlaggedExpedition(id, grant),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-characters"] });
      queryClient.invalidateQueries({ queryKey: ["flagged-expeditions"] });
      setResolveError(null);
      setResolveResult(res.granted ? "Przyznano nagrodę mimo blokady." : "Odrzucono — nagroda nie została przyznana, slot ekspedycji zwolniony.");
    },
    onError: (err) => {
      setResolveResult(null);
      setResolveError(err instanceof ApiError ? err.message : "Nie udało się rozwiązać zablokowanej ekspedycji");
    },
  });

  function selectCharacter(id: string) {
    setSelectedId(id);
    setForm(emptyGrant());
    setError(null);
    setResult(null);
  }

  function handleSubmit() {
    if (!selectedId) return;
    grantMutation.mutate({
      exp: form.exp || 0,
      gold: form.gold || 0,
      items: form.items.filter((i) => i.itemId),
    });
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-parchment">Testowanie — dodaj exp/złoto/itemy</h1>
      <p className="mt-1 text-sm text-parchment-dim">
        Narzędzie testowe admina — pozwala od razu zmienić stan dowolnej postaci, bez przechodzenia
        przez ekspedycje.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="panel p-3">
          <input
            className={inputClass}
            placeholder="Szukaj po nazwie postaci lub emailu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {charactersQuery.isLoading && (
            <p className="mt-3 text-sm text-parchment-faint">Wczytywanie...</p>
          )}
          {charactersQuery.isError && (
            <p className="mt-3 text-sm text-red-400">
              Nie udało się wczytać postaci:{" "}
              {charactersQuery.error instanceof ApiError
                ? charactersQuery.error.message
                : "błąd sieci"}
            </p>
          )}
          <div className="mt-3 max-h-[28rem] divide-y divide-line overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCharacter(c.id)}
                className={`block w-full px-2 py-2 text-left text-sm transition ${
                  c.id === selectedId ? "bg-gold text-ink" : "text-parchment-dim hover:bg-panel-raised"
                }`}
              >
                <div className="font-medium">
                  {c.name} <span className="opacity-70">(poz. {c.level})</span>
                </div>
                <div className="text-xs opacity-70">{c.ownerEmail}</div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-parchment-faint">Brak wyników.</p>
            )}
          </div>
        </div>

        <div className="panel p-4">
          {!selected && <p className="text-sm text-parchment-faint">Wybierz postać z listy.</p>}

          {selected && (
            <div className="space-y-4">
              <div>
                <h2 className="font-medium text-parchment">{selected.name}</h2>
                <p className="text-sm text-parchment-dim">
                  poz. {selected.level} &middot; exp {selected.exp} &middot; złoto {selected.gold} &middot;{" "}
                  {selected.ownerEmail}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Dodaj exp">
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={form.exp ?? 0}
                    onChange={(e) => setForm({ ...form, exp: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Dodaj złoto">
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={form.gold ?? 0}
                    onChange={(e) => setForm({ ...form, gold: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-parchment-dim">Dodaj itemy do ekwipunku</p>
                <ItemPickerFilterBar
                  search={itemPicker.search}
                  onSearchChange={itemPicker.setSearch}
                  typeFilter={itemPicker.typeFilter}
                  onTypeFilterChange={itemPicker.setTypeFilter}
                  classFilter={itemPicker.classFilter}
                  onClassFilterChange={itemPicker.setClassFilter}
                  classes={classesQuery.data}
                  filteredCount={itemPicker.filtered.length}
                  total={itemPicker.total}
                />
                <div className="space-y-2">
                  {form.items.map((entry, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2">
                      <select
                        className={`${inputClass} w-56`}
                        value={entry.itemId}
                        onChange={(e) => {
                          const next = [...form.items];
                          next[idx] = { ...entry, itemId: e.target.value };
                          setForm({ ...form, items: next });
                        }}
                      >
                        <option value="">wybierz item</option>
                        {itemPicker.filtered.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        placeholder="ilość"
                        className={`${inputClass} w-20`}
                        value={entry.quantity}
                        onChange={(e) => {
                          const next = [...form.items];
                          next[idx] = { ...entry, quantity: Number(e.target.value) };
                          setForm({ ...form, items: next });
                        }}
                      />
                      <button
                        onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })}
                        className="text-red-400 hover:underline"
                      >
                        Usuń
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setForm({ ...form, items: [...form.items, { itemId: "", quantity: 1 }] })
                    }
                    className="text-sm text-gold-bright hover:underline"
                  >
                    + Dodaj item
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
              {result && <p className="text-sm text-rarity-uncommon">{result}</p>}

              <button
                onClick={handleSubmit}
                disabled={grantMutation.isPending}
                className=" bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
              >
                Wykonaj
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 panel p-4">
        <h2 className="font-medium text-parchment">Cofnij ekspedycję</h2>
        <p className="mt-1 text-sm text-parchment-dim">
          Cofa exp, złoto, poziomy i wypadnięte przedmioty przyznane przez jedną (już rozliczoną)
          ekspedycję — narzędzie naprawcze na wypadek błędu balansu, np. nienaturalnie szybkiego
          awansu. Nie da się cofnąć ekspedycji dwukrotnie. Usuwanie przedmiotów jest robione "na
          tyle, ile się da" — jeśli gracz zdążył je zużyć/sprzedać, brakująca część zostanie
          zgłoszona poniżej zamiast zepsuć resztę ekwipunku.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} w-72`}
            placeholder="ID ekspedycji (z panelu Logi, pole expeditionId)"
            value={revertId}
            onChange={(e) => setRevertId(e.target.value)}
          />
          <button
            onClick={() => {
              if (!revertId.trim()) return;
              if (
                confirm(
                  "Cofnąć nagrody z tej ekspedycji? Tej operacji nie da się ponowić na tej samej ekspedycji.",
                )
              ) {
                revertMutation.mutate(revertId.trim());
              }
            }}
            disabled={revertMutation.isPending || !revertId.trim()}
            className=" border border-red-400 px-4 py-1.5 text-sm font-medium text-red-400 hover:bg-red-400/10 disabled:opacity-50"
          >
            Cofnij
          </button>
        </div>
        {revertError && <p className="mt-2 text-sm text-red-400">{revertError}</p>}
        {revertResult && (
          <div className="mt-3 space-y-1 border border-line bg-ink/60 p-3 text-sm">
            <p className="text-parchment">
              Cofnięto: -{revertResult.reverted.expGained} exp, -{revertResult.reverted.goldGained} złota,
              -{revertResult.reverted.monstersDefeated} pokonanych potworów.
            </p>
            <p className="text-parchment-dim">
              Poziom: {revertResult.levelBefore} → {revertResult.levelAfter} (exp: {revertResult.expBefore} →{" "}
              {revertResult.expAfter})
            </p>
            {revertResult.reverted.loot.length > 0 && (
              <p className="text-parchment-dim">
                Przedmioty do usunięcia: {revertResult.reverted.loot.map((l) => `${l.itemId}×${l.quantity}`).join(", ")}
              </p>
            )}
            {revertResult.shortfalls.length > 0 ? (
              <p className="text-gold-bright">
                Uwaga — nie znaleziono pełnej ilości niektórych przedmiotów (pewnie już zużyte/sprzedane):{" "}
                {revertResult.shortfalls
                  .map((s) => `${s.itemId} (usunięto ${s.removed}/${s.requested})`)
                  .join(", ")}
              </p>
            ) : (
              <p className="text-rarity-uncommon">Wszystkie przedmioty z tej ekspedycji zostały usunięte.</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 panel p-4">
        <h2 className="font-medium text-parchment">Zablokowane ekspedycje (kod SUSPICIOUS_LEVEL_JUMP)</h2>
        <p className="mt-1 text-sm text-parchment-dim">
          Gdy jedna ekspedycja przyznałaby więcej niż 10 poziomów naraz, system automatycznie
          wstrzymuje wypłatę zamiast ją przyznać — ekspedycja dostaje status "flagged". Postać nie
          jest przez to blokowana (gra dalej normalnie), tylko ta jedna nagroda czeka tutaj na
          decyzję: przyznać mimo blokady (jeśli to jednak uzasadnione), albo odrzucić bez nagrody.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-panel text-parchment-dim">
              <tr>
                <th className="px-3 py-2">Postać</th>
                <th className="px-3 py-2">Kraina</th>
                <th className="px-3 py-2">Kiedy</th>
                <th className="px-3 py-2">Nagroda (wstrzymana)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-ink">
              {flaggedQuery.data?.map((exp) => (
                <tr key={exp.id}>
                  <td className="px-3 py-2 text-parchment">{exp.characterName}</td>
                  <td className="px-3 py-2 text-parchment-dim">{exp.zoneName}</td>
                  <td className="px-3 py-2 text-parchment-dim">{new Date(exp.startedAt).toLocaleString("pl-PL")}</td>
                  <td className="px-3 py-2 text-parchment-dim">
                    +{exp.result.expGained} exp · +{exp.result.goldGained} złota ·{" "}
                    {exp.result.loot.length === 0
                      ? "brak przedmiotów"
                      : exp.result.loot
                          .map((l) => `${itemsQuery.data?.find((i) => i.id === l.itemId)?.name ?? l.itemId} ×${l.quantity}`)
                          .join(", ")}
                  </td>
                  <td className="space-x-2 px-3 py-2 text-right">
                    <button
                      onClick={() => resolveMutation.mutate({ id: exp.id, grant: true })}
                      disabled={resolveMutation.isPending}
                      className="border border-gold px-3 py-1 text-xs font-medium text-gold-bright hover:bg-gold/10 disabled:opacity-50"
                    >
                      Przyznaj mimo to
                    </button>
                    <button
                      onClick={() =>
                        confirm("Odrzucić nagrodę z tej ekspedycji bez przyznawania?") &&
                        resolveMutation.mutate({ id: exp.id, grant: false })
                      }
                      disabled={resolveMutation.isPending}
                      className="border border-line-soft px-3 py-1 text-xs text-parchment-dim hover:bg-panel-raised disabled:opacity-50"
                    >
                      Odrzuć
                    </button>
                  </td>
                </tr>
              ))}
              {flaggedQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-parchment-faint">
                    Brak zablokowanych ekspedycji.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-parchment-faint">
            Rozwiąż ręcznie po ID (np. gdy masz ID z innego źródła)
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} w-72`}
              placeholder="ID zablokowanej ekspedycji"
              value={resolveId}
              onChange={(e) => setResolveId(e.target.value)}
            />
            <button
              onClick={() => resolveId.trim() && resolveMutation.mutate({ id: resolveId.trim(), grant: true })}
              disabled={resolveMutation.isPending || !resolveId.trim()}
              className=" border border-gold px-3 py-1.5 text-sm font-medium text-gold-bright hover:bg-gold/10 disabled:opacity-50"
            >
              Przyznaj mimo to
            </button>
            <button
              onClick={() =>
                resolveId.trim() &&
                confirm("Odrzucić nagrodę z tej ekspedycji bez przyznawania?") &&
                resolveMutation.mutate({ id: resolveId.trim(), grant: false })
              }
              disabled={resolveMutation.isPending || !resolveId.trim()}
              className=" border border-line-soft px-3 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised disabled:opacity-50"
            >
              Odrzuć (bez nagrody)
            </button>
          </div>
        </details>
        {resolveError && <p className="mt-2 text-sm text-red-400">{resolveError}</p>}
        {resolveResult && <p className="mt-2 text-sm text-rarity-uncommon">{resolveResult}</p>}
      </div>
    </div>
  );
}
