import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreateChangelogEntrySchema, type CreateChangelogEntryInput } from "@mmo/shared";
import { Field, inputClass } from "../../components/admin/Field";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { ApiError } from "../../lib/apiClient";
import {
  listChangelogEntriesAdmin,
  createChangelogEntry,
  updateChangelogEntry,
  deleteChangelogEntry,
  type ChangelogEntryDto,
} from "../../lib/adminApi";

function emptyForm(): CreateChangelogEntryInput {
  return { title: "", body: "" };
}

function fromDto(entry: ChangelogEntryDto): CreateChangelogEntryInput {
  return { title: entry.title, body: entry.body };
}

export function ChangelogAdminPage() {
  const queryClient = useQueryClient();
  const entriesQuery = useQuery({ queryKey: ["admin-changelog"], queryFn: listChangelogEntriesAdmin });
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState<CreateChangelogEntryInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: CreateChangelogEntryInput) =>
      editingId && editingId !== "new" ? updateChangelogEntry(editingId, input) : createChangelogEntry(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-changelog"] });
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Błąd zapisu"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChangelogEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-changelog"] }),
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "Nie udało się usunąć"),
  });

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setEditingId("new");
  }

  function openEdit(entry: ChangelogEntryDto) {
    setForm(fromDto(entry));
    setError(null);
    setEditingId(entry.id);
  }

  function handleSubmit() {
    const parsed = CreateChangelogEntrySchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    saveMutation.mutate(parsed.data);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-parchment">Changelog</h1>
        <button onClick={openCreate} className="bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright">
          + Nowy wpis
        </button>
      </div>
      <p className="mt-1 text-sm text-parchment-dim">
        Widoczne dla graczy na stronie "Co nowego". To NIE jest automatyczne — wpis pojawia się
        tylko gdy go tu dodasz.
      </p>

      <div className="mt-4 overflow-x-auto panel">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-panel text-parchment-dim">
            <tr>
              <th className="px-3 py-2">Tytuł</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-ink">
            {entriesQuery.data?.map((entry) => (
              <tr key={entry.id}>
                <td className="px-3 py-2 text-parchment">{entry.title}</td>
                <td className="px-3 py-2 text-parchment-dim">{new Date(entry.createdAt).toLocaleString("pl-PL")}</td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <button onClick={() => openEdit(entry)} className="text-gold-bright hover:underline">
                    Edytuj
                  </button>
                  <button onClick={() => setConfirmDeleteId(entry.id)} className="text-red-400 hover:underline">
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
            {entriesQuery.data?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-parchment-faint">
                  Brak wpisów. Dodaj pierwszy.
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
          <h2 className="font-medium text-parchment">{editingId === "new" ? "Nowy wpis" : "Edycja wpisu"}</h2>

          <Field label="Tytuł">
            <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Treść">
            <textarea
              rows={6}
              className={inputClass}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </Field>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
              className="bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
            >
              Zapisz
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmModal
          title="Usunąć?"
          message={`Usunąć wpis "${entriesQuery.data?.find((e) => e.id === confirmDeleteId)?.title}"?`}
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
