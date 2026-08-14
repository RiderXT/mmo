import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreateMonsterSchema, StatKeySchema, type CreateMonsterInput } from "@mmo/shared";
import { AppShell } from "../../components/AppShell";
import { Field, inputClass } from "../../components/admin/Field";
import { ApiError } from "../../lib/apiClient";
import {
  listMonsters,
  createMonster,
  updateMonster,
  deleteMonster,
  listItems,
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

  const items = itemsQuery.data ?? [];

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Potwory</h1>
        <button
          onClick={openCreate}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          + Nowy potwór
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Poziom</th>
              <th className="px-3 py-2">HP</th>
              <th className="px-3 py-2">Exp</th>
              <th className="px-3 py-2">Dropy</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950">
            {monstersQuery.data?.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2 text-slate-200">{m.name}</td>
                <td className="px-3 py-2 text-slate-400">{m.level}</td>
                <td className="px-3 py-2 text-slate-400">{m.hp}</td>
                <td className="px-3 py-2 text-slate-400">{m.expReward}</td>
                <td className="px-3 py-2 text-slate-400">{m.drops.length}</td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(m)} className="text-indigo-400 hover:underline">
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
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  Brak potworów. Dodaj pierwszego.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <div className="mt-6 space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-medium text-slate-100">
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
            <p className="mb-2 text-xs font-medium text-slate-400">Statystyki</p>
            <div className="flex flex-wrap gap-2">
              {STAT_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-1 text-xs text-slate-400">
                  {key}
                  <input
                    type="number"
                    className={`${inputClass} w-20`}
                    value={form.stats[key] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value === "" ? undefined : Number(e.target.value);
                      const nextStats = { ...form.stats };
                      if (value === undefined) delete nextStats[key];
                      else nextStats[key] = value;
                      setForm({ ...form, stats: nextStats });
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">Umiejętności</p>
            <div className="space-y-2">
              {form.skills.map((skill, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
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
                className="text-sm text-indigo-400 hover:underline"
              >
                + Dodaj umiejętność
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">
              Drop (co i z jaką szansą wypada z tego potwora)
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
                    step="0.01"
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
                  <input
                    type="number"
                    placeholder="min ilość"
                    className={`${inputClass} w-24`}
                    value={drop.minQty}
                    onChange={(e) => {
                      const next = [...form.drops];
                      next[idx] = { ...drop, minQty: Number(e.target.value) };
                      setForm({ ...form, drops: next });
                    }}
                  />
                  <input
                    type="number"
                    placeholder="max ilość"
                    className={`${inputClass} w-24`}
                    value={drop.maxQty}
                    onChange={(e) => {
                      const next = [...form.drops];
                      next[idx] = { ...drop, maxQty: Number(e.target.value) };
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
                  setForm({
                    ...form,
                    drops: [...form.drops, { itemId: "", dropChance: 0.1, minQty: 1, maxQty: 1 }],
                  })
                }
                className="text-sm text-indigo-400 hover:underline"
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
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Zapisz
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
