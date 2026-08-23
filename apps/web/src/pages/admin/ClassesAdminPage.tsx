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

function emptySkill() {
  return {
    name: "",
    description: "",
    kind: "passive" as const,
    scalingStat: "strength" as const,
    scalingFactor: 1,
    unlockCost: 1,
    targetStat: "attack" as const,
    effectType: undefined,
    cooldownSeconds: undefined,
    baseManaCost: undefined,
    category: "combat" as const,
    nodes: [],
  };
}

function emptyNode() {
  return {
    name: "",
    description: "",
    effect: "magnitude" as const,
    magnitudePct: 0.1,
    pointCost: 1,
    maxLevel: 1,
    requiresNodeName: null,
  };
}

type SkillFormValue = CreateCharacterClassInput["skills"][number];
type NodeFormValue = SkillFormValue["nodes"][number];

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
    skills: cls.skills.map((s) => {
      const nodeNameById = new Map(s.nodes.map((n) => [n.id, n.name]));
      return {
        name: s.name,
        description: s.description,
        kind: s.kind,
        scalingStat: s.scalingStat,
        scalingFactor: s.scalingFactor,
        unlockCost: s.unlockCost,
        targetStat: s.targetStat ?? undefined,
        effectType: s.effectType ?? undefined,
        cooldownSeconds: s.cooldownSeconds ?? undefined,
        baseManaCost: s.baseManaCost ?? undefined,
        category: s.category,
        nodes: s.nodes.map((n) => ({
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
  const [form, setForm] = useState<CreateCharacterClassInput>(emptyForm());
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
                <div key={`${idx}-${skill.name}`} className=" border border-line p-3">
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
                      koszt odblokowania (pkt)
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
                        <div key={`${nodeIdx}-${node.name}`} className="border border-line-soft/60 p-2">
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
