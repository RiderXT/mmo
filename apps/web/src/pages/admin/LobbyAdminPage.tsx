import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LobbySettings, LobbyBonusTier } from "@mmo/shared";
import { Field, inputClass } from "../../components/admin/Field";
import { ApiError } from "../../lib/apiClient";
import { getLobbySettingsAdmin, setLobbySettingsAdmin } from "../../lib/adminSettingsApi";

const DEFAULT_SETTINGS: LobbySettings = {
  maxMembers: 3,
  monsterConcurrency: 2,
  lureExtraMonsterSlotsPerLureMember: 1,
  bonusTiers: [],
};

function newFormKey() {
  return Math.random().toString(36).slice(2);
}

type BonusTierFormValue = LobbyBonusTier & { _key: string };
type FormValue = Omit<LobbySettings, "bonusTiers"> & { bonusTiers: BonusTierFormValue[] };

function toForm(settings: LobbySettings): FormValue {
  return { ...settings, bonusTiers: settings.bonusTiers.map((t) => ({ ...t, _key: newFormKey() })) };
}

export function LobbyAdminPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["lobby-settings-admin"], queryFn: getLobbySettingsAdmin });

  const [form, setForm] = useState<FormValue>(toForm(DEFAULT_SETTINGS));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQuery.data) setForm(toForm(settingsQuery.data));
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (input: LobbySettings) => setLobbySettingsAdmin(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lobby-settings-admin"] });
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się zapisać"),
  });

  function updateBonusTier(idx: number, patch: Partial<BonusTierFormValue>) {
    const next = [...form.bonusTiers];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, bonusTiers: next });
  }

  function handleSave() {
    const { bonusTiers, ...rest } = form;
    saveMutation.mutate({ ...rest, bonusTiers: bonusTiers.map(({ _key: _unused, ...t }) => t) });
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-parchment">Lobby (walka w grupie)</h1>
      <p className="mt-1 text-sm text-parchment-dim">
        Ustawienia wspólnej walki do 3 postaci naraz — ile potworów walczy jednocześnie, ile
        dodatkowych potworów ściąga postać w roli "lure" (patrz "Rola bojowa" w edytorze klas), i
        jaki bonus do expa daje dany skład grupy.
      </p>

      <div className="mt-4 max-w-lg space-y-3 panel p-4">
        <Field label="Maksymalna liczba postaci w lobby (2-3)">
          <input
            type="number"
            min={2}
            max={3}
            className={inputClass}
            value={form.maxMembers}
            onChange={(e) => setForm({ ...form, maxMembers: Number(e.target.value) })}
          />
        </Field>
        <Field label="Współbieżne sloty potworów (bazowo, niezależnie od wielkości lobby)">
          <input
            type="number"
            min={1}
            max={10}
            className={inputClass}
            value={form.monsterConcurrency}
            onChange={(e) => setForm({ ...form, monsterConcurrency: Number(e.target.value) })}
          />
        </Field>
        <Field label="Dodatkowe sloty potworów za każdą postać w roli lure">
          <input
            type="number"
            min={0}
            max={10}
            className={inputClass}
            value={form.lureExtraMonsterSlotsPerLureMember}
            onChange={(e) => setForm({ ...form, lureExtraMonsterSlotsPerLureMember: Number(e.target.value) })}
          />
        </Field>

        <div className="border-t border-line-soft/40 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-parchment-dim">
              Progi bonusu do expa ({form.bonusTiers.length}) — brak pasującego wiersza dla danej
              kombinacji (liczba członków, liczba różnych klas) = 0% bonusu
            </p>
            <button
              onClick={() =>
                setForm({
                  ...form,
                  bonusTiers: [...form.bonusTiers, { _key: newFormKey(), memberCount: 2, uniqueClassCount: 1, expBonusPct: 0 }],
                })
              }
              className="text-xs text-gold-bright hover:underline"
            >
              + Dodaj próg
            </button>
          </div>
          <div className="mt-1 space-y-1">
            {form.bonusTiers.map((tier, idx) => (
              <div key={tier._key} className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-parchment-dim">
                  członków
                  <input
                    type="number"
                    min={2}
                    max={3}
                    className={`${inputClass} w-16`}
                    value={tier.memberCount}
                    onChange={(e) => updateBonusTier(idx, { memberCount: Number(e.target.value) })}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-parchment-dim">
                  różnych klas
                  <input
                    type="number"
                    min={1}
                    max={3}
                    className={`${inputClass} w-16`}
                    value={tier.uniqueClassCount}
                    onChange={(e) => updateBonusTier(idx, { uniqueClassCount: Number(e.target.value) })}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-parchment-dim">
                  bonus expa (np. 0,15 = +15%)
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={5}
                    className={`${inputClass} w-24`}
                    value={tier.expBonusPct}
                    onChange={(e) => updateBonusTier(idx, { expBonusPct: Number(e.target.value) })}
                  />
                </label>
                <button
                  onClick={() => setForm({ ...form, bonusTiers: form.bonusTiers.filter((_, i) => i !== idx) })}
                  className="text-xs text-red-400 hover:underline"
                >
                  Usuń
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {saved && <p className="text-sm text-rarity-uncommon">Zapisano.</p>}

        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
        >
          Zapisz
        </button>
      </div>
    </div>
  );
}
