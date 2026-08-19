import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GatheringSettings } from "@mmo/shared";
import { Field, inputClass } from "../../components/admin/Field";
import { ApiError } from "../../lib/apiClient";
import {
  getExpeditionDurationSetting,
  setExpeditionDurationSetting,
  getGatheringSettingsAdmin,
  setGatheringSettingsAdmin,
} from "../../lib/adminSettingsApi";

const DEFAULT_GATHERING_SETTINGS: GatheringSettings = {
  fishing: { minSeconds: 8, maxSeconds: 20 },
  miningExtract: { minSeconds: 10, maxSeconds: 25 },
  miningSearch: { minSeconds: 5, maxSeconds: 15 },
  maxCyclesPerResolve: 100,
  successesPerToolUpgrade: 100,
};

export function SettingsAdminPage() {
  const queryClient = useQueryClient();
  const durationQuery = useQuery({
    queryKey: ["expedition-duration"],
    queryFn: getExpeditionDurationSetting,
  });
  const [minutes, setMinutes] = useState(30);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (durationQuery.data) setMinutes(durationQuery.data.minutes);
  }, [durationQuery.data]);

  const saveMutation = useMutation({
    mutationFn: setExpeditionDurationSetting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expedition-duration"] });
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się zapisać"),
  });

  const gatheringQuery = useQuery({ queryKey: ["gathering-settings"], queryFn: getGatheringSettingsAdmin });
  const [gathering, setGathering] = useState<GatheringSettings>(DEFAULT_GATHERING_SETTINGS);
  const [gatheringSaved, setGatheringSaved] = useState(false);
  const [gatheringError, setGatheringError] = useState<string | null>(null);

  useEffect(() => {
    if (gatheringQuery.data) setGathering(gatheringQuery.data);
  }, [gatheringQuery.data]);

  const saveGatheringMutation = useMutation({
    mutationFn: setGatheringSettingsAdmin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gathering-settings"] });
      setGatheringSaved(true);
      setGatheringError(null);
      setTimeout(() => setGatheringSaved(false), 2000);
    },
    onError: (err) => setGatheringError(err instanceof ApiError ? err.message : "Nie udało się zapisać"),
  });

  return (
    <div>
      <h1 className="text-lg font-semibold text-parchment">Ustawienia</h1>

      <div className="mt-4 max-w-sm space-y-3 panel p-4">
        <Field label="Maksymalny czas pojedynczej walki (minuty)">
          <input
            type="number"
            min={1}
            max={720}
            className={inputClass}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </Field>
        <p className="text-xs text-parchment-faint">
          Walka trwa, aż postać zginie — to tylko zabezpieczenie na wypadek bardzo silnej
          postaci, która nigdy by nie przegrała: po tym czasie walka i tak się kończy, a postać
          przeżywa.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {saved && <p className="text-sm text-rarity-uncommon">Zapisano.</p>}
        <button
          onClick={() => saveMutation.mutate(minutes)}
          disabled={saveMutation.isPending}
          className=" bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
        >
          Zapisz
        </button>
      </div>

      <div className="mt-4 max-w-sm space-y-3 panel p-4">
        <h2 className="font-medium text-parchment">Zbieractwo — domyślne czasy</h2>
        <p className="text-xs text-parchment-faint">
          Wartości domyślne używane, gdy konkretne łowisko/kopalnia nie ma ustawionego własnego zakresu czasu
          (zakładka Zbieractwo).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Łowienie — min (s)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={gathering.fishing.minSeconds}
              onChange={(e) =>
                setGathering({ ...gathering, fishing: { ...gathering.fishing, minSeconds: Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Łowienie — maks (s)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={gathering.fishing.maxSeconds}
              onChange={(e) =>
                setGathering({ ...gathering, fishing: { ...gathering.fishing, maxSeconds: Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Wydobycie — min (s)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={gathering.miningExtract.minSeconds}
              onChange={(e) =>
                setGathering({
                  ...gathering,
                  miningExtract: { ...gathering.miningExtract, minSeconds: Number(e.target.value) },
                })
              }
            />
          </Field>
          <Field label="Wydobycie — maks (s)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={gathering.miningExtract.maxSeconds}
              onChange={(e) =>
                setGathering({
                  ...gathering,
                  miningExtract: { ...gathering.miningExtract, maxSeconds: Number(e.target.value) },
                })
              }
            />
          </Field>
          <Field label="Szukanie złoża — min (s)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={gathering.miningSearch.minSeconds}
              onChange={(e) =>
                setGathering({
                  ...gathering,
                  miningSearch: { ...gathering.miningSearch, minSeconds: Number(e.target.value) },
                })
              }
            />
          </Field>
          <Field label="Szukanie złoża — maks (s)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={gathering.miningSearch.maxSeconds}
              onChange={(e) =>
                setGathering({
                  ...gathering,
                  miningSearch: { ...gathering.miningSearch, maxSeconds: Number(e.target.value) },
                })
              }
            />
          </Field>
        </div>
        <Field label="Limit cykli AFK na jedno odświeżenie (zabezpieczenie przed nieograniczonym doganianiem po powrocie z nieaktywności)">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={gathering.maxCyclesPerResolve}
            onChange={(e) => setGathering({ ...gathering, maxCyclesPerResolve: Number(e.target.value) })}
          />
        </Field>
        <Field label="Udane zbiórki wymagane do ulepszenia wędki/kilofa na kolejny poziom">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={gathering.successesPerToolUpgrade}
            onChange={(e) => setGathering({ ...gathering, successesPerToolUpgrade: Number(e.target.value) })}
          />
        </Field>
        {gatheringError && (
          <p role="alert" className="text-sm text-red-400">
            {gatheringError}
          </p>
        )}
        {gatheringSaved && <p className="text-sm text-rarity-uncommon">Zapisano.</p>}
        <button
          onClick={() => saveGatheringMutation.mutate(gathering)}
          disabled={saveGatheringMutation.isPending}
          className=" bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
        >
          Zapisz
        </button>
      </div>
    </div>
  );
}
