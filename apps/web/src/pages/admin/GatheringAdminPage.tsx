import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateFishingSpotSchema,
  CreateMineSchema,
  type CreateFishingSpotInput,
  type CreateMineInput,
} from "@mmo/shared";
import { Field, MiniField, inputClass } from "../../components/admin/Field";
import { ItemPickerFilterBar } from "../../components/admin/ItemPickerFilterBar";
import { useItemPickerFilter } from "../../hooks/useItemPickerFilter";
import { ApiError } from "../../lib/apiClient";
import {
  listFishingSpots,
  createFishingSpot,
  updateFishingSpot,
  deleteFishingSpot,
  listMines,
  createMine,
  updateMine,
  deleteMine,
  listZones,
  listItems,
  listClasses,
  type FishingSpotDto,
  type MineDto,
} from "../../lib/adminApi";

function emptyFishingForm(): CreateFishingSpotInput {
  return { zoneId: "", name: "Łowisko", minCatchSeconds: null, maxCatchSeconds: null, drops: [] };
}

function fishingFromDto(spot: FishingSpotDto): CreateFishingSpotInput {
  return {
    zoneId: spot.zoneId,
    name: spot.name,
    minCatchSeconds: spot.minCatchSeconds,
    maxCatchSeconds: spot.maxCatchSeconds,
    drops: spot.drops.map((d) => ({ itemId: d.itemId, dropChance: d.dropChance, minQty: d.minQty, maxQty: d.maxQty })),
  };
}

function emptyMineForm(): CreateMineInput {
  return {
    zoneId: "",
    name: "Kopalnia",
    minExtractSeconds: null,
    maxExtractSeconds: null,
    minSearchSeconds: null,
    maxSearchSeconds: null,
    drops: [],
  };
}

function mineFromDto(mine: MineDto): CreateMineInput {
  return {
    zoneId: mine.zoneId,
    name: mine.name,
    minExtractSeconds: mine.minExtractSeconds,
    maxExtractSeconds: mine.maxExtractSeconds,
    minSearchSeconds: mine.minSearchSeconds,
    maxSearchSeconds: mine.maxSearchSeconds,
    drops: mine.drops.map((d) => ({ itemId: d.itemId, dropChance: d.dropChance, minQty: d.minQty, maxQty: d.maxQty })),
  };
}

/** Shared drop-table row editor (itemId + dropChance + minQty/maxQty), identical shape to
 * ItemsAdminPage's chest-loot editor — reused here for both fishing and mining drop tables. */
function DropTableEditor({
  drops,
  onChange,
  picker,
  classes,
}: {
  drops: { itemId: string; dropChance: number; minQty: number; maxQty: number }[];
  onChange: (next: { itemId: string; dropChance: number; minQty: number; maxQty: number }[]) => void;
  picker: ReturnType<typeof useItemPickerFilter>;
  classes: { id: string; name: string }[] | undefined;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-parchment-dim">
        Tabela dropów (każdy wiersz losowany niezależnie — szansa 1 = gwarantowane)
      </p>
      <ItemPickerFilterBar
        search={picker.search}
        onSearchChange={picker.setSearch}
        typeFilter={picker.typeFilter}
        onTypeFilterChange={picker.setTypeFilter}
        classFilter={picker.classFilter}
        onClassFilterChange={picker.setClassFilter}
        classes={classes}
        filteredCount={picker.filtered.length}
        total={picker.total}
      />
      <div className="space-y-2">
        {drops.map((entry, idx) => (
          <div key={idx} className="flex flex-wrap items-end gap-2">
            <MiniField label="Przedmiot">
              <select
                className={`${inputClass} w-48`}
                value={entry.itemId}
                onChange={(e) => {
                  const next = [...drops];
                  next[idx] = { ...entry, itemId: e.target.value };
                  onChange(next);
                }}
              >
                <option value="">wybierz item</option>
                {picker.filtered.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </MiniField>
            <MiniField label="Szansa (0–1)">
              <input
                type="number"
                step="0.01"
                min={0}
                max={1}
                className={`${inputClass} w-24`}
                value={entry.dropChance}
                onChange={(e) => {
                  const next = [...drops];
                  next[idx] = { ...entry, dropChance: Number(e.target.value) };
                  onChange(next);
                }}
              />
            </MiniField>
            <MiniField label="Min ilość">
              <input
                type="number"
                min={1}
                className={`${inputClass} w-20`}
                value={entry.minQty}
                onChange={(e) => {
                  const next = [...drops];
                  next[idx] = { ...entry, minQty: Number(e.target.value) };
                  onChange(next);
                }}
              />
            </MiniField>
            <MiniField label="Max ilość">
              <input
                type="number"
                min={1}
                className={`${inputClass} w-20`}
                value={entry.maxQty}
                onChange={(e) => {
                  const next = [...drops];
                  next[idx] = { ...entry, maxQty: Number(e.target.value) };
                  onChange(next);
                }}
              />
            </MiniField>
            <button onClick={() => onChange(drops.filter((_, i) => i !== idx))} className="text-red-400 hover:underline">
              Usuń
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...drops, { itemId: "", dropChance: 1, minQty: 1, maxQty: 1 }])}
          className="text-sm text-gold-bright hover:underline"
        >
          + Dodaj drop
        </button>
      </div>
    </div>
  );
}

function FishingSpotsSection() {
  const queryClient = useQueryClient();
  const spotsQuery = useQuery({ queryKey: ["admin-fishing-spots"], queryFn: listFishingSpots });
  const zonesQuery = useQuery({ queryKey: ["admin-zones"], queryFn: listZones });
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
  const dropPicker = useItemPickerFilter(itemsQuery.data);
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<CreateFishingSpotInput>(emptyFishingForm());
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: CreateFishingSpotInput) =>
      editingId && editingId !== "new" ? updateFishingSpot(editingId, input) : createFishingSpot(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-fishing-spots"] });
      queryClient.invalidateQueries({ queryKey: ["admin-zones"] });
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Błąd zapisu"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFishingSpot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-fishing-spots"] });
      queryClient.invalidateQueries({ queryKey: ["admin-zones"] });
    },
    onError: (err) => alert(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  function openCreate() {
    setForm(emptyFishingForm());
    setError(null);
    setEditingId("new");
  }
  function openEdit(spot: FishingSpotDto) {
    setForm(fishingFromDto(spot));
    setError(null);
    setEditingId(spot.id);
  }
  function handleSubmit() {
    const parsed = CreateFishingSpotSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    saveMutation.mutate(parsed.data);
  }

  const takenZoneIds = new Set((spotsQuery.data ?? []).map((s) => s.zoneId));
  const availableZones = (zonesQuery.data ?? []).filter((z) => !takenZoneIds.has(z.id) || z.id === form.zoneId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-parchment">Łowiska</h2>
        <button onClick={openCreate} className=" bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright">
          + Nowe łowisko
        </button>
      </div>
      <p className="mt-1 text-sm text-parchment-dim">
        Każda kraina może mieć co najwyżej jedno łowisko — może to być dedykowana kraina bez potworów albo krainę
        łączącą walkę z łowieniem. Gracz musi mieć założoną wędkę.
      </p>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Kraina</th>
              <th className="px-3 py-2">Czas połowu</th>
              <th className="px-3 py-2">Dropy</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {spotsQuery.data?.map((spot) => (
              <tr key={spot.id}>
                <td className="px-3 py-2 text-parchment">{spot.name}</td>
                <td className="px-3 py-2 text-parchment-dim">{spot.zone.name}</td>
                <td className="px-3 py-2 text-parchment-dim">
                  {spot.minCatchSeconds ?? "domyślny"}–{spot.maxCatchSeconds ?? "domyślny"}s
                </td>
                <td className="px-3 py-2 text-parchment-dim">{spot.drops.length}</td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(spot)} className="text-gold-bright hover:underline">
                    Edytuj
                  </button>
                  <button
                    onClick={() => confirm(`Usunąć łowisko "${spot.name}"?`) && deleteMutation.mutate(spot.id)}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
            {spotsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-parchment-faint">
                  Brak łowisk. Dodaj pierwsze.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <div className="mt-6 space-y-4 panel p-4">
          <h3 className="font-medium text-parchment">{editingId === "new" ? "Nowe łowisko" : "Edycja łowiska"}</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nazwa">
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Kraina">
              <select className={inputClass} value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
                <option value="">wybierz krainę</option>
                {availableZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Min. czas połowu w sekundach (puste = domyślny z Ustawień)">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.minCatchSeconds ?? ""}
                onChange={(e) => setForm({ ...form, minCatchSeconds: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
            <Field label="Maks. czas połowu w sekundach (puste = domyślny z Ustawień)">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.maxCatchSeconds ?? ""}
                onChange={(e) => setForm({ ...form, maxCatchSeconds: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
          </div>

          <DropTableEditor
            drops={form.drops}
            onChange={(drops) => setForm({ ...form, drops })}
            picker={dropPicker}
            classes={classesQuery.data}
          />

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

function MinesSection() {
  const queryClient = useQueryClient();
  const minesQuery = useQuery({ queryKey: ["admin-mines"], queryFn: listMines });
  const zonesQuery = useQuery({ queryKey: ["admin-zones"], queryFn: listZones });
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
  const dropPicker = useItemPickerFilter(itemsQuery.data);
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<CreateMineInput>(emptyMineForm());
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: CreateMineInput) => (editingId && editingId !== "new" ? updateMine(editingId, input) : createMine(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-mines"] });
      queryClient.invalidateQueries({ queryKey: ["admin-zones"] });
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Błąd zapisu"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-mines"] });
      queryClient.invalidateQueries({ queryKey: ["admin-zones"] });
    },
    onError: (err) => alert(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  function openCreate() {
    setForm(emptyMineForm());
    setError(null);
    setEditingId("new");
  }
  function openEdit(mine: MineDto) {
    setForm(mineFromDto(mine));
    setError(null);
    setEditingId(mine.id);
  }
  function handleSubmit() {
    const parsed = CreateMineSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    saveMutation.mutate(parsed.data);
  }

  const takenZoneIds = new Set((minesQuery.data ?? []).map((m) => m.zoneId));
  const availableZones = (zonesQuery.data ?? []).filter((z) => !takenZoneIds.has(z.id) || z.id === form.zoneId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-parchment">Kopalnie</h2>
        <button onClick={openCreate} className=" bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright">
          + Nowa kopalnia
        </button>
      </div>
      <p className="mt-1 text-sm text-parchment-dim">
        Każda kraina może mieć co najwyżej jedną kopalnię. Cykl wydobycia ma dwie niezależnie losowane fazy:
        wydobycie (przyspieszane przez kilof) i szukanie kolejnego złoża (zawsze losowe, kilof go nie przyspiesza).
        Gracz musi mieć założony kilof.
      </p>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Kraina</th>
              <th className="px-3 py-2">Wydobycie</th>
              <th className="px-3 py-2">Szukanie</th>
              <th className="px-3 py-2">Dropy</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {minesQuery.data?.map((mine) => (
              <tr key={mine.id}>
                <td className="px-3 py-2 text-parchment">{mine.name}</td>
                <td className="px-3 py-2 text-parchment-dim">{mine.zone.name}</td>
                <td className="px-3 py-2 text-parchment-dim">
                  {mine.minExtractSeconds ?? "domyślny"}–{mine.maxExtractSeconds ?? "domyślny"}s
                </td>
                <td className="px-3 py-2 text-parchment-dim">
                  {mine.minSearchSeconds ?? "domyślny"}–{mine.maxSearchSeconds ?? "domyślny"}s
                </td>
                <td className="px-3 py-2 text-parchment-dim">{mine.drops.length}</td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(mine)} className="text-gold-bright hover:underline">
                    Edytuj
                  </button>
                  <button
                    onClick={() => confirm(`Usunąć kopalnię "${mine.name}"?`) && deleteMutation.mutate(mine.id)}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
            {minesQuery.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-parchment-faint">
                  Brak kopalni. Dodaj pierwszą.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <div className="mt-6 space-y-4 panel p-4">
          <h3 className="font-medium text-parchment">{editingId === "new" ? "Nowa kopalnia" : "Edycja kopalni"}</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nazwa">
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Kraina">
              <select className={inputClass} value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
                <option value="">wybierz krainę</option>
                {availableZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Min. czas wydobycia w sekundach (puste = domyślny)">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.minExtractSeconds ?? ""}
                onChange={(e) => setForm({ ...form, minExtractSeconds: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
            <Field label="Maks. czas wydobycia w sekundach (puste = domyślny)">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.maxExtractSeconds ?? ""}
                onChange={(e) => setForm({ ...form, maxExtractSeconds: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
            <Field label="Min. czas szukania złoża w sekundach (puste = domyślny)">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.minSearchSeconds ?? ""}
                onChange={(e) => setForm({ ...form, minSearchSeconds: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
            <Field label="Maks. czas szukania złoża w sekundach (puste = domyślny)">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.maxSearchSeconds ?? ""}
                onChange={(e) => setForm({ ...form, maxSearchSeconds: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
          </div>

          <DropTableEditor
            drops={form.drops}
            onChange={(drops) => setForm({ ...form, drops })}
            picker={dropPicker}
            classes={classesQuery.data}
          />

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

export function GatheringAdminPage() {
  const [subTab, setSubTab] = useState<"fishing" | "mining">("fishing");
  return (
    <div>
      <h1 className="text-lg font-semibold text-parchment">Zbieractwo</h1>
      <div className="mt-3 flex gap-2 border-b border-line">
        {(["fishing", "mining"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`px-3 py-1.5 text-sm font-medium ${
              subTab === tab ? "border-b-2 border-gold text-parchment" : "text-parchment-dim hover:text-parchment"
            }`}
          >
            {tab === "fishing" ? "Łowiska" : "Kopalnie"}
          </button>
        ))}
      </div>
      <div className="mt-4">{subTab === "fishing" ? <FishingSpotsSection /> : <MinesSection />}</div>
    </div>
  );
}
