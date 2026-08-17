import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreateZoneSchema, type CreateZoneInput } from "@mmo/shared";
import { Field, MiniField, inputClass } from "../../components/admin/Field";
import { ItemPickerFilterBar } from "../../components/admin/ItemPickerFilterBar";
import { useItemPickerFilter } from "../../hooks/useItemPickerFilter";
import { ApiError } from "../../lib/apiClient";
import {
  listZones,
  createZone,
  updateZone,
  deleteZone,
  listMonsters,
  listItems,
  listClasses,
  type ZoneDto,
} from "../../lib/adminApi";

function emptyForm(): CreateZoneInput {
  return {
    name: "",
    description: "",
    minLevel: 1,
    maxLevel: 10,
    travelTimeSeconds: 30,
    isTown: false,
    allowRevisitAboveLevel: false,
    monsters: [],
    drops: [],
  };
}

function fromDto(zone: ZoneDto): CreateZoneInput {
  return {
    name: zone.name,
    description: zone.description,
    minLevel: zone.minLevel,
    maxLevel: zone.maxLevel,
    travelTimeSeconds: zone.travelTimeSeconds,
    isTown: zone.isTown,
    allowRevisitAboveLevel: zone.allowRevisitAboveLevel,
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
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
  const dropItemPicker = useItemPickerFilter(itemsQuery.data);
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
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Poziomy</th>
              <th className="px-3 py-2">Podróż</th>
              <th className="px-3 py-2">Potwory</th>
              <th className="px-3 py-2">Dropy krainy</th>
              <th className="px-3 py-2">Zbieractwo</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {zonesQuery.data?.map((zone) => (
              <tr key={zone.id}>
                <td className="px-3 py-2 text-parchment">{zone.name}</td>
                <td className="px-3 py-2 text-parchment-dim">{zone.isTown ? "Miasto" : "Dzicz"}</td>
                <td className="px-3 py-2 text-parchment-dim">
                  {zone.minLevel}–{zone.maxLevel}
                </td>
                <td className="px-3 py-2 text-parchment-dim">{zone.travelTimeSeconds}s</td>
                <td className="px-3 py-2 text-parchment-dim">{zone.monsters.length}</td>
                <td className="px-3 py-2 text-parchment-dim">{zone.drops.length}</td>
                <td className="px-3 py-2 text-parchment-dim">
                  {[zone.fishingSpot && "Łowisko", zone.mine && "Kopalnia"].filter(Boolean).join(", ") || "—"}
                </td>
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
                <td colSpan={7} className="px-3 py-6 text-center text-parchment-faint">
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

          <label className="flex items-center gap-2 text-sm text-parchment-dim">
            <input
              type="checkbox"
              checked={form.isTown}
              onChange={(e) => setForm({ ...form, isTown: e.target.checked })}
            />
            Kraina typu miasto (bez potworów, z listą NPC zamiast walki)
          </label>

          <label className="flex items-center gap-2 text-sm text-parchment-dim">
            <input
              type="checkbox"
              checked={form.allowRevisitAboveLevel}
              onChange={(e) => setForm({ ...form, allowRevisitAboveLevel: e.target.checked })}
            />
            Można wrócić mimo przekroczenia górnego limitu poziomu (np. dla łowiska/kopalni)
          </label>

          <Field label="Opis">
            <textarea
              className={inputClass}
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          {!form.isTown && (
          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
              Potwory w tej krainie (jakie i ile)
            </p>
            <div className="space-y-2">
              {form.monsters.map((zm, idx) => (
                <div key={`${idx}-${zm.monsterId}`} className="flex flex-wrap items-end gap-2">
                  <MiniField label="Potwór">
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
                  </MiniField>
                  <MiniField label="Waga spawnu (względna, nie %; wyższa = częściej losowany)">
                    <input
                      type="number"
                      className={`${inputClass} w-32`}
                      value={zm.spawnWeight}
                      onChange={(e) => {
                        const next = [...form.monsters];
                        next[idx] = { ...zm, spawnWeight: Number(e.target.value) };
                        setForm({ ...form, monsters: next });
                      }}
                    />
                  </MiniField>
                  <MiniField label="Maks. liczba (obecnie nieużywane przez silnik walki)">
                    <input
                      type="number"
                      className={`${inputClass} w-32`}
                      value={zm.maxCount}
                      onChange={(e) => {
                        const next = [...form.monsters];
                        next[idx] = { ...zm, maxCount: Number(e.target.value) };
                        setForm({ ...form, monsters: next });
                      }}
                    />
                  </MiniField>
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
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
              Dodatkowe dropy krainy (niezależne od konkretnego potwora)
            </p>
            <ItemPickerFilterBar
              search={dropItemPicker.search}
              onSearchChange={dropItemPicker.setSearch}
              typeFilter={dropItemPicker.typeFilter}
              onTypeFilterChange={dropItemPicker.setTypeFilter}
              classFilter={dropItemPicker.classFilter}
              onClassFilterChange={dropItemPicker.setClassFilter}
              classes={classesQuery.data}
              filteredCount={dropItemPicker.filtered.length}
              total={dropItemPicker.total}
            />
            <div className="space-y-2">
              {form.drops.map((drop, idx) => (
                <div key={`${idx}-${drop.itemId}`} className="flex flex-wrap items-end gap-2">
                  <MiniField label="Przedmiot">
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
                      {dropItemPicker.filtered.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </MiniField>
                  <MiniField label="Szansa (0–1, np. 0.02 = 2%; sprawdzana osobno po każdej wygranej walce w tej krainie)">
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      max={1}
                      className={`${inputClass} w-28`}
                      value={drop.dropChance}
                      onChange={(e) => {
                        const next = [...form.drops];
                        next[idx] = { ...drop, dropChance: Number(e.target.value) };
                        setForm({ ...form, drops: next });
                      }}
                    />
                  </MiniField>
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

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

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
