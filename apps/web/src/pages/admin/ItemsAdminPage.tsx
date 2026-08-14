import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateItemSchema,
  ItemTypeSchema,
  StatKeySchema,
  PotionTriggerSchema,
  PotionEffectSchema,
  type CreateItemInput,
} from "@mmo/shared";
import { AppShell } from "../../components/AppShell";
import { Field, inputClass } from "../../components/admin/Field";
import { ApiError } from "../../lib/apiClient";
import { listItems, createItem, updateItem, deleteItem, type ItemDto } from "../../lib/adminApi";

const ITEM_TYPES = ItemTypeSchema.options;
const STAT_KEYS = StatKeySchema.options;
const POTION_TRIGGERS = PotionTriggerSchema.options;
const POTION_EFFECTS = PotionEffectSchema.options;

function defaultPotion(): NonNullable<CreateItemInput["potion"]> {
  return { trigger: "hp_below", thresholdPct: 0.3, effect: "restore_hp", magnitudePct: 0.3 };
}

function emptyForm(): CreateItemInput {
  return {
    name: "",
    type: "material",
    minLevel: 1,
    stackable: true,
    maxStack: 99,
    description: "",
    baseStats: {},
    possibleStatRanges: [],
    upgradeRequirements: [],
  };
}

function fromDto(item: ItemDto): CreateItemInput {
  return {
    name: item.name,
    type: item.type,
    minLevel: item.minLevel,
    stackable: item.stackable,
    maxStack: item.maxStack,
    description: item.description,
    baseStats: item.baseStats,
    possibleStatRanges: item.possibleStatRanges,
    upgradeRequirements: item.upgradeRequirements.map((r) => ({
      targetLevel: r.targetLevel,
      requiredItemId: r.requiredItemId,
      requiredQty: r.requiredQty,
    })),
    potion:
      item.type === "consumable" && item.potionTrigger && item.potionEffect
        ? {
            trigger: item.potionTrigger,
            thresholdPct: item.potionThresholdPct ?? undefined,
            intervalSeconds: item.potionIntervalSec ?? undefined,
            effect: item.potionEffect,
            magnitudePct: item.potionMagnitudePct ?? 0.3,
            durationSeconds: item.potionDurationSec ?? undefined,
          }
        : undefined,
  };
}

export function ItemsAdminPage() {
  const queryClient = useQueryClient();
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<CreateItemInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: CreateItemInput) =>
      editingId && editingId !== "new" ? updateItem(editingId, input) : createItem(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-items"] });
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Błąd zapisu"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-items"] }),
    onError: (err) => alert(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setEditingId("new");
  }

  function openEdit(item: ItemDto) {
    setForm(fromDto(item));
    setError(null);
    setEditingId(item.id);
  }

  function handleSubmit() {
    const parsed = CreateItemSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    saveMutation.mutate(parsed.data);
  }

  const otherItems = (itemsQuery.data ?? []).filter((i) => i.id !== editingId);

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Itemy</h1>
        <button
          onClick={openCreate}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          + Nowy item
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Poz. min</th>
              <th className="px-3 py-2">Stackuje</th>
              <th className="px-3 py-2">Ulepszenia</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950">
            {itemsQuery.data?.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2 text-slate-200">{item.name}</td>
                <td className="px-3 py-2 text-slate-400">{item.type}</td>
                <td className="px-3 py-2 text-slate-400">{item.minLevel}</td>
                <td className="px-3 py-2 text-slate-400">
                  {item.stackable ? `tak (${item.maxStack})` : "nie"}
                </td>
                <td className="px-3 py-2 text-slate-400">{item.upgradeRequirements.length}</td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(item)} className="text-indigo-400 hover:underline">
                    Edytuj
                  </button>
                  <button
                    onClick={() => confirm(`Usunąć "${item.name}"?`) && deleteMutation.mutate(item.id)}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
            {itemsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  Brak itemów. Dodaj pierwszy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <div className="mt-6 space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-medium text-slate-100">
            {editingId === "new" ? "Nowy item" : "Edycja itemu"}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nazwa">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Typ">
              <select
                className={inputClass}
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value as CreateItemInput["type"];
                  setForm({
                    ...form,
                    type,
                    potion: type === "consumable" ? (form.potion ?? defaultPotion()) : undefined,
                  });
                }}
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Poziom minimalny">
              <input
                type="number"
                className={inputClass}
                value={form.minLevel}
                onChange={(e) => setForm({ ...form, minLevel: Number(e.target.value) })}
              />
            </Field>
            <Field label="Stackuje się w EQ?">
              <div className="flex items-center gap-3 pt-1.5">
                <input
                  type="checkbox"
                  checked={form.stackable}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      stackable: e.target.checked,
                      maxStack: e.target.checked ? form.maxStack || 99 : 1,
                    })
                  }
                />
                {form.stackable && (
                  <input
                    type="number"
                    className={`${inputClass} w-24`}
                    value={form.maxStack}
                    onChange={(e) => setForm({ ...form, maxStack: Number(e.target.value) })}
                    placeholder="maxStack"
                  />
                )}
              </div>
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

          {form.type === "consumable" && form.potion && (
            <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3">
              <p className="mb-2 text-xs font-medium text-slate-400">
                Działanie potionu (zużywany automatycznie z aktywnego slotu na ekspedycji)
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  wyzwalacz
                  <select
                    className={inputClass}
                    value={form.potion.trigger}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        potion: { ...form.potion!, trigger: e.target.value as (typeof POTION_TRIGGERS)[number] },
                      })
                    }
                  >
                    {POTION_TRIGGERS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-400">
                  efekt
                  <select
                    className={inputClass}
                    value={form.potion.effect}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        potion: { ...form.potion!, effect: e.target.value as (typeof POTION_EFFECTS)[number] },
                      })
                    }
                  >
                    {POTION_EFFECTS.map((eff) => (
                      <option key={eff} value={eff}>
                        {eff}
                      </option>
                    ))}
                  </select>
                </label>

                {(form.potion.trigger === "hp_below" || form.potion.trigger === "mana_below") && (
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    próg (0-1)
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      className={inputClass}
                      value={form.potion.thresholdPct ?? 0.3}
                      onChange={(e) =>
                        setForm({ ...form, potion: { ...form.potion!, thresholdPct: Number(e.target.value) } })
                      }
                    />
                  </label>
                )}

                {form.potion.trigger === "interval" && (
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    interwał (s)
                    <input
                      type="number"
                      className={inputClass}
                      value={form.potion.intervalSeconds ?? 600}
                      onChange={(e) =>
                        setForm({ ...form, potion: { ...form.potion!, intervalSeconds: Number(e.target.value) } })
                      }
                    />
                  </label>
                )}

                <label className="flex items-center gap-2 text-xs text-slate-400">
                  siła efektu (%)
                  <input
                    type="number"
                    step="0.05"
                    className={inputClass}
                    value={form.potion.magnitudePct}
                    onChange={(e) =>
                      setForm({ ...form, potion: { ...form.potion!, magnitudePct: Number(e.target.value) } })
                    }
                  />
                </label>

                {form.potion.effect.startsWith("buff_") && (
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    czas trwania (s)
                    <input
                      type="number"
                      className={inputClass}
                      value={form.potion.durationSeconds ?? 60}
                      onChange={(e) =>
                        setForm({ ...form, potion: { ...form.potion!, durationSeconds: Number(e.target.value) } })
                      }
                    />
                  </label>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">
              Możliwe losowe staty (przy dropie losowana jest wartość z zakresu)
            </p>
            <div className="space-y-2">
              {form.possibleStatRanges.map((range, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <select
                    className={`${inputClass} w-32`}
                    value={range.stat}
                    onChange={(e) => {
                      const next = [...form.possibleStatRanges];
                      next[idx] = { ...range, stat: e.target.value as (typeof STAT_KEYS)[number] };
                      setForm({ ...form, possibleStatRanges: next });
                    }}
                  >
                    {STAT_KEYS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="min"
                    className={`${inputClass} w-20`}
                    value={range.min}
                    onChange={(e) => {
                      const next = [...form.possibleStatRanges];
                      next[idx] = { ...range, min: Number(e.target.value) };
                      setForm({ ...form, possibleStatRanges: next });
                    }}
                  />
                  <input
                    type="number"
                    placeholder="max"
                    className={`${inputClass} w-20`}
                    value={range.max}
                    onChange={(e) => {
                      const next = [...form.possibleStatRanges];
                      next[idx] = { ...range, max: Number(e.target.value) };
                      setForm({ ...form, possibleStatRanges: next });
                    }}
                  />
                  <input
                    type="number"
                    placeholder="waga"
                    className={`${inputClass} w-20`}
                    value={range.weight}
                    onChange={(e) => {
                      const next = [...form.possibleStatRanges];
                      next[idx] = { ...range, weight: Number(e.target.value) };
                      setForm({ ...form, possibleStatRanges: next });
                    }}
                  />
                  <button
                    onClick={() =>
                      setForm({
                        ...form,
                        possibleStatRanges: form.possibleStatRanges.filter((_, i) => i !== idx),
                      })
                    }
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
                    possibleStatRanges: [
                      ...form.possibleStatRanges,
                      { stat: "attack", min: 0, max: 0, weight: 1 },
                    ],
                  })
                }
                className="text-sm text-indigo-400 hover:underline"
              >
                + Dodaj staty
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">
              Wymagane materiały do ulepszenia
            </p>
            <div className="space-y-2">
              {form.upgradeRequirements.map((req, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    placeholder="poziom ulepszenia"
                    className={`${inputClass} w-36`}
                    value={req.targetLevel}
                    onChange={(e) => {
                      const next = [...form.upgradeRequirements];
                      next[idx] = { ...req, targetLevel: Number(e.target.value) };
                      setForm({ ...form, upgradeRequirements: next });
                    }}
                  />
                  <select
                    className={`${inputClass} w-48`}
                    value={req.requiredItemId}
                    onChange={(e) => {
                      const next = [...form.upgradeRequirements];
                      next[idx] = { ...req, requiredItemId: e.target.value };
                      setForm({ ...form, upgradeRequirements: next });
                    }}
                  >
                    <option value="">wybierz item</option>
                    {otherItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="ilość"
                    className={`${inputClass} w-20`}
                    value={req.requiredQty}
                    onChange={(e) => {
                      const next = [...form.upgradeRequirements];
                      next[idx] = { ...req, requiredQty: Number(e.target.value) };
                      setForm({ ...form, upgradeRequirements: next });
                    }}
                  />
                  <button
                    onClick={() =>
                      setForm({
                        ...form,
                        upgradeRequirements: form.upgradeRequirements.filter((_, i) => i !== idx),
                      })
                    }
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
                    upgradeRequirements: [
                      ...form.upgradeRequirements,
                      { targetLevel: 1, requiredItemId: "", requiredQty: 1 },
                    ],
                  })
                }
                className="text-sm text-indigo-400 hover:underline"
              >
                + Dodaj wymaganie
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
