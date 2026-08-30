import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateCharacterClassSchema,
  CoreStatKeySchema,
  SkillKindSchema,
  SkillEffectTypeSchema,
  StatKeySchema,
  SkillCategorySchema,
  type CreateCharacterClassInput,
  type SkillCategory,
} from "@mmo/shared";
import { Field, inputClass } from "../../components/admin/Field";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { ItemPickerFilterBar } from "../../components/admin/ItemPickerFilterBar";
import { useItemPickerFilter } from "../../hooks/useItemPickerFilter";
import { ApiError, API_URL } from "../../lib/apiClient";
import {
  listClasses,
  createClass,
  updateClass,
  deleteClass,
  listItems,
  uploadClassSkillImage,
  uploadSkillNodeImage,
  type ClassDto,
} from "../../lib/adminApi";

const CORE_STATS = CoreStatKeySchema.options;
const SKILL_KINDS = SkillKindSchema.options;
const EFFECT_TYPES = SkillEffectTypeSchema.options;
const TARGET_STATS = StatKeySchema.options;
const SKILL_CATEGORIES = SkillCategorySchema.options;
const CATEGORY_LABELS: Record<SkillCategory, string> = {
  combat: "Walka",
  survival: "Przetrwanie",
  tactics: "Taktyka",
};
const EFFECT_TYPE_LABELS: Record<(typeof EFFECT_TYPES)[number], string> = {
  damage: "obrażenia",
  heal: "leczenie",
  attack_speed: "szybkość ataku",
  defense: "obrona",
  crit: "krytyk",
  block_chance: "szansa na blok",
  stun: "szansa na ogłuszenie",
  poison: "szansa na otrucie",
  reflect: "szansa na odbicie ciosu",
};
// Only these effect types grant a temporary self-buff with its own duration (see combat.ts) —
// damage/heal are instant, stun/poison are a one-shot proc against the monster.
const BUFF_EFFECT_TYPES = new Set(["attack_speed", "defense", "crit", "block_chance", "reflect"]);

// A React `key` must stay stable across keystrokes — using `skill.name`/`node.name` in the key
// (as this used to) remounts the whole card, and its inputs, on every character typed, which is
// why the name field lost focus after one letter. `_key` is a form-local id, generated once per
// entry and never touched by user input; the schema strips it on submit (plain z.object default).
function newFormKey() {
  return Math.random().toString(36).slice(2);
}

function emptySkill(): SkillFormValue {
  return {
    _key: newFormKey(),
    name: "",
    description: "",
    kind: "passive" as const,
    scalingStat: "strength" as const,
    scalingFactor: 1,
    unlockCost: 1,
    maxLevel: 1,
    levelMagnitudePct: 0,
    bookGateFromLevel: undefined,
    bookRequirements: [],
    targetStat: "attack" as const,
    effectType: undefined,
    cooldownSeconds: undefined,
    baseManaCost: undefined,
    durationSeconds: undefined,
    category: "combat" as const,
    nodes: [],
  };
}

function emptyNode(): NodeFormValue {
  return {
    _key: newFormKey(),
    name: "",
    description: "",
    effect: "magnitude" as const,
    magnitudePct: 0.1,
    pointCost: 1,
    maxLevel: 1,
    requiresNodeName: null,
  };
}

function emptyBookRequirement(level: number): BookRequirementFormValue {
  return { _key: newFormKey(), level, booksRequired: 1 };
}

type NodeFormValue = CreateCharacterClassInput["skills"][number]["nodes"][number] & { _key: string };
type BookRequirementFormValue = CreateCharacterClassInput["skills"][number]["bookRequirements"][number] & {
  _key: string;
};
type SkillFormValue = Omit<CreateCharacterClassInput["skills"][number], "nodes" | "bookRequirements"> & {
  _key: string;
  nodes: NodeFormValue[];
  bookRequirements: BookRequirementFormValue[];
};
type FormValue = Omit<CreateCharacterClassInput, "skills"> & { skills: SkillFormValue[] };

function emptyForm(): FormValue {
  return {
    name: "",
    description: "",
    primaryStat: "strength",
    skills: Array.from({ length: 6 }, emptySkill),
    startingGold: 0,
    starterItems: [],
  };
}

function fromDto(cls: ClassDto): FormValue {
  return {
    name: cls.name,
    description: cls.description,
    primaryStat: cls.primaryStat,
    skills: cls.skills.map((s) => {
      const nodeNameById = new Map(s.nodes.map((n) => [n.id, n.name]));
      return {
        _key: newFormKey(),
        name: s.name,
        description: s.description,
        kind: s.kind,
        scalingStat: s.scalingStat,
        scalingFactor: s.scalingFactor,
        unlockCost: s.unlockCost,
        maxLevel: s.maxLevel,
        levelMagnitudePct: s.levelMagnitudePct,
        bookGateFromLevel: s.bookGateFromLevel ?? undefined,
        bookRequirements: s.bookRequirements.map((r) => ({ _key: newFormKey(), level: r.level, booksRequired: r.booksRequired })),
        targetStat: s.targetStat ?? undefined,
        effectType: s.effectType ?? undefined,
        cooldownSeconds: s.cooldownSeconds ?? undefined,
        baseManaCost: s.baseManaCost ?? undefined,
        durationSeconds: s.durationSeconds ?? undefined,
        category: s.category,
        nodes: s.nodes.map((n) => ({
          _key: newFormKey(),
          name: n.name,
          description: n.description,
          effect: n.effect,
          magnitudePct: n.magnitudePct,
          pointCost: n.pointCost,
          maxLevel: n.maxLevel,
          requiresNodeName: n.requiresNodeId ? (nodeNameById.get(n.requiresNodeId) ?? null) : null,
        })),
      };
    }),
    startingGold: cls.startingGold,
    starterItems: cls.starterItems.map((s) => ({ itemId: s.itemId, quantity: s.quantity })),
  };
}

export function ClassesAdminPage() {
  const queryClient = useQueryClient();
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<FormValue>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  // Icons are uploaded per-id against the SAVED class (see uploadItemImage precedent) — the form
  // only holds by-name input values, so lookups below cross-reference the live query data by
  // (skill name, node name) to find each entity's id/imageUrl.
  const uploadSkillImageMutation = useMutation({
    mutationFn: ({ skillId, file }: { skillId: string; file: File }) => uploadClassSkillImage(skillId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-classes"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się wgrać ikony"),
  });
  const uploadNodeImageMutation = useMutation({
    mutationFn: ({ nodeId, file }: { nodeId: string; file: File }) => uploadSkillNodeImage(nodeId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-classes"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się wgrać ikony"),
  });
  const editingClass = editingId && editingId !== "new" ? classesQuery.data?.find((c) => c.id === editingId) : undefined;

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

  function updateSkill(idx: number, patch: Partial<SkillFormValue>) {
    const next = [...form.skills];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, skills: next });
  }

  function updateNode(skillIdx: number, nodeIdx: number, patch: Partial<NodeFormValue>) {
    const skill = form.skills[skillIdx];
    const nextNodes = [...skill.nodes];
    nextNodes[nodeIdx] = { ...nextNodes[nodeIdx], ...patch };
    updateSkill(skillIdx, { nodes: nextNodes });
  }

  function updateBookRequirement(skillIdx: number, reqIdx: number, patch: Partial<BookRequirementFormValue>) {
    const skill = form.skills[skillIdx];
    const next = [...skill.bookRequirements];
    next[reqIdx] = { ...next[reqIdx], ...patch };
    updateSkill(skillIdx, { bookRequirements: next });
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
                    onClick={() => setConfirmDeleteId(cls.id)}
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

      {deleteError && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {deleteError}
        </p>
      )}

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
              {form.skills.map((skill, idx) => {
                const skillDto = editingClass?.skills.find((s) => s.name === skill.name);
                return (
                <div key={skill._key} className=" border border-line p-3">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-line-soft bg-panel-raised">
                      {skillDto?.imageUrl ? (
                        <img src={`${API_URL}${skillDto.imageUrl}`} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-[9px] text-parchment-faint">brak</span>
                      )}
                    </div>
                    {skillDto ? (
                      <label className="cursor-pointer border border-line-soft px-2 py-1 text-xs text-parchment-dim hover:bg-panel-raised">
                        {uploadSkillImageMutation.isPending ? "Wgrywanie…" : "Ikona umiejętności (PNG/JPEG/WEBP/GIF, max 3 MB)"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          disabled={uploadSkillImageMutation.isPending}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadSkillImageMutation.mutate({ skillId: skillDto.id, file });
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ) : (
                      <p className="text-xs text-parchment-faint">Zapisz klasę, żeby móc wgrać ikonę tej umiejętności.</p>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <input
                      placeholder="nazwa"
                      className={inputClass}
                      value={skill.name}
                      onChange={(e) => updateSkill(idx, { name: e.target.value })}
                    />
                    <select
                      className={inputClass}
                      value={skill.kind}
                      onChange={(e) => {
                        const kind = e.target.value as "passive" | "active";
                        // The effect/cooldown/mana inputs below only render once kind === "active"
                        // and display a fallback default ("damage"/30/15) until touched — without
                        // writing that default into state here too, the select LOOKS filled in but
                        // the underlying value stays undefined, so validation fails with "musi mieć
                        // typ efektu i cooldown" even though every field appears filled.
                        if (kind === "active") {
                          updateSkill(idx, {
                            kind,
                            effectType: skill.effectType ?? "damage",
                            cooldownSeconds: skill.cooldownSeconds ?? 30,
                            baseManaCost: skill.baseManaCost ?? 15,
                          });
                        } else {
                          updateSkill(idx, { kind, targetStat: skill.targetStat ?? "attack" });
                        }
                      }}
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
                    <select
                      className={inputClass}
                      value={skill.category}
                      onChange={(e) => updateSkill(idx, { category: e.target.value as SkillCategory })}
                    >
                      {SKILL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABELS[c]}
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
                      koszt za poziom (pkt)
                      <input
                        type="number"
                        min={0}
                        className={inputClass}
                        value={skill.unlockCost}
                        onChange={(e) => updateSkill(idx, { unlockCost: Number(e.target.value) })}
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
                          onChange={(e) => {
                            const effectType = e.target.value as CreateCharacterClassInput["skills"][number]["effectType"];
                            // Same reasoning as the kind-select fix above: the duration input
                            // below only shows for buff-style effects and displays a "30" fallback
                            // until touched — write that default into state here too, or the field
                            // looks filled while durationSeconds stays undefined.
                            if (effectType && BUFF_EFFECT_TYPES.has(effectType)) {
                              updateSkill(idx, { effectType, durationSeconds: skill.durationSeconds ?? 30 });
                            } else {
                              updateSkill(idx, { effectType });
                            }
                          }}
                        >
                          {EFFECT_TYPES.map((e2) => (
                            <option key={e2} value={e2}>
                              {EFFECT_TYPE_LABELS[e2]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <label className="flex items-center gap-2 text-xs text-parchment-dim">
                      maks. poziom
                      <input
                        type="number"
                        min={1}
                        className={inputClass}
                        value={skill.maxLevel}
                        onChange={(e) => {
                          const maxLevel = Number(e.target.value);
                          // Same displayed-vs-real-state fix as effectType/kind above: the %
                          // mocy input only shows once maxLevel > 1 and would otherwise display a
                          // fallback default the state never actually received.
                          updateSkill(
                            idx,
                            maxLevel > 1
                              ? { maxLevel, levelMagnitudePct: skill.levelMagnitudePct || 0.1 }
                              : { maxLevel },
                          );
                        }}
                      />
                    </label>
                    {skill.maxLevel > 1 && (
                      <label className="flex items-center gap-2 text-xs text-parchment-dim">
                        % mocy za poziom
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className={inputClass}
                          value={skill.levelMagnitudePct}
                          onChange={(e) => updateSkill(idx, { levelMagnitudePct: Number(e.target.value) })}
                        />
                      </label>
                    )}
                  </div>
                  {skill.maxLevel > 1 && (
                    <p className="mt-1 text-[11px] text-parchment-faint">
                      Umiejętność inwestowalna do poziomu {skill.maxLevel} (jak węzeł) — każdy poziom powyżej 1. dodaje{" "}
                      {Math.round(skill.levelMagnitudePct * 1000) / 10}% mocy, koszt {skill.unlockCost} pkt za każdy poziom.
                    </p>
                  )}

                  {skill.maxLevel > 1 && (
                    <div className="mt-2 border-t border-line-soft/40 pt-2">
                      <label className="flex items-center gap-2 text-xs text-parchment-dim">
                        brama książek (poziom)
                        <input
                          type="number"
                          min={2}
                          max={skill.maxLevel}
                          placeholder="brak"
                          className={`${inputClass} w-24`}
                          value={skill.bookGateFromLevel ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            updateSkill(idx, { bookGateFromLevel: raw === "" ? undefined : Number(raw) });
                          }}
                        />
                      </label>
                      {skill.bookGateFromLevel != null && (
                        <>
                          <p className="mt-1 text-[11px] text-parchment-faint">
                            Od poziomu {skill.bookGateFromLevel} punkty umiejętności już nie działają — dalszy wzrost
                            (do poziomu {skill.maxLevel}) tylko przez czytanie książek celujących w tę umiejętność
                            (patrz zakładka Itemy → typ "book"). Bez wiersza dla danego poziomu poniżej: domyślnie
                            1 książka.
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <p className="text-xs font-medium text-parchment-dim">
                              Wymagania książek per poziom ({skill.bookRequirements.length})
                            </p>
                            <button
                              onClick={() =>
                                updateSkill(idx, {
                                  bookRequirements: [
                                    ...skill.bookRequirements,
                                    emptyBookRequirement(skill.bookGateFromLevel!),
                                  ],
                                })
                              }
                              className="text-xs text-gold-bright hover:underline"
                            >
                              + Dodaj poziom
                            </button>
                          </div>
                          <div className="mt-1 space-y-1">
                            {skill.bookRequirements.map((req, reqIdx) => (
                              <div key={req._key} className="flex items-center gap-2">
                                <label className="flex items-center gap-2 text-xs text-parchment-dim">
                                  poziom
                                  <input
                                    type="number"
                                    min={skill.bookGateFromLevel ?? undefined}
                                    max={skill.maxLevel}
                                    className={`${inputClass} w-20`}
                                    value={req.level}
                                    onChange={(e) => updateBookRequirement(idx, reqIdx, { level: Number(e.target.value) })}
                                  />
                                </label>
                                <label className="flex items-center gap-2 text-xs text-parchment-dim">
                                  książek potrzeba
                                  <input
                                    type="number"
                                    min={1}
                                    className={`${inputClass} w-20`}
                                    value={req.booksRequired}
                                    onChange={(e) => updateBookRequirement(idx, reqIdx, { booksRequired: Number(e.target.value) })}
                                  />
                                </label>
                                <button
                                  onClick={() =>
                                    updateSkill(idx, {
                                      bookRequirements: skill.bookRequirements.filter((_, i) => i !== reqIdx),
                                    })
                                  }
                                  className="text-xs text-red-400 hover:underline"
                                >
                                  Usuń
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {skill.kind === "active" && (skill.effectType === "damage" || skill.effectType === "heal") && (
                    <p className="mt-1 text-[11px] text-parchment-faint">
                      mnożnik × staty = wartość {skill.effectType === "damage" ? "obrażeń" : "leczenia"} na aktywację.
                    </p>
                  )}
                  {skill.kind === "active" &&
                    skill.effectType &&
                    skill.effectType !== "damage" &&
                    skill.effectType !== "heal" && (
                      <p className="mt-1 text-[11px] text-parchment-faint">
                        mnożnik × staty = wartość % (np. 10 = 10%) —{" "}
                        {skill.effectType === "stun" || skill.effectType === "poison"
                          ? "szansa losowana raz przy aktywacji."
                          : "tymczasowy bonus po aktywacji — zobacz „czas trwania” poniżej."}
                      </p>
                    )}

                  {skill.kind === "active" && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-xs text-parchment-dim">
                        cooldown (s)
                        <input
                          type="number"
                          className={`${inputClass} w-24`}
                          value={skill.cooldownSeconds ?? 30}
                          onChange={(e) => updateSkill(idx, { cooldownSeconds: Number(e.target.value) })}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-parchment-dim">
                        bazowy koszt many
                        <input
                          type="number"
                          min={0}
                          className={`${inputClass} w-24`}
                          value={skill.baseManaCost ?? 15}
                          onChange={(e) => updateSkill(idx, { baseManaCost: Number(e.target.value) })}
                        />
                      </label>
                      {skill.effectType && BUFF_EFFECT_TYPES.has(skill.effectType) && (
                        <label className="flex items-center gap-2 text-xs text-parchment-dim">
                          czas trwania (s)
                          <input
                            type="number"
                            min={1}
                            className={`${inputClass} w-24`}
                            value={skill.durationSeconds ?? 30}
                            onChange={(e) => updateSkill(idx, { durationSeconds: Number(e.target.value) })}
                          />
                        </label>
                      )}
                    </div>
                  )}

                  <div className="mt-3 border-t border-line-soft/40 pt-2">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-medium text-parchment-dim">Węzły drzewka ({skill.nodes.length})</p>
                      <button
                        onClick={() => updateSkill(idx, { nodes: [...skill.nodes, emptyNode()] })}
                        className="text-xs text-gold-bright hover:underline"
                      >
                        + Dodaj węzeł
                      </button>
                    </div>
                    <div className="space-y-2">
                      {skill.nodes.map((node, nodeIdx) => {
                        const nodeDto = skillDto?.nodes.find((n) => n.name === node.name);
                        return (
                        <div key={node._key} className="border border-line-soft/60 p-2">
                          <div className="mb-2 flex items-center gap-2">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-line-soft bg-panel-raised">
                              {nodeDto?.imageUrl ? (
                                <img src={`${API_URL}${nodeDto.imageUrl}`} alt="" className="h-full w-full object-contain" />
                              ) : (
                                <span className="text-[8px] text-parchment-faint">brak</span>
                              )}
                            </div>
                            {nodeDto ? (
                              <label className="cursor-pointer border border-line-soft px-2 py-1 text-xs text-parchment-dim hover:bg-panel-raised">
                                {uploadNodeImageMutation.isPending ? "Wgrywanie…" : "Ikona (max 3 MB)"}
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/gif"
                                  className="hidden"
                                  disabled={uploadNodeImageMutation.isPending}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) uploadNodeImageMutation.mutate({ nodeId: nodeDto.id, file });
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            ) : (
                              <p className="text-xs text-parchment-faint">Zapisz klasę, żeby wgrać ikonę węzła.</p>
                            )}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-4">
                            <input
                              placeholder="nazwa węzła"
                              className={inputClass}
                              value={node.name}
                              onChange={(e) => updateNode(idx, nodeIdx, { name: e.target.value })}
                            />
                            <select
                              className={inputClass}
                              value={node.effect}
                              onChange={(e) => updateNode(idx, nodeIdx, { effect: e.target.value as NodeFormValue["effect"] })}
                            >
                              <option value="magnitude">moc (+X%)</option>
                              <option value="cost" disabled={skill.kind !== "active"}>
                                koszt many (-X%)
                              </option>
                              <option value="cooldown" disabled={skill.kind !== "active"}>
                                odnowienie (-X%)
                              </option>
                            </select>
                            <label className="flex items-center gap-2 text-xs text-parchment-dim">
                              %
                              <input
                                type="number"
                                step="0.01"
                                className={inputClass}
                                value={node.magnitudePct}
                                onChange={(e) => updateNode(idx, nodeIdx, { magnitudePct: Number(e.target.value) })}
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-parchment-dim">
                              koszt pkt
                              <input
                                type="number"
                                min={1}
                                className={inputClass}
                                value={node.pointCost}
                                onChange={(e) => updateNode(idx, nodeIdx, { pointCost: Number(e.target.value) })}
                              />
                            </label>
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <label className="flex items-center gap-2 text-xs text-parchment-dim">
                              maks. poziom
                              <input
                                type="number"
                                min={1}
                                className={inputClass}
                                value={node.maxLevel}
                                onChange={(e) => updateNode(idx, nodeIdx, { maxLevel: Number(e.target.value) })}
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-parchment-dim">
                              wymaga węzła
                              <select
                                className={inputClass}
                                value={node.requiresNodeName ?? ""}
                                onChange={(e) =>
                                  updateNode(idx, nodeIdx, { requiresNodeName: e.target.value || null })
                                }
                              >
                                <option value="">— brak (korzeń) —</option>
                                {skill.nodes
                                  .filter((n, i) => i !== nodeIdx && n.name)
                                  .map((n, i) => (
                                    <option key={`${i}-${n.name}`} value={n.name}>
                                      {n.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                          </div>
                          <input
                            placeholder="opis węzła"
                            className={`${inputClass} mt-2`}
                            value={node.description}
                            onChange={(e) => updateNode(idx, nodeIdx, { description: e.target.value })}
                          />
                          <button
                            onClick={() => updateSkill(idx, { nodes: skill.nodes.filter((_, i) => i !== nodeIdx) })}
                            className="mt-2 text-xs text-red-400 hover:underline"
                          >
                            Usuń węzeł
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={() => setForm({ ...form, skills: form.skills.filter((_, i) => i !== idx) })}
                    className="mt-2 text-xs text-red-400 hover:underline"
                  >
                    Usuń umiejętność
                  </button>
                </div>
                );
              })}
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

      {confirmDeleteId && (
        <ConfirmModal
          title="Usunąć?"
          message={`Usunąć "${classesQuery.data?.find((c) => c.id === confirmDeleteId)?.name}"?`}
          danger
          onConfirm={() => {
            deleteMutation.mutate(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
