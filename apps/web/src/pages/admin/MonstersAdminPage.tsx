import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreateMonsterSchema, StatKeySchema, type CreateMonsterInput } from "@mmo/shared";
import { Field, MiniField, inputClass } from "../../components/admin/Field";
import { ItemPickerFilterBar } from "../../components/admin/ItemPickerFilterBar";
import { useItemPickerFilter } from "../../hooks/useItemPickerFilter";
import { ApiError } from "../../lib/apiClient";
import { STAT_LABELS, statHint } from "../../lib/statFormat";
import {
  listMonsters,
  createMonster,
  updateMonster,
  deleteMonster,
  listItems,
  listClasses,
  type MonsterDto,
} from "../../lib/adminApi";

const STAT_KEYS = StatKeySchema.options;

function emptyForm(): CreateMonsterInput {
  return { name: "", level: 1, hp: 100, stats: {}, skills: [], expReward: 10, goldReward: 5, drops: [] };
}

function fromDto(monster: MonsterDto): CreateMonsterInput {
  return {
    name: monster.name,
    level: monster.level,
    hp: monster.hp,
    stats: monster.stats,
    skills: monster.skills,
    expReward: monster.expReward,
    goldReward: monster.goldReward,
    drops: monster.drops.map((d) => ({
      itemId: d.itemId,
      dropChance: d.dropChance,
      minQty: d.minQty,
      maxQty: d.maxQty,
    })),
  };
}

export function MonstersAdminPage() {
  const queryClient = useQueryClient();
  const monstersQuery = useQuery({ queryKey: ["admin-monsters"], queryFn: listMonsters });
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
  const dropItemPicker = useItemPickerFilter(itemsQuery.data);
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<CreateMonsterInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: CreateMonsterInput) =>
      editingId && editingId !== "new" ? updateMonster(editingId, input) : createMonster(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-monsters"] });
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Błąd zapisu"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMonster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-monsters"] }),
    onError: (err) => alert(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setEditingId("new");
  }

  function openEdit(monster: MonsterDto) {
    setForm(fromDto(monster));
    setError(null);
    setEditingId(monster.id);
  }

  function handleSubmit() {
    const parsed = CreateMonsterSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    saveMutation.mutate(parsed.data);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-parchment">Potwory</h1>
        <button
          onClick={openCreate}
          className=" bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          + Nowy potwór
        </button>
      </div>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Poziom</th>
              <th className="px-3 py-2">HP</th>
              <th className="px-3 py-2">Exp</th>
              <th className="px-3 py-2">Dropy</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {monstersQuery.data?.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2 text-parchment">{m.name}</td>
                <td className="px-3 py-2 text-parchment-dim">{m.level}</td>
                <td className="px-3 py-2 text-parchment-dim">{m.hp}</td>
                <td className="px-3 py-2 text-parchment-dim">{m.expReward}</td>
                <td className="px-3 py-2 text-parchment-dim">{m.drops.length}</td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(m)} className="text-gold-bright hover:underline">
                    Edytuj
                  </button>
                  <button
                    onClick={() => confirm(`Usunąć "${m.name}"?`) && deleteMutation.mutate(m.id)}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
            {monstersQuery.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-parchment-faint">
                  Brak potworów. Dodaj pierwszego.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <div className="mt-6 space-y-4 panel p-4">
          <h2 className="font-medium text-parchment">
            {editingId === "new" ? "Nowy potwór" : "Edycja potwora"}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nazwa">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Poziom">
              <input
                type="number"
                className={inputClass}
                value={form.level}
                onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}
              />
            </Field>
            <Field label="HP">
              <input
                type="number"
                className={inputClass}
                value={form.hp}
                onChange={(e) => setForm({ ...form, hp: Number(e.target.value) })}
              />
            </Field>
            <Field label="Exp za zabicie">
              <input
                type="number"
                className={inputClass}
                value={form.expReward}
                onChange={(e) => setForm({ ...form, expReward: Number(e.target.value) })}
              />
            </Field>
            <Field label="Złoto za zabicie">
              <input
                type="number"
                className={inputClass}
                value={form.goldReward}
                onChange={(e) => setForm({ ...form, goldReward: Number(e.target.value) })}
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
              Statystyki (wpływają na walkę — tylko "Atak" i "Obrona" są faktycznie używane przez
              silnik, reszta jest zarezerwowana na przyszłość)
            </p>
            <div className="flex flex-wrap gap-2">
              {STAT_KEYS.map((key) => (
                <MiniField key={key} label={`${STAT_LABELS[key]} (${statHint(key)})`}>
                  <input
                    type="number"
                    step="any"
                    className={`${inputClass} w-24`}
                    value={form.stats[key] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value === "" ? undefined : Number(e.target.value);
                      const nextStats = { ...form.stats };
                      if (value === undefined) delete nextStats[key];
                      else nextStats[key] = value;
                      setForm({ ...form, stats: nextStats });
                    }}
                  />
                </MiniField>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">Umiejętności</p>
            <div className="space-y-2">
              {form.skills.map((skill, idx) => (
                <div key={`${idx}-${skill.name}`} className="flex flex-wrap items-center gap-2">
                  <input
                    placeholder="nazwa"
                    className={`${inputClass} w-32`}
                    value={skill.name}
                    onChange={(e) => {
                      const next = [...form.skills];
                      next[idx] = { ...skill, name: e.target.value };
                      setForm({ ...form, skills: next });
                    }}
                  />
                  <input
                    placeholder="opis"
                    className={`${inputClass} flex-1`}
                    value={skill.description}
                    onChange={(e) => {
                      const next = [...form.skills];
                      next[idx] = { ...skill, description: e.target.value };
                      setForm({ ...form, skills: next });
                    }}
                  />
                  <input
                    type="number"
                    placeholder="moc"
                    className={`${inputClass} w-20`}
                    value={skill.power}
                    onChange={(e) => {
                      const next = [...form.skills];
                      next[idx] = { ...skill, power: Number(e.target.value) };
                      setForm({ ...form, skills: next });
                    }}
                  />
                  <button
                    onClick={() => setForm({ ...form, skills: form.skills.filter((_, i) => i !== idx) })}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setForm({ ...form, skills: [...form.skills, { name: "", description: "", power: 0 }] })
                }
                className="text-sm text-gold-bright hover:underline"
              >
                + Dodaj umiejętność
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
              Drop (co i z jaką szansą wypada z tego potwora)
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
                  <MiniField label="Szansa (0–1, np. 0.02 = 2%)">
                    <input
                      type="number"
                      step="0.01"
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
                  <MiniField label="Min ilość">
                    <input
                      type="number"
                      className={`${inputClass} w-24`}
                      value={drop.minQty}
                      onChange={(e) => {
                        const next = [...form.drops];
                        next[idx] = { ...drop, minQty: Number(e.target.value) };
                        setForm({ ...form, drops: next });
                      }}
                    />
                  </MiniField>
                  <MiniField label="Max ilość">
                    <input
                      type="number"
                      className={`${inputClass} w-24`}
                      value={drop.maxQty}
                      onChange={(e) => {
                        const next = [...form.drops];
                        next[idx] = { ...drop, maxQty: Number(e.target.value) };
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
                  setForm({
                    ...form,
                    drops: [...form.drops, { itemId: "", dropChance: 0.1, minQty: 1, maxQty: 1 }],
                  })
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
