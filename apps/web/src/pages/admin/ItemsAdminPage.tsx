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
import { Field, inputClass } from "../../components/admin/Field";
import { ApiError } from "../../lib/apiClient";
import { listItems, createItem, updateItem, deleteItem, listClasses, type ItemDto } from "../../lib/adminApi";

const ITEM_TYPES = ItemTypeSchema.options;
const STAT_KEYS = StatKeySchema.options;
const POTION_TRIGGERS = PotionTriggerSchema.options;
const POTION_EFFECTS = PotionEffectSchema.options;
const CLASS_RESTRICTABLE_TYPES = new Set<CreateItemInput["type"]>(["weapon", "armor", "helmet"]);

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
    maxUpgradeStats: {},
    possibleStatRanges: [],
    classId: null,
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
    maxUpgradeStats: item.maxUpgradeStats,
    possibleStatRanges: item.possibleStatRanges,
    classId: item.classId,
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

/** Flat key -> value editor for a Record<StatKey, number>, e.g. baseStats/maxUpgradeStats — a
 * simpler cousin of the possibleStatRanges editor (no min/max/weight, just one value per row). */
function StatValueEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Partial<Record<(typeof STAT_KEYS)[number], number>>;
  onChange: (next: Partial<Record<(typeof STAT_KEYS)[number], number>>) => void;
}) {
  const entries = Object.entries(value) as [(typeof STAT_KEYS)[number], number][];

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-parchment-dim">{label}</p>
      <div className="space-y-2">
        {entries.map(([stat, val], idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <select
              className={`${inputClass} w-32`}
              value={stat}
              onChange={(e) => {
                const nextStat = e.target.value as (typeof STAT_KEYS)[number];
                const next = { ...value };
                delete next[stat];
                next[nextStat] = val;
                onChange(next);
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
              placeholder="wartość"
              className={`${inputClass} w-24`}
              value={val}
              onChange={(e) => onChange({ ...value, [stat]: Number(e.target.value) })}
            />
            <button
              onClick={() => {
                const next = { ...value };
                delete next[stat];
                onChange(next);
              }}
              className="text-red-400 hover:underline"
            >
              Usuń
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            const unused = STAT_KEYS.find((s) => !(s in value)) ?? STAT_KEYS[0];
            onChange({ ...value, [unused]: 0 });
          }}
          className="text-sm text-gold-bright hover:underline"
        >
          + Dodaj stat
        </button>
      </div>
    </div>
  );
}

export function ItemsAdminPage() {
  const queryClient = useQueryClient();
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
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
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-parchment">Itemy</h1>
        <button
          onClick={openCreate}
          className=" bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          + Nowy item
        </button>
      </div>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Poz. min</th>
              <th className="px-3 py-2">Stackuje</th>
              <th className="px-3 py-2">Ulepszenia</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {itemsQuery.data?.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2 text-parchment">{item.name}</td>
                <td className="px-3 py-2 text-parchment-dim">{item.type}</td>
                <td className="px-3 py-2 text-parchment-dim">{item.minLevel}</td>
                <td className="px-3 py-2 text-parchment-dim">
                  {item.stackable ? `tak (${item.maxStack})` : "nie"}
                </td>
                <td className="px-3 py-2 text-parchment-dim">{item.upgradeRequirements.length}</td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(item)} className="text-gold-bright hover:underline">
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
                <td colSpan={6} className="px-3 py-6 text-center text-parchment-faint">
                  Brak itemów. Dodaj pierwszy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <div className="mt-6 space-y-4 panel p-4">
          <h2 className="font-medium text-parchment">
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
            {CLASS_RESTRICTABLE_TYPES.has(form.type) && (
              <Field label="Klasa (ogranicza kto może założyć)">
                <select
                  className={inputClass}
                  value={form.classId ?? ""}
                  onChange={(e) => setForm({ ...form, classId: e.target.value || null })}
                >
                  <option value="">Uniwersalny</option>
                  {classesQuery.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
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
            <div className="border border-rarity-uncommon/40 bg-rarity-uncommon/10 p-3">
              <p className="mb-2 text-xs font-medium text-parchment-dim">
                Działanie potionu (zużywany automatycznie z aktywnego slotu na ekspedycji)
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs text-parchment-dim">
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

                <label className="flex items-center gap-2 text-xs text-parchment-dim">
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
                  <label className="flex items-center gap-2 text-xs text-parchment-dim">
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
                  <label className="flex items-center gap-2 text-xs text-parchment-dim">
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

                <label className="flex items-center gap-2 text-xs text-parchment-dim">
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
                  <label className="flex items-center gap-2 text-xs text-parchment-dim">
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

          <StatValueEditor
            label="Staty bazowe (przy +0)"
            value={form.baseStats}
            onChange={(next) => setForm({ ...form, baseStats: next })}
          />

          <StatValueEditor
            label="Staty przy +9 (interpolowane liniowo od +0 do +9 wg poziomu ulepszenia; stat pominięty tutaj nie rośnie z ulepszeniem)"
            value={form.maxUpgradeStats}
            onChange={(next) => setForm({ ...form, maxUpgradeStats: next })}
          />

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
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
                className="text-sm text-gold-bright hover:underline"
              >
                + Dodaj staty
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
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
                className="text-sm text-gold-bright hover:underline"
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
