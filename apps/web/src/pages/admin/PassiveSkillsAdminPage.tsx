import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreatePassiveSkillTypeSchema, type CreatePassiveSkillTypeInput, type GatherKind } from "@mmo/shared";
import { Field, inputClass } from "../../components/admin/Field";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { ApiError } from "../../lib/apiClient";
import {
  listPassiveSkillTypes,
  createPassiveSkillType,
  updatePassiveSkillType,
  deletePassiveSkillType,
  type PassiveSkillTypeDto,
} from "../../lib/adminApi";

const GATHER_KIND_LABELS: Record<string, string> = {
  fishing: "Łowienie",
  mining: "Kopanie",
};

function emptyForm(): CreatePassiveSkillTypeInput {
  return {
    name: "",
    description: "",
    maxLevel: 100,
    gatherKind: null,
    chanceBonusPerLevel: 0,
    speedBonusPerLevel: 0,
  };
}

function fromDto(skill: PassiveSkillTypeDto): CreatePassiveSkillTypeInput {
  return {
    name: skill.name,
    description: skill.description,
    maxLevel: skill.maxLevel,
    gatherKind: skill.gatherKind,
    chanceBonusPerLevel: skill.chanceBonusPerLevel,
    speedBonusPerLevel: skill.speedBonusPerLevel,
  };
}

export function PassiveSkillsAdminPage() {
  const queryClient = useQueryClient();
  const skillsQuery = useQuery({ queryKey: ["admin-passive-skills"], queryFn: listPassiveSkillTypes });
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<CreatePassiveSkillTypeInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: CreatePassiveSkillTypeInput) =>
      editingId && editingId !== "new" ? updatePassiveSkillType(editingId, input) : createPassiveSkillType(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-passive-skills"] });
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Błąd zapisu"),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePassiveSkillType,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-passive-skills"] }),
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setEditingId("new");
  }

  function openEdit(skill: PassiveSkillTypeDto) {
    setForm(fromDto(skill));
    setError(null);
    setEditingId(skill.id);
  }

  function handleSubmit() {
    const parsed = CreatePassiveSkillTypeSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    saveMutation.mutate(parsed.data);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-parchment">Umiejętności pasywne</h1>
        <button
          onClick={openCreate}
          className=" bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          + Nowa umiejętność
        </button>
      </div>
      <p className="mt-1 text-sm text-parchment-dim">
        Rosną tylko przez czytanie książek (item typu "book" wskazujący na daną umiejętność w
        panelu Itemy) — gracze nie przydzielają w nie punktów. Jeśli ustawisz rodzaj zbieractwa,
        każdy poziom dodaje bonus do szansy/szybkości tej aktywności, sumujący się z bonusem
        samego narzędzia.
      </p>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Maks. poziom</th>
              <th className="px-3 py-2">Rodzaj zbieractwa</th>
              <th className="px-3 py-2">Bonus szansy/poziom</th>
              <th className="px-3 py-2">Bonus szybkości/poziom</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {skillsQuery.data?.map((skill) => (
              <tr key={skill.id}>
                <td className="px-3 py-2 text-parchment">{skill.name}</td>
                <td className="px-3 py-2 text-parchment-dim">{skill.maxLevel}</td>
                <td className="px-3 py-2 text-parchment-dim">
                  {skill.gatherKind ? GATHER_KIND_LABELS[skill.gatherKind] ?? skill.gatherKind : "—"}
                </td>
                <td className="px-3 py-2 text-parchment-dim">
                  {skill.chanceBonusPerLevel > 0 ? `+${Math.round(skill.chanceBonusPerLevel * 1000) / 10}%` : "—"}
                </td>
                <td className="px-3 py-2 text-parchment-dim">
                  {skill.speedBonusPerLevel > 0 ? `+${Math.round(skill.speedBonusPerLevel * 1000) / 10}%` : "—"}
                </td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(skill)} className="text-gold-bright hover:underline">
                    Edytuj
                  </button>
                  <button onClick={() => setConfirmDeleteId(skill.id)} className="text-red-400 hover:underline">
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
            {skillsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-parchment-faint">
                  Brak umiejętności pasywnych. Dodaj pierwszą.
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
            {editingId === "new" ? "Nowa umiejętność pasywna" : "Edycja umiejętności pasywnej"}
          </h2>

          <Field label="Nazwa">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <Field label="Opis">
            <textarea
              className={inputClass}
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Maksymalny poziom">
              <input
                type="number"
                min={1}
                max={1000}
                className={inputClass}
                value={form.maxLevel}
                onChange={(e) => setForm({ ...form, maxLevel: Number(e.target.value) })}
              />
            </Field>
            <Field label="Rodzaj zbieractwa (opcjonalnie)">
              <select
                className={inputClass}
                value={form.gatherKind ?? ""}
                onChange={(e) => setForm({ ...form, gatherKind: (e.target.value || null) as GatherKind | null })}
              >
                <option value="">Brak (bez efektu)</option>
                <option value="fishing">Łowienie</option>
                <option value="mining">Kopanie</option>
              </select>
            </Field>
            <Field label="Bonus szansy na poziom (0-1)">
              <input
                type="number"
                step="0.001"
                min={0}
                max={1}
                className={inputClass}
                value={form.chanceBonusPerLevel}
                onChange={(e) => setForm({ ...form, chanceBonusPerLevel: Number(e.target.value) })}
                disabled={!form.gatherKind}
              />
            </Field>
            <Field label="Bonus szybkości na poziom (0-1)">
              <input
                type="number"
                step="0.001"
                min={0}
                max={1}
                className={inputClass}
                value={form.speedBonusPerLevel}
                onChange={(e) => setForm({ ...form, speedBonusPerLevel: Number(e.target.value) })}
                disabled={!form.gatherKind}
              />
            </Field>
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
          message={`Usunąć umiejętność "${skillsQuery.data?.find((s) => s.id === confirmDeleteId)?.name}"? Książki wskazujące na nią stracą swój cel.`}
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
