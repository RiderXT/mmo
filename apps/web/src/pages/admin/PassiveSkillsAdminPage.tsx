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

// Stable form-local id, same reasoning as ClassesAdminPage.tsx's newFormKey — `level` itself is
// user-editable, so keying rows by it would remount the input (and lose focus) on every keystroke.
function newFormKey() {
  return Math.random().toString(36).slice(2);
}

type BookRequirementFormValue = CreatePassiveSkillTypeInput["bookRequirements"][number] & { _key: string };
type FormValue = Omit<CreatePassiveSkillTypeInput, "bookRequirements"> & { bookRequirements: BookRequirementFormValue[] };

function emptyForm(): FormValue {
  return {
    name: "",
    description: "",
    maxLevel: 100,
    gatherKind: null,
    chanceBonusPerLevel: 0,
    speedBonusPerLevel: 0,
    xpPerLevel: 100,
    xpPerGatherAction: 1,
    bookGateFromLevel: null,
    booksRequiredPerLevel: 1,
    bookRequirements: [],
  };
}

function fromDto(skill: PassiveSkillTypeDto): FormValue {
  return {
    name: skill.name,
    description: skill.description,
    maxLevel: skill.maxLevel,
    gatherKind: skill.gatherKind,
    chanceBonusPerLevel: skill.chanceBonusPerLevel,
    speedBonusPerLevel: skill.speedBonusPerLevel,
    xpPerLevel: skill.xpPerLevel,
    xpPerGatherAction: skill.xpPerGatherAction,
    bookGateFromLevel: skill.bookGateFromLevel,
    booksRequiredPerLevel: skill.booksRequiredPerLevel,
    bookRequirements: skill.bookRequirements.map((r) => ({ _key: newFormKey(), level: r.level, booksRequired: r.booksRequired })),
  };
}

export function PassiveSkillsAdminPage() {
  const queryClient = useQueryClient();
  const skillsQuery = useQuery({ queryKey: ["admin-passive-skills"], queryFn: listPassiveSkillTypes });
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<FormValue>(emptyForm());
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

  function updateBookRequirement(reqIdx: number, patch: Partial<BookRequirementFormValue>) {
    const next = [...form.bookRequirements];
    next[reqIdx] = { ...next[reqIdx], ...patch };
    setForm({ ...form, bookRequirements: next });
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
        Gracze nie przydzielają w nie punktów. Umiejętności z rodzajem zbieractwa rosną z
        doświadczenia zdobywanego podczas łowienia/kopania (każda próba, nie tylko udana) —
        każdy poziom dodaje bonus do szansy/szybkości tej aktywności, sumujący się z bonusem
        samego narzędzia. Od skonfigurowanego poziomu awans dodatkowo wymaga przeczytania książek
        (item typu "book" wskazujący na daną umiejętność w panelu Itemy). Umiejętności bez
        rodzaju zbieractwa rosną wyłącznie przez czytanie książek, jak dotąd.
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
            <Field label="XP potrzebne na poziom">
              <input
                type="number"
                min={1}
                max={1_000_000}
                className={inputClass}
                value={form.xpPerLevel}
                onChange={(e) => setForm({ ...form, xpPerLevel: Number(e.target.value) })}
                disabled={!form.gatherKind}
              />
            </Field>
            <Field label="XP za jedną próbę (połów/wydobycie)">
              <input
                type="number"
                min={1}
                max={100_000}
                className={inputClass}
                value={form.xpPerGatherAction}
                onChange={(e) => setForm({ ...form, xpPerGatherAction: Number(e.target.value) })}
                disabled={!form.gatherKind}
              />
            </Field>
            <Field label="Bramka książkowa od poziomu (puste = brak)">
              <input
                type="number"
                min={1}
                max={1000}
                className={inputClass}
                value={form.bookGateFromLevel ?? ""}
                onChange={(e) => setForm({ ...form, bookGateFromLevel: e.target.value === "" ? null : Number(e.target.value) })}
                disabled={!form.gatherKind}
              />
            </Field>
            <Field label="Wymagane książki po bramce (domyślnie)">
              <input
                type="number"
                min={1}
                max={100}
                className={inputClass}
                value={form.booksRequiredPerLevel}
                onChange={(e) => setForm({ ...form, booksRequiredPerLevel: Number(e.target.value) })}
                disabled={!form.gatherKind || form.bookGateFromLevel == null}
              />
            </Field>
          </div>

          {form.gatherKind && form.bookGateFromLevel != null && (
            <div className="border-t border-line-soft/40 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-parchment-dim">
                  Nadpisania per poziom ({form.bookRequirements.length}) — opcjonalne, bez wpisu używa wartości
                  domyślnej powyżej
                </p>
                <button
                  onClick={() =>
                    setForm({
                      ...form,
                      bookRequirements: [
                        ...form.bookRequirements,
                        { _key: newFormKey(), level: form.bookGateFromLevel!, booksRequired: 1 },
                      ],
                    })
                  }
                  className="text-xs text-gold-bright hover:underline"
                >
                  + Dodaj poziom
                </button>
              </div>
              <div className="mt-1 space-y-1">
                {form.bookRequirements.map((req, reqIdx) => (
                  <div key={req._key} className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-parchment-dim">
                      poziom
                      <input
                        type="number"
                        min={form.bookGateFromLevel ?? undefined}
                        max={form.maxLevel}
                        className={`${inputClass} w-20`}
                        value={req.level}
                        onChange={(e) => updateBookRequirement(reqIdx, { level: Number(e.target.value) })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-parchment-dim">
                      książek potrzeba
                      <input
                        type="number"
                        min={1}
                        className={`${inputClass} w-20`}
                        value={req.booksRequired}
                        onChange={(e) => updateBookRequirement(reqIdx, { booksRequired: Number(e.target.value) })}
                      />
                    </label>
                    <button
                      onClick={() => setForm({ ...form, bookRequirements: form.bookRequirements.filter((_, i) => i !== reqIdx) })}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Usuń
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
