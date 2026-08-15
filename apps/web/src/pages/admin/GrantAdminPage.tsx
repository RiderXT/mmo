import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminGrantInput, AdminCharacterDto } from "@mmo/shared";
import { Field, inputClass } from "../../components/admin/Field";
import { ApiError } from "../../lib/apiClient";
import { listAllCharacters, grantToCharacter, listItems } from "../../lib/adminApi";

function emptyGrant(): AdminGrantInput {
  return { exp: 0, gold: 0, items: [] };
}

export function GrantAdminPage() {
  const queryClient = useQueryClient();
  const charactersQuery = useQuery({ queryKey: ["admin-characters"], queryFn: listAllCharacters });
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<AdminGrantInput>(emptyGrant());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

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
                        {itemsQuery.data?.map((i) => (
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
    </div>
  );
}
