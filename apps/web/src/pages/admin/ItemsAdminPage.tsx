import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateItemSchema,
  ItemTypeSchema,
  StatKeySchema,
  PotionTriggerSchema,
  PotionEffectSchema,
  type CreateItemInput,
} from "@mmo/shared";
import { Field, MiniField, inputClass } from "../../components/admin/Field";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { ItemPickerFilterBar } from "../../components/admin/ItemPickerFilterBar";
import { useItemPickerFilter } from "../../hooks/useItemPickerFilter";
import { ApiError } from "../../lib/apiClient";
import {
  listItems,
  createItem,
  updateItem,
  deleteItem,
  uploadItemImage,
  listClasses,
  listPassiveSkillTypes,
  type ItemDto,
} from "../../lib/adminApi";
import { API_URL } from "../../lib/apiClient";
import { TYPE_LABELS, STAT_LABELS, statHint } from "../../lib/statFormat";

const ITEM_TYPES = ItemTypeSchema.options;
const STAT_KEYS = StatKeySchema.options;
const POTION_TRIGGERS = PotionTriggerSchema.options;
const POTION_EFFECTS = PotionEffectSchema.options;
const CLASS_RESTRICTABLE_TYPES = new Set<CreateItemInput["type"]>(["weapon", "armor", "helmet", "shield"]);

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
    upgradeLevelConfigs: [],
    chestLoot: [],
    sellPrice: 1,
    gridWidth: 1,
    gatherSpeedBonusPctMax: null,
    gatherChanceBonusPctMax: null,
    baitChanceBonusPct: null,
    bookSkillTypeId: null,
    bookSuccessChance: null,
    catalystSuccessChanceBonusPct: null,
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
    upgradeLevelConfigs: item.upgradeLevelConfigs.map((c) => ({
      targetLevel: c.targetLevel,
      successChance: c.successChance,
      goldCost: c.goldCost,
    })),
    chestLoot: item.chestLoot.map((c) => ({
      rewardItemId: c.rewardItemId,
      dropChance: c.dropChance,
      minQty: c.minQty,
      maxQty: c.maxQty,
    })),
    sellPrice: item.sellPrice,
    gridWidth: item.gridWidth,
    gatherSpeedBonusPctMax: item.gatherSpeedBonusPctMax,
    gatherChanceBonusPctMax: item.gatherChanceBonusPctMax,
    baitChanceBonusPct: item.baitChanceBonusPct,
    bookSkillTypeId: item.bookSkillTypeId,
    bookSuccessChance: item.bookSuccessChance,
    catalystSuccessChanceBonusPct: item.catalystSuccessChanceBonusPct,
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
          <div key={stat} className="flex flex-wrap items-end gap-2">
            <MiniField label="Staty">
              <select
                className={`${inputClass} w-44`}
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
                    {STAT_LABELS[s]}
                  </option>
                ))}
              </select>
            </MiniField>
            <MiniField label={`Wartość (${statHint(stat)})`}>
              <input
                type="number"
                step="any"
                className={`${inputClass} w-32`}
                value={val}
                onChange={(e) => onChange({ ...value, [stat]: Number(e.target.value) })}
              />
            </MiniField>
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
  const passiveSkillsQuery = useQuery({ queryKey: ["admin-passive-skills"], queryFn: listPassiveSkillTypes });
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<CreateItemInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<CreateItemInput["type"] | "all">("all");
  const [classFilter, setClassFilter] = useState<string>("all");

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (itemsQuery.data ?? []).filter(
      (i) =>
        (typeFilter === "all" || i.type === typeFilter) &&
        (classFilter === "all" || i.classId === classFilter) &&
        (!q || i.name.toLowerCase().includes(q)),
    );
  }, [itemsQuery.data, search, typeFilter, classFilter]);

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
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  const uploadImageMutation = useMutation({
    mutationFn: (file: File) => uploadItemImage(editingId as string, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-items"] });
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się wgrać grafiki"),
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

  const editingItem = editingId && editingId !== "new" ? itemsQuery.data?.find((i) => i.id === editingId) : undefined;
  const otherItems = (itemsQuery.data ?? []).filter((i) => i.id !== editingId);
  const upgradeMaterialPicker = useItemPickerFilter(otherItems);
  const chestLootPicker = useItemPickerFilter(otherItems);

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

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          className={`${inputClass} w-48`}
          placeholder="Szukaj po nazwie..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={`${inputClass} w-40`}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as CreateItemInput["type"] | "all")}
        >
          <option value="all">Wszystkie typy</option>
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t] ?? t}
            </option>
          ))}
        </select>
        <select className={`${inputClass} w-40`} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="all">Wszystkie klasy</option>
          <option value="">Uniwersalne</option>
          {classesQuery.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="self-center text-xs text-parchment-faint">
          {filteredItems.length} / {itemsQuery.data?.length ?? 0}
        </span>
      </div>

      <div className="mt-2 overflow-x-auto panel">
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
            {filteredItems.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2 text-parchment">{item.name}</td>
                <td className="px-3 py-2 text-parchment-dim">{TYPE_LABELS[item.type] ?? item.type}</td>
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
                    onClick={() => setConfirmDeleteId(item.id)}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-parchment-faint">
                  {itemsQuery.data?.length ? "Brak wyników dla wybranych filtrów." : "Brak itemów. Dodaj pierwszy."}
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
            {editingId === "new" ? "Nowy item" : "Edycja itemu"}
          </h2>

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">Grafika itemu</p>
            {editingId === "new" ? (
              <p className="text-xs text-parchment-faint">Zapisz nowy item, żeby móc wgrać dla niego grafikę.</p>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-line-soft bg-panel-raised">
                  {editingItem?.imageUrl ? (
                    <img
                      src={`${API_URL}${editingItem.imageUrl}`}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-parchment-faint">brak</span>
                  )}
                </div>
                <label className="cursor-pointer border border-line-soft px-3 py-1.5 text-xs text-parchment-dim hover:bg-panel-raised">
                  {uploadImageMutation.isPending ? "Wgrywanie…" : "Wybierz plik (PNG/JPEG/WEBP/GIF, max 3 MB)"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={uploadImageMutation.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadImageMutation.mutate(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
          </div>

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
                    gatherSpeedBonusPctMax: type === "rod" || type === "pickaxe" ? form.gatherSpeedBonusPctMax : null,
                    gatherChanceBonusPctMax: type === "rod" || type === "pickaxe" ? form.gatherChanceBonusPctMax : null,
                    baitChanceBonusPct: type === "bait" ? form.baitChanceBonusPct : null,
                    bookSkillTypeId: type === "book" ? form.bookSkillTypeId : null,
                    bookSuccessChance: type === "book" ? form.bookSuccessChance : null,
                    catalystSuccessChanceBonusPct:
                      type === "catalyst" ? form.catalystSuccessChanceBonusPct : null,
                  });
                }}
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t] ?? t}
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
            <Field label="Możliwość sprzedaży">
              <div className="flex items-center gap-3 pt-1.5">
                <input
                  type="checkbox"
                  checked={form.sellPrice > 0}
                  onChange={(e) => setForm({ ...form, sellPrice: e.target.checked ? form.sellPrice || 1 : 0 })}
                />
                {form.sellPrice > 0 && (
                  <input
                    type="number"
                    min={1}
                    className={`${inputClass} w-28`}
                    value={form.sellPrice}
                    onChange={(e) => setForm({ ...form, sellPrice: Number(e.target.value) })}
                    placeholder="złoto za 1 szt."
                  />
                )}
              </div>
            </Field>
            <Field label="Wysokość w siatce ekwipunku (kratki)">
              <input
                type="number"
                min={1}
                max={3}
                className={`${inputClass} w-24`}
                value={form.gridWidth}
                onChange={(e) => setForm({ ...form, gridWidth: Number(e.target.value) })}
              />
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

                {(form.potion.effect.startsWith("buff_") ||
                  form.potion.effect === "restore_hp" ||
                  form.potion.effect === "restore_mana") && (
                  <label className="flex items-center gap-2 text-xs text-parchment-dim">
                    {form.potion.effect.startsWith("buff_")
                      ? "czas trwania (s)"
                      : "leczenie rozłożone w czasie (s, puste = od razu)"}
                    <input
                      type="number"
                      className={inputClass}
                      value={form.potion.durationSeconds ?? ""}
                      placeholder={form.potion.effect.startsWith("buff_") ? "60" : "od razu"}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          potion: {
                            ...form.potion!,
                            durationSeconds: e.target.value === "" ? undefined : Number(e.target.value),
                          },
                        })
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
              Możliwe losowe staty (przy dropie losowana jest wartość z zakresu min-max jednego
              z poniższych, z prawdopodobieństwem proporcjonalnym do wagi)
            </p>
            <div className="space-y-2">
              {form.possibleStatRanges.map((range, idx) => (
                <div key={`${idx}-${range.stat}`} className="flex flex-wrap items-end gap-2">
                  <MiniField label="Staty">
                    <select
                      className={`${inputClass} w-44`}
                      value={range.stat}
                      onChange={(e) => {
                        const next = [...form.possibleStatRanges];
                        next[idx] = { ...range, stat: e.target.value as (typeof STAT_KEYS)[number] };
                        setForm({ ...form, possibleStatRanges: next });
                      }}
                    >
                      {STAT_KEYS.map((s) => (
                        <option key={s} value={s}>
                          {STAT_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </MiniField>
                  <MiniField label={`Min (${statHint(range.stat)})`}>
                    <input
                      type="number"
                      step="any"
                      className={`${inputClass} w-24`}
                      value={range.min}
                      onChange={(e) => {
                        const next = [...form.possibleStatRanges];
                        next[idx] = { ...range, min: Number(e.target.value) };
                        setForm({ ...form, possibleStatRanges: next });
                      }}
                    />
                  </MiniField>
                  <MiniField label={`Max (${statHint(range.stat)})`}>
                    <input
                      type="number"
                      step="any"
                      className={`${inputClass} w-24`}
                      value={range.max}
                      onChange={(e) => {
                        const next = [...form.possibleStatRanges];
                        next[idx] = { ...range, max: Number(e.target.value) };
                        setForm({ ...form, possibleStatRanges: next });
                      }}
                    />
                  </MiniField>
                  <MiniField label="Waga (względna szansa wylosowania, nie %)">
                    <input
                      type="number"
                      className={`${inputClass} w-20`}
                      value={range.weight}
                      onChange={(e) => {
                        const next = [...form.possibleStatRanges];
                        next[idx] = { ...range, weight: Number(e.target.value) };
                        setForm({ ...form, possibleStatRanges: next });
                      }}
                    />
                  </MiniField>
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
            <ItemPickerFilterBar
              search={upgradeMaterialPicker.search}
              onSearchChange={upgradeMaterialPicker.setSearch}
              typeFilter={upgradeMaterialPicker.typeFilter}
              onTypeFilterChange={upgradeMaterialPicker.setTypeFilter}
              classFilter={upgradeMaterialPicker.classFilter}
              onClassFilterChange={upgradeMaterialPicker.setClassFilter}
              classes={classesQuery.data}
              filteredCount={upgradeMaterialPicker.filtered.length}
              total={upgradeMaterialPicker.total}
            />
            <div className="space-y-2">
              {form.upgradeRequirements.map((req, idx) => (
                <div key={`${idx}-${req.targetLevel}-${req.requiredItemId}`} className="flex flex-wrap items-center gap-2">
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
                    {upgradeMaterialPicker.filtered.map((i) => (
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

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
              Nadpisanie szansy powodzenia i/lub kosztu ulepszenia (opcjonalnie) — poziom bez
              wiersza tutaj używa domyślnych krzywych (szansa malejąca, koszt rosnący z poziomem)
            </p>
            <div className="space-y-2">
              {form.upgradeLevelConfigs.map((cfg, idx) => (
                <div key={`${idx}-${cfg.targetLevel}`} className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    placeholder="poziom ulepszenia"
                    className={`${inputClass} w-36`}
                    value={cfg.targetLevel}
                    onChange={(e) => {
                      const next = [...form.upgradeLevelConfigs];
                      next[idx] = { ...cfg, targetLevel: Number(e.target.value) };
                      setForm({ ...form, upgradeLevelConfigs: next });
                    }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    placeholder="szansa (0-1)"
                    className={`${inputClass} w-32`}
                    value={cfg.successChance}
                    onChange={(e) => {
                      const next = [...form.upgradeLevelConfigs];
                      next[idx] = { ...cfg, successChance: Number(e.target.value) };
                      setForm({ ...form, upgradeLevelConfigs: next });
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="koszt (puste = domyślny)"
                    className={`${inputClass} w-44`}
                    value={cfg.goldCost ?? ""}
                    onChange={(e) => {
                      const next = [...form.upgradeLevelConfigs];
                      next[idx] = { ...cfg, goldCost: e.target.value === "" ? null : Number(e.target.value) };
                      setForm({ ...form, upgradeLevelConfigs: next });
                    }}
                  />
                  <button
                    onClick={() =>
                      setForm({
                        ...form,
                        upgradeLevelConfigs: form.upgradeLevelConfigs.filter((_, i) => i !== idx),
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
                    upgradeLevelConfigs: [
                      ...form.upgradeLevelConfigs,
                      { targetLevel: 1, successChance: 1, goldCost: null },
                    ],
                  })
                }
                className="text-sm text-gold-bright hover:underline"
              >
                + Dodaj nadpisanie
              </button>
            </div>
          </div>

          {(form.type === "rod" || form.type === "pickaxe") && (
            <div className="border border-rarity-uncommon/40 bg-rarity-uncommon/10 p-3">
              <p className="mb-2 text-xs font-medium text-parchment-dim">
                Bonusy zbieractwa — wartość PRZY +9, liniowo interpolowana od 0 przy +0 po poziomie ulepszenia.
                Puste pole = ten przedmiot nie ma tego bonusu.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={form.type === "rod" ? "Skrócenie czasu połowu przy +9 (0–1)" : "Skrócenie czasu wydobycia przy +9 (0–1)"}>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    className={inputClass}
                    value={form.gatherSpeedBonusPctMax ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        gatherSpeedBonusPctMax: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Bonus do szansy złowienia/wydobycia przy +9 (0–1)">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    className={inputClass}
                    value={form.gatherChanceBonusPctMax ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        gatherChanceBonusPctMax: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          )}

          {form.type === "bait" && (
            <div className="border border-rarity-uncommon/40 bg-rarity-uncommon/10 p-3">
              <p className="mb-2 text-xs font-medium text-parchment-dim">
                Przynęta noszona w aktywnym slocie — działa pasywnie (nie jest zużywana), dopóki tam siedzi.
              </p>
              <Field label="Bonus do szansy złowienia/wydobycia (0–1)">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  className={inputClass}
                  value={form.baitChanceBonusPct ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, baitChanceBonusPct: e.target.value === "" ? null : Number(e.target.value) })
                  }
                />
              </Field>
            </div>
          )}

          {form.type === "book" && (
            <div className="border border-rarity-uncommon/40 bg-rarity-uncommon/10 p-3">
              <p className="mb-2 text-xs font-medium text-parchment-dim">
                Czytanie tej książki (prawy klik → Przeczytaj) zużywa jedną sztukę i ma podaną
                szansę na podniesienie wybranej umiejętności pasywnej o 1 poziom.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Umiejętność pasywna">
                  <select
                    className={inputClass}
                    value={form.bookSkillTypeId ?? ""}
                    onChange={(e) => setForm({ ...form, bookSkillTypeId: e.target.value || null })}
                  >
                    <option value="">— wybierz —</option>
                    {passiveSkillsQuery.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Szansa powodzenia (0–1)">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    className={inputClass}
                    value={form.bookSuccessChance ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, bookSuccessChance: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
            </div>
          )}

          {form.type === "catalyst" && (
            <div className="border border-rarity-uncommon/40 bg-rarity-uncommon/10 p-3">
              <p className="mb-2 text-xs font-medium text-parchment-dim">
                Opcjonalny ulepszacz — gracz może go dołożyć do wolnego slotu na kowadle obok
                wymaganych materiałów. Zużywany razem z materiałami przy próbie ulepszenia,
                niezależnie od wyniku.
              </p>
              <Field label="Bonus do szansy powodzenia ulepszenia (0–1)">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  className={inputClass}
                  value={form.catalystSuccessChanceBonusPct ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      catalystSuccessChanceBonusPct: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
          )}

          {form.type === "chest" && (
            <div>
              <p className="mb-2 text-xs font-medium text-parchment-dim">
                Zawartość skrzyni (każdy wiersz losowany niezależnie — szansa 1 = gwarantowane)
              </p>
              <ItemPickerFilterBar
                search={chestLootPicker.search}
                onSearchChange={chestLootPicker.setSearch}
                typeFilter={chestLootPicker.typeFilter}
                onTypeFilterChange={chestLootPicker.setTypeFilter}
                classFilter={chestLootPicker.classFilter}
                onClassFilterChange={chestLootPicker.setClassFilter}
                classes={classesQuery.data}
                filteredCount={chestLootPicker.filtered.length}
                total={chestLootPicker.total}
              />
              <div className="space-y-2">
                {form.chestLoot.map((entry, idx) => (
                  <div key={`${idx}-${entry.rewardItemId}`} className="flex flex-wrap items-end gap-2">
                    <MiniField label="Przedmiot">
                      <select
                        className={`${inputClass} w-48`}
                        value={entry.rewardItemId}
                        onChange={(e) => {
                          const next = [...form.chestLoot];
                          next[idx] = { ...entry, rewardItemId: e.target.value };
                          setForm({ ...form, chestLoot: next });
                        }}
                      >
                        <option value="">wybierz item</option>
                        {chestLootPicker.filtered.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </MiniField>
                    <MiniField label="Szansa (0–1, np. 0.02 = 2%; 1 = gwarantowane)">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={1}
                        className={`${inputClass} w-28`}
                        value={entry.dropChance}
                        onChange={(e) => {
                          const next = [...form.chestLoot];
                          next[idx] = { ...entry, dropChance: Number(e.target.value) };
                          setForm({ ...form, chestLoot: next });
                        }}
                      />
                    </MiniField>
                    <MiniField label="Min ilość">
                      <input
                        type="number"
                        min={1}
                        className={`${inputClass} w-24`}
                        value={entry.minQty}
                        onChange={(e) => {
                          const next = [...form.chestLoot];
                          next[idx] = { ...entry, minQty: Number(e.target.value) };
                          setForm({ ...form, chestLoot: next });
                        }}
                      />
                    </MiniField>
                    <MiniField label="Max ilość">
                      <input
                        type="number"
                        min={1}
                        className={`${inputClass} w-24`}
                        value={entry.maxQty}
                        onChange={(e) => {
                          const next = [...form.chestLoot];
                          next[idx] = { ...entry, maxQty: Number(e.target.value) };
                          setForm({ ...form, chestLoot: next });
                        }}
                      />
                    </MiniField>
                    <button
                      onClick={() => setForm({ ...form, chestLoot: form.chestLoot.filter((_, i) => i !== idx) })}
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
                      chestLoot: [...form.chestLoot, { rewardItemId: "", dropChance: 1, minQty: 1, maxQty: 1 }],
                    })
                  }
                  className="text-sm text-gold-bright hover:underline"
                >
                  + Dodaj przedmiot do skrzyni
                </button>
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
          message={`Usunąć "${itemsQuery.data?.find((i) => i.id === confirmDeleteId)?.name}"?`}
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
