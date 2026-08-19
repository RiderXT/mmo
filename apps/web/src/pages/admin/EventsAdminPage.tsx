import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreateGameEventSchema, type CreateGameEventInput } from "@mmo/shared";
import { Field, inputClass } from "../../components/admin/Field";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { ItemPickerFilterBar } from "../../components/admin/ItemPickerFilterBar";
import { useItemPickerFilter } from "../../hooks/useItemPickerFilter";
import { ApiError } from "../../lib/apiClient";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  listItems,
  listClasses,
  type GameEventDto,
} from "../../lib/adminApi";

/** datetime-local inputs need "yyyy-MM-ddTHH:mm" in local time, not an ISO string with seconds/Z. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Inverse of toLocalInputValue — a bare "yyyy-MM-ddTHH:mm" has no timezone, so `new Date()`
 * parses it in whatever timezone is asking (correct here, in the browser, since the value was
 * entered in the admin's own local time). Converting to a real ISO instant (`Z` suffix) BEFORE
 * sending it to the API is essential — the server may run in a different timezone (the
 * production VPS is typically UTC), and would otherwise silently reinterpret the same naive
 * string as if it were server-local time, shifting when the event actually starts/ends by the
 * timezone offset between admin and server (this was the root cause of "event mnożnika nie
 * działa" — the event existed but activated/deactivated at the wrong wall-clock moment). */
function localInputValueToISO(value: string): string {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function emptyForm(): CreateGameEventInput {
  const now = new Date();
  const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  return {
    name: "",
    expMultiplier: 2,
    goldMultiplier: 2,
    startsAt: toLocalInputValue(now.toISOString()),
    endsAt: toLocalInputValue(in72h.toISOString()),
    bonusDropItemId: null,
    bonusDropChance: 0,
  };
}

function fromDto(event: GameEventDto): CreateGameEventInput {
  return {
    name: event.name,
    expMultiplier: event.expMultiplier,
    goldMultiplier: event.goldMultiplier,
    startsAt: toLocalInputValue(event.startsAt),
    endsAt: toLocalInputValue(event.endsAt),
    bonusDropItemId: event.bonusDropItemId,
    bonusDropChance: event.bonusDropChance ?? 0,
  };
}

function isActive(event: GameEventDto, now: number): boolean {
  return new Date(event.startsAt).getTime() <= now && now <= new Date(event.endsAt).getTime();
}

export function EventsAdminPage() {
  const queryClient = useQueryClient();
  const eventsQuery = useQuery({ queryKey: ["admin-events"], queryFn: listEvents });
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
  const bonusDropPicker = useItemPickerFilter(itemsQuery.data);
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<CreateGameEventInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: CreateGameEventInput) =>
      editingId && editingId !== "new" ? updateEvent(editingId, input) : createEvent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Błąd zapisu"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-events"] }),
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setEditingId("new");
  }

  function openEdit(event: GameEventDto) {
    setForm(fromDto(event));
    setError(null);
    setEditingId(event.id);
  }

  function handleSubmit() {
    const parsed = CreateGameEventSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    saveMutation.mutate({
      ...parsed.data,
      startsAt: localInputValueToISO(parsed.data.startsAt),
      endsAt: localInputValueToISO(parsed.data.endsAt),
    });
  }

  const now = Date.now();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-parchment">Eventy</h1>
        <button
          onClick={openCreate}
          className=" bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          + Nowy event
        </button>
      </div>
      <p className="mt-1 text-sm text-parchment-dim">
        Na czas eventu wszystkie ekspedycje dostają mnożnik exp/złota. Jeśli aktywnych eventów
        jest kilka naraz, obowiązuje najwyższy mnożnik z każdej kategorii osobno (nie mnożą się
        przez siebie). Limit bezpieczeństwa blokujący podejrzanie duży skok poziomu skaluje się
        razem z mnożnikiem exp, więc uczciwy bonus eventowy nie zostanie fałszywie zablokowany.
      </p>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Exp ×</th>
              <th className="px-3 py-2">Złoto ×</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">Koniec</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {eventsQuery.data?.map((event) => (
              <tr key={event.id}>
                <td className="px-3 py-2 text-parchment">
                  {event.name}
                  {isActive(event, now) && (
                    <span className="ml-2  bg-rarity-uncommon/20 px-1.5 py-0.5 text-[10px] font-medium text-rarity-uncommon">
                      AKTYWNY
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-parchment-dim">×{event.expMultiplier}</td>
                <td className="px-3 py-2 text-parchment-dim">×{event.goldMultiplier}</td>
                <td className="px-3 py-2 text-parchment-dim">{new Date(event.startsAt).toLocaleString("pl-PL")}</td>
                <td className="px-3 py-2 text-parchment-dim">{new Date(event.endsAt).toLocaleString("pl-PL")}</td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(event)} className="text-gold-bright hover:underline">
                    Edytuj
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(event.id)}
                    className="text-red-400 hover:underline"
                  >
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
            {eventsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-parchment-faint">
                  Brak eventów. Dodaj pierwszy.
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
          <h2 className="font-medium text-parchment">{editingId === "new" ? "Nowy event" : "Edycja eventu"}</h2>

          <Field label="Nazwa">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mnożnik exp">
              <input
                type="number"
                step="0.5"
                min={1}
                max={20}
                className={inputClass}
                value={form.expMultiplier}
                onChange={(e) => setForm({ ...form, expMultiplier: Number(e.target.value) })}
              />
            </Field>
            <Field label="Mnożnik złota">
              <input
                type="number"
                step="0.5"
                min={1}
                max={20}
                className={inputClass}
                value={form.goldMultiplier}
                onChange={(e) => setForm({ ...form, goldMultiplier: Number(e.target.value) })}
              />
            </Field>
            <Field label="Start">
              <input
                type="datetime-local"
                className={inputClass}
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </Field>
            <Field label="Koniec">
              <input
                type="datetime-local"
                className={inputClass}
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
              Bonusowy drop eventowy (opcjonalnie) — na czas eventu dropi z KAŻDEJ krainy, obok
              jej własnych dropów, bez konieczności dodawania go osobno do każdej z nich
            </p>
            <ItemPickerFilterBar
              search={bonusDropPicker.search}
              onSearchChange={bonusDropPicker.setSearch}
              typeFilter={bonusDropPicker.typeFilter}
              onTypeFilterChange={bonusDropPicker.setTypeFilter}
              classFilter={bonusDropPicker.classFilter}
              onClassFilterChange={bonusDropPicker.setClassFilter}
              classes={classesQuery.data}
              filteredCount={bonusDropPicker.filtered.length}
              total={bonusDropPicker.total}
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={`${inputClass} w-56`}
                value={form.bonusDropItemId ?? ""}
                onChange={(e) => setForm({ ...form, bonusDropItemId: e.target.value || null })}
              >
                <option value="">brak (nie dropi)</option>
                {bonusDropPicker.filtered.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min={0}
                max={1}
                placeholder="szansa (0-1)"
                className={`${inputClass} w-32`}
                value={form.bonusDropChance}
                onChange={(e) => setForm({ ...form, bonusDropChance: Number(e.target.value) })}
                disabled={!form.bonusDropItemId}
              />
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
          message={`Usunąć event "${eventsQuery.data?.find((ev) => ev.id === confirmDeleteId)?.name}"?`}
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
