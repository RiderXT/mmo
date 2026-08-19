import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReferralSettings } from "@mmo/shared";
import { Field, inputClass } from "../../components/admin/Field";
import { ItemPickerFilterBar } from "../../components/admin/ItemPickerFilterBar";
import { useItemPickerFilter } from "../../hooks/useItemPickerFilter";
import { ApiError } from "../../lib/apiClient";
import { getReferralSettings, setReferralSettings } from "../../lib/accountApi";
import { listItems, listClasses } from "../../lib/adminApi";

const REWARD_KIND_LABELS: Record<ReferralSettings["rewardKind"], string> = {
  none: "Brak",
  gold: "Złoto",
  item: "Przedmiot",
};

const TARGET_LABELS: Record<ReferralSettings["target"], string> = {
  referrer: "Polecający",
  referred: "Polecony",
  both: "Oboje",
};

const DEFAULT_SETTINGS: ReferralSettings = {
  rewardKind: "none",
  goldAmount: 0,
  itemId: null,
  itemQuantity: 1,
  target: "both",
  requiredLevel: 1,
};

export function ReferralAdminPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["referral-settings"], queryFn: getReferralSettings });
  const itemsQuery = useQuery({ queryKey: ["admin-items"], queryFn: listItems });
  const classesQuery = useQuery({ queryKey: ["admin-classes"], queryFn: listClasses });
  const itemPicker = useItemPickerFilter(itemsQuery.data);

  const [form, setForm] = useState<ReferralSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: setReferralSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referral-settings"] });
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się zapisać"),
  });

  const selectedItem = itemsQuery.data?.find((i) => i.id === form.itemId);

  return (
    <div>
      <h1 className="text-lg font-semibold text-parchment">Polecenia</h1>
      <p className="mt-1 text-sm text-parchment-dim">
        Nagroda wypłacana, gdy nowy gracz zarejestruje się z linkiem poleceń istniejącego konta (zob.
        "Link poleceń" w Ustawieniach konta).
      </p>

      <div className="mt-4 max-w-sm space-y-3 panel p-4">
        <Field label="Rodzaj nagrody">
          <select
            className={inputClass}
            value={form.rewardKind}
            onChange={(e) => setForm({ ...form, rewardKind: e.target.value as ReferralSettings["rewardKind"] })}
          >
            {(Object.keys(REWARD_KIND_LABELS) as ReferralSettings["rewardKind"][]).map((kind) => (
              <option key={kind} value={kind}>
                {REWARD_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>

        {form.rewardKind === "gold" && (
          <Field label="Ilość złota">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.goldAmount}
              onChange={(e) => setForm({ ...form, goldAmount: Number(e.target.value) })}
            />
          </Field>
        )}

        {form.rewardKind === "item" && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-parchment-dim">Przedmiot nagrody</p>
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
            <select
              className={inputClass}
              value={form.itemId ?? ""}
              onChange={(e) => setForm({ ...form, itemId: e.target.value || null })}
            >
              <option value="">wybierz item</option>
              {itemPicker.filtered.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
              {/* Keep the currently-saved item selectable even if the filter above hides it. */}
              {selectedItem && !itemPicker.filtered.some((i) => i.id === selectedItem.id) && (
                <option value={selectedItem.id}>{selectedItem.name}</option>
              )}
            </select>
            <Field label="Ilość">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.itemQuantity}
                onChange={(e) => setForm({ ...form, itemQuantity: Number(e.target.value) })}
              />
            </Field>
          </div>
        )}

        <Field label="Komu wypłacić">
          <select
            className={inputClass}
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value as ReferralSettings["target"] })}
          >
            {(Object.keys(TARGET_LABELS) as ReferralSettings["target"][]).map((target) => (
              <option key={target} value={target}>
                {TARGET_LABELS[target]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Wymagany poziom polecanej postaci (1 = od razu przy rejestracji)">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={form.requiredLevel}
            onChange={(e) => setForm({ ...form, requiredLevel: Number(e.target.value) })}
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {saved && <p className="text-sm text-rarity-uncommon">Zapisano.</p>}

        <button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
          className="bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
        >
          Zapisz
        </button>
      </div>
    </div>
  );
}
