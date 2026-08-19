import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreateNpcSchema, type CreateNpcInput } from "@mmo/shared";
import { Field, MiniField, inputClass } from "../../components/admin/Field";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { ItemPickerFilterBar } from "../../components/admin/ItemPickerFilterBar";
import { useItemPickerFilter } from "../../hooks/useItemPickerFilter";
import { ApiError } from "../../lib/apiClient";
import { listNpcs, createNpc, updateNpc, deleteNpc, listZones, listItems, listClasses, type NpcDto } from "../../lib/adminApi";

function emptyForm(): CreateNpcInput {
  return { zoneId: "", name: "", kind: "merchant", shopItems: [] };
}

function fromDto(npc: NpcDto): CreateNpcInput {
  return {
    zoneId: npc.zoneId,
    name: npc.name,
    kind: npc.kind,
    shopItems: npc.shopItems.map((s) => ({ itemId: s.itemId, goldPrice: s.goldPrice, stock: s.stock })),
  };
}

export function NpcsAdminPage() {
  const queryClient = useQueryClient();
  const npcsQuery = useQuery({ queryKey: ["admin-npcs"], queryFn: listNpcs });
  const zonesQuery = useQuery({ queryKey: ["admin-zones"], queryFn: listZones });
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
  const shopItemPicker = useItemPickerFilter(itemsQuery.data);
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<CreateNpcInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: CreateNpcInput) =>
      editingId && editingId !== "new" ? updateNpc(editingId, input) : createNpc(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-npcs"] });
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Błąd zapisu"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNpc,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-npcs"] }),
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setEditingId("new");
  }

  function openEdit(npc: NpcDto) {
    setForm(fromDto(npc));
    setError(null);
    setEditingId(npc.id);
  }

  function handleSubmit() {
    const parsed = CreateNpcSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    saveMutation.mutate(parsed.data);
  }

  const townZones = (zonesQuery.data ?? []).filter((z) => z.isTown);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-parchment">NPC</h1>
        <button
          onClick={openCreate}
          className=" bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          + Nowy NPC
        </button>
      </div>
      <p className="mt-1 text-sm text-parchment-dim">
        NPC-handlarze pojawiają się tylko w krainach oznaczonych jako "miasto" (zakładka Krainy).
        Postać stojąca w takiej krainie widzi listę NPC zamiast przycisku "Walcz".
      </p>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Kraina</th>
              <th className="px-3 py-2">Rodzaj</th>
              <th className="px-3 py-2">Towar</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {npcsQuery.data?.map((npc) => (
              <tr key={npc.id}>
                <td className="px-3 py-2 text-parchment">{npc.name}</td>
                <td className="px-3 py-2 text-parchment-dim">{npc.zone.name}</td>
                <td className="px-3 py-2 text-parchment-dim">{npc.kind}</td>
                <td className="px-3 py-2 text-parchment-dim">{npc.shopItems.length}</td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(npc)} className="text-gold-bright hover:underline">
                    Edytuj
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(npc.id)}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
            {npcsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-parchment-faint">
                  Brak NPC. Dodaj pierwszego.
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
          <h2 className="font-medium text-parchment">{editingId === "new" ? "Nowy NPC" : "Edycja NPC"}</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nazwa">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Kraina (tylko typu miasto)">
              <select
                className={inputClass}
                value={form.zoneId}
                onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
              >
                <option value="">wybierz krainę</option>
                {townZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">Towar na sprzedaż</p>
            <ItemPickerFilterBar
              search={shopItemPicker.search}
              onSearchChange={shopItemPicker.setSearch}
              typeFilter={shopItemPicker.typeFilter}
              onTypeFilterChange={shopItemPicker.setTypeFilter}
              classFilter={shopItemPicker.classFilter}
              onClassFilterChange={shopItemPicker.setClassFilter}
              classes={classesQuery.data}
              filteredCount={shopItemPicker.filtered.length}
              total={shopItemPicker.total}
            />
            <div className="space-y-2">
              {form.shopItems.map((entry, idx) => (
                <div key={`${idx}-${entry.itemId}`} className="flex flex-wrap items-end gap-2">
                  <MiniField label="Przedmiot">
                    <select
                      className={`${inputClass} w-48`}
                      value={entry.itemId}
                      onChange={(e) => {
                        const next = [...form.shopItems];
                        next[idx] = { ...entry, itemId: e.target.value };
                        setForm({ ...form, shopItems: next });
                      }}
                    >
                      <option value="">wybierz item</option>
                      {shopItemPicker.filtered.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </MiniField>
                  <MiniField label="Cena (złoto)">
                    <input
                      type="number"
                      min={0}
                      className={`${inputClass} w-28`}
                      value={entry.goldPrice}
                      onChange={(e) => {
                        const next = [...form.shopItems];
                        next[idx] = { ...entry, goldPrice: Number(e.target.value) };
                        setForm({ ...form, shopItems: next });
                      }}
                    />
                  </MiniField>
                  <MiniField label="Zapas (puste = nieograniczony)">
                    <input
                      type="number"
                      min={0}
                      className={`${inputClass} w-28`}
                      value={entry.stock ?? ""}
                      onChange={(e) => {
                        const next = [...form.shopItems];
                        next[idx] = { ...entry, stock: e.target.value === "" ? null : Number(e.target.value) };
                        setForm({ ...form, shopItems: next });
                      }}
                    />
                  </MiniField>
                  <button
                    onClick={() => setForm({ ...form, shopItems: form.shopItems.filter((_, i) => i !== idx) })}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setForm({ ...form, shopItems: [...form.shopItems, { itemId: "", goldPrice: 100, stock: null }] })
                }
                className="text-sm text-gold-bright hover:underline"
              >
                + Dodaj towar
              </button>
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
          message={`Usunąć NPC "${npcsQuery.data?.find((n) => n.id === confirmDeleteId)?.name}"?`}
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
