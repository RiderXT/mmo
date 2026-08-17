import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateCharacterClassSchema,
  CoreStatKeySchema,
  SkillKindSchema,
  SkillEffectTypeSchema,
  StatKeySchema,
  type CreateCharacterClassInput,
} from "@mmo/shared";
import { Field, inputClass } from "../../components/admin/Field";
import { ItemPickerFilterBar } from "../../components/admin/ItemPickerFilterBar";
import { useItemPickerFilter } from "../../hooks/useItemPickerFilter";
import { ApiError } from "../../lib/apiClient";
import { listClasses, createClass, updateClass, deleteClass, listItems, type ClassDto } from "../../lib/adminApi";

const CORE_STATS = CoreStatKeySchema.options;
const SKILL_KINDS = SkillKindSchema.options;
const EFFECT_TYPES = SkillEffectTypeSchema.options;
const TARGET_STATS = StatKeySchema.options;

function emptySkill() {
  return {
    name: "",
    description: "",
    kind: "passive" as const,
    scalingStat: "strength" as const,
    scalingFactor: 1,
    maxLevel: 10,
    targetStat: "attack" as const,
    effectType: undefined,
    cooldownSeconds: undefined,
  };
}

function emptyForm(): CreateCharacterClassInput {
  return {
    name: "",
    description: "",
    primaryStat: "strength",
    skills: Array.from({ length: 6 }, emptySkill),
    startingGold: 0,
    starterItems: [],
  };
}

function fromDto(cls: ClassDto): CreateCharacterClassInput {
  return {
    name: cls.name,
    description: cls.description,
    primaryStat: cls.primaryStat,
    skills: cls.skills.map((s) => ({
      name: s.name,
      description: s.description,
      kind: s.kind,
      scalingStat: s.scalingStat,
      scalingFactor: s.scalingFactor,
      maxLevel: s.maxLevel,
      targetStat: s.targetStat ?? undefined,
      effectType: s.effectType ?? undefined,
      cooldownSeconds: s.cooldownSeconds ?? undefined,
    })),
    startingGold: cls.startingGold,
    starterItems: cls.starterItems.map((s) => ({ itemId: s.itemId, quantity: s.quantity })),
  };
}

export function ClassesAdminPage() {
  const queryClient = useQueryClient();
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<CreateCharacterClassInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const itemPicker = useItemPickerFilter(itemsQuery.data);

  const saveMutation = useMutation({
    mutationFn: (input: CreateCharacterClassInput) =>
      editingId && editingId !== "new" ? updateClass(editingId, input) : createClass(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Błąd zapisu"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteClass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-classes"] }),
    onError: (err) => alert(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setEditingId("new");
  }

  function openEdit(cls: ClassDto) {
    setForm(fromDto(cls));
    setError(null);
    setEditingId(cls.id);
  }

  function handleSubmit() {
    const parsed = CreateCharacterClassSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    saveMutation.mutate(parsed.data);
  }

  function updateSkill(idx: number, patch: Partial<CreateCharacterClassInput["skills"][number]>) {
    const next = [...form.skills];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, skills: next });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-parchment">Klasy postaci</h1>
        <button
          onClick={openCreate}
          className=" bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          + Nowa klasa
        </button>
      </div>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Główny staty</th>
              <th className="px-3 py-2">Umiejętności</th>
              <th className="px-3 py-2">Start: złoto/itemy</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {classesQuery.data?.map((cls) => (
              <tr key={cls.id}>
                <td className="px-3 py-2 text-parchment">{cls.name}</td>
                <td className="px-3 py-2 text-parchment-dim">{cls.primaryStat}</td>
                <td className="px-3 py-2 text-parchment-dim">{cls.skills.length}</td>
                <td className="px-3 py-2 text-parchment-dim">
                  {cls.startingGold} / {cls.starterItems.length}
                </td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(cls)} className="text-gold-bright hover:underline">
                    Edytuj
                  </button>
                  <button
                    onClick={() => confirm(`Usunąć "${cls.name}"?`) && deleteMutation.mutate(cls.id)}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
            {classesQuery.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-parchment-faint">
                  Brak klas. Dodaj pierwszą.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <div className="mt-6 space-y-4 panel p-4">
          <h2 className="font-medium text-parchment">
            {editingId === "new" ? "Nowa klasa" : "Edycja klasy"}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nazwa">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Główny staty">
              <select
                className={inputClass}
                value={form.primaryStat}
                onChange={(e) => setForm({ ...form, primaryStat: e.target.value as CreateCharacterClassInput["primaryStat"] })}
              >
                {CORE_STATS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
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

          <Field label="Złoto startowe (przyznawane raz, przy utworzeniu postaci)">
            <input
              type="number"
              min={0}
              className={`${inputClass} sm:w-48`}
              value={form.startingGold}
              onChange={(e) => setForm({ ...form, startingGold: Number(e.target.value) })}
            />
          </Field>

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
              Przedmioty startowe (trafiają do ekwipunku raz, przy utworzeniu postaci)
            </p>
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
              {form.starterItems.map((entry, idx) => (
                <div key={`${idx}-${entry.itemId}`} className="flex flex-wrap items-center gap-2">
                  <select
                    className={`${inputClass} w-56`}
                    value={entry.itemId}
                    onChange={(e) => {
                      const next = [...form.starterItems];
                      next[idx] = { ...entry, itemId: e.target.value };
                      setForm({ ...form, starterItems: next });
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
                      const next = [...form.starterItems];
                      next[idx] = { ...entry, quantity: Number(e.target.value) };
                      setForm({ ...form, starterItems: next });
                    }}
                  />
                  <button
                    onClick={() => setForm({ ...form, starterItems: form.starterItems.filter((_, i) => i !== idx) })}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setForm({ ...form, starterItems: [...form.starterItems, { itemId: "", quantity: 1 }] })
                }
                className="text-sm text-gold-bright hover:underline"
              >
                + Dodaj przedmiot startowy
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-parchment-dim">Umiejętności ({form.skills.length})</p>
              <button
                onClick={() => setForm({ ...form, skills: [...form.skills, emptySkill()] })}
                className="text-sm text-gold-bright hover:underline"
              >
                + Dodaj umiejętność
              </button>
            </div>
            <div className="space-y-3">
              {form.skills.map((skill, idx) => (
                <div key={`${idx}-${skill.name}`} className=" border border-line p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      placeholder="nazwa"
                      className={inputClass}
                      value={skill.name}
                      onChange={(e) => updateSkill(idx, { name: e.target.value })}
                    />
                    <select
                      className={inputClass}
                      value={skill.kind}
                      onChange={(e) => updateSkill(idx, { kind: e.target.value as "passive" | "active" })}
                    >
                      {SKILL_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    <select
                      className={inputClass}
                      value={skill.scalingStat}
                      onChange={(e) => updateSkill(idx, { scalingStat: e.target.value as CreateCharacterClassInput["primaryStat"] })}
                    >
                      {CORE_STATS.map((s) => (
                        <option key={s} value={s}>
                          skaluje: {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    placeholder="opis"
                    className={`${inputClass} mt-2`}
                    value={skill.description}
                    onChange={(e) => updateSkill(idx, { description: e.target.value })}
                  />

                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <label className="flex items-center gap-2 text-xs text-parchment-dim">
                      mnożnik
                      <input
                        type="number"
                        step="0.01"
                        className={inputClass}
                        value={skill.scalingFactor}
                        onChange={(e) => updateSkill(idx, { scalingFactor: Number(e.target.value) })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-parchment-dim">
                      maks. poziom
                      <input
                        type="number"
                        className={inputClass}
                        value={skill.maxLevel}
                        onChange={(e) => updateSkill(idx, { maxLevel: Number(e.target.value) })}
                      />
                    </label>

                    {skill.kind === "passive" ? (
                      <label className="flex items-center gap-2 text-xs text-parchment-dim">
                        docelowy staty
                        <select
                          className={inputClass}
                          value={skill.targetStat ?? "attack"}
                          onChange={(e) => updateSkill(idx, { targetStat: e.target.value as CreateCharacterClassInput["skills"][number]["targetStat"] })}
                        >
                          {TARGET_STATS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="flex items-center gap-2 text-xs text-parchment-dim">
                        efekt
                        <select
                          className={inputClass}
                          value={skill.effectType ?? "damage"}
                          onChange={(e) => updateSkill(idx, { effectType: e.target.value as CreateCharacterClassInput["skills"][number]["effectType"] })}
                        >
                          {EFFECT_TYPES.map((e2) => (
                            <option key={e2} value={e2}>
                              {e2}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>

                  {skill.kind === "active" && (
                    <label className="mt-2 flex items-center gap-2 text-xs text-parchment-dim">
                      cooldown (s)
                      <input
                        type="number"
                        className={`${inputClass} w-24`}
                        value={skill.cooldownSeconds ?? 30}
                        onChange={(e) => updateSkill(idx, { cooldownSeconds: Number(e.target.value) })}
                      />
                    </label>
                  )}

                  <button
                    onClick={() => setForm({ ...form, skills: form.skills.filter((_, i) => i !== idx) })}
                    className="mt-2 text-xs text-red-400 hover:underline"
                  >
                    Usuń umiejętność
                  </button>
                </div>
              ))}
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
