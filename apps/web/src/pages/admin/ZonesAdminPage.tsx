import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreateZoneSchema, type CreateZoneInput } from "@mmo/shared";
import { Field, inputClass } from "../../components/admin/Field";
import { ApiError } from "../../lib/apiClient";
import {
  listZones,
  createZone,
  updateZone,
  deleteZone,
  listMonsters,
  listItems,
  type ZoneDto,
} from "../../lib/adminApi";

function emptyForm(): CreateZoneInput {
  return { name: "", description: "", minLevel: 1, maxLevel: 10, travelTimeSeconds: 30, monsters: [], drops: [] };
}

function fromDto(zone: ZoneDto): CreateZoneInput {
  return {
    name: zone.name,
    description: zone.description,
    minLevel: zone.minLevel,
    maxLevel: zone.maxLevel,
    travelTimeSeconds: zone.travelTimeSeconds,
    monsters: zone.monsters.map((m) => ({
      monsterId: m.monsterId,
      spawnWeight: m.spawnWeight,
      maxCount: m.maxCount,
    })),
    drops: zone.drops.map((d) => ({ itemId: d.itemId, dropChance: d.dropChance })),
  };
}

export function ZonesAdminPage() {
  const queryClient = useQueryClient();
  const zonesQuery = useQuery({ queryKey: ["admin-zones"], queryFn: listZones });
  const monstersQuery = useQuery({ queryKey: ["admin-monsters"], queryFn: listMonsters });
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<CreateZoneInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: CreateZoneInput) =>
      editingId && editingId !== "new" ? updateZone(editingId, input) : createZone(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-zones"] });
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Błąd zapisu"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteZone,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-zones"] }),
    onError: (err) => alert(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setEditingId("new");
  }

  function openEdit(zone: ZoneDto) {
    setForm(fromDto(zone));
    setError(null);
    setEditingId(zone.id);
  }

  function handleSubmit() {
    const parsed = CreateZoneSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    saveMutation.mutate(parsed.data);
  }

  const monsters = monstersQuery.data ?? [];
  const items = itemsQuery.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-parchment">Krainy</h1>
        <button
          onClick={openCreate}
          className=" bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          + Nowa kraina
        </button>
      </div>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Poziomy</th>
              <th className="px-3 py-2">Podróż</th>
              <th className="px-3 py-2">Potwory</th>
              <th className="px-3 py-2">Dropy krainy</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {zonesQuery.data?.map((zone) => (
              <tr key={zone.id}>
                <td className="px-3 py-2 text-parchment">{zone.name}</td>
                <td className="px-3 py-2 text-parchment-dim">
                  {zone.minLevel}–{zone.maxLevel}
                </td>
                <td className="px-3 py-2 text-parchment-dim">{zone.travelTimeSeconds}s</td>
                <td className="px-3 py-2 text-parchment-dim">{zone.monsters.length}</td>
                <td className="px-3 py-2 text-parchment-dim">{zone.drops.length}</td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(zone)} className="text-gold-bright hover:underline">
                    Edytuj
                  </button>
                  <button
                    onClick={() => confirm(`Usunąć "${zone.name}"?`) && deleteMutation.mutate(zone.id)}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
            {zonesQuery.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-parchment-faint">
                  Brak krain. Dodaj pierwszą.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <div className="mt-6 space-y-4 panel p-4">
          <h2 className="font-medium text-parchment">
            {editingId === "new" ? "Nowa kraina" : "Edycja krainy"}
          </h2>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Nazwa">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Poziom min">
              <input
                type="number"
                className={inputClass}
                value={form.minLevel}
                onChange={(e) => setForm({ ...form, minLevel: Number(e.target.value) })}
              />
            </Field>
            <Field label="Poziom max">
              <input
                type="number"
                className={inputClass}
                value={form.maxLevel}
                onChange={(e) => setForm({ ...form, maxLevel: Number(e.target.value) })}
              />
            </Field>
            <Field label="Czas podróży (s)">
              <input
                type="number"
                className={inputClass}
                value={form.travelTimeSeconds}
                onChange={(e) => setForm({ ...form, travelTimeSeconds: Number(e.target.value) })}
              />
            </Field>
          </div>

          <Field label="Opis">
            <textarea
              className={inputClass}
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
              Potwory w tej krainie (jakie i ile)
            </p>
            <div className="space-y-2">
              {form.monsters.map((zm, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <select
                    className={`${inputClass} w-48`}
                    value={zm.monsterId}
                    onChange={(e) => {
                      const next = [...form.monsters];
                      next[idx] = { ...zm, monsterId: e.target.value };
                      setForm({ ...form, monsters: next });
                    }}
                  >
                    <option value="">wybierz potwora</option>
                    {monsters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (lvl {m.level})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="waga spawnu"
                    className={`${inputClass} w-32`}
                    value={zm.spawnWeight}
                    onChange={(e) => {
                      const next = [...form.monsters];
                      next[idx] = { ...zm, spawnWeight: Number(e.target.value) };
                      setForm({ ...form, monsters: next });
                    }}
                  />
                  <input
                    type="number"
                    placeholder="maks. liczba"
                    className={`${inputClass} w-32`}
                    value={zm.maxCount}
                    onChange={(e) => {
                      const next = [...form.monsters];
                      next[idx] = { ...zm, maxCount: Number(e.target.value) };
                      setForm({ ...form, monsters: next });
                    }}
                  />
                  <button
                    onClick={() => setForm({ ...form, monsters: form.monsters.filter((_, i) => i !== idx) })}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setForm({
                    ...form,
                    monsters: [...form.monsters, { monsterId: "", spawnWeight: 10, maxCount: 5 }],
                  })
                }
                className="text-sm text-gold-bright hover:underline"
              >
                + Dodaj potwora
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
              Dodatkowe dropy krainy (niezależne od konkretnego potwora)
            </p>
            <div className="space-y-2">
              {form.drops.map((drop, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <select
                    className={`${inputClass} w-48`}
                    value={drop.itemId}
                    onChange={(e) => {
                      const next = [...form.drops];
                      next[idx] = { ...drop, itemId: e.target.value };
                      setForm({ ...form, drops: next });
                    }}
                  >
                    <option value="">wybierz item</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.001"
                    min={0}
                    max={1}
                    placeholder="szansa 0-1"
                    className={`${inputClass} w-28`}
                    value={drop.dropChance}
                    onChange={(e) => {
                      const next = [...form.drops];
                      next[idx] = { ...drop, dropChance: Number(e.target.value) };
                      setForm({ ...form, drops: next });
                    }}
                  />
                  <button
                    onClick={() => setForm({ ...form, drops: form.drops.filter((_, i) => i !== idx) })}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setForm({ ...form, drops: [...form.drops, { itemId: "", dropChance: 0.01 }] })
                }
                className="text-sm text-gold-bright hover:underline"
              >
                + Dodaj drop
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
              className=" bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
            >
              Zapisz
            </button>
            <button
              onClick={() => setEditingId(null)}
              className=" border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
