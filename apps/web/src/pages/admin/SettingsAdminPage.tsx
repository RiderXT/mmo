import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field, inputClass } from "../../components/admin/Field";
import { ApiError } from "../../lib/apiClient";
import { getExpeditionDurationSetting, setExpeditionDurationSetting } from "../../lib/adminSettingsApi";

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
        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-rarity-uncommon">Zapisano.</p>}
        <button
          onClick={() => saveMutation.mutate(minutes)}
          disabled={saveMutation.isPending}
          className=" bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
        >
          Zapisz
        </button>
      </div>
    </div>
  );
}
