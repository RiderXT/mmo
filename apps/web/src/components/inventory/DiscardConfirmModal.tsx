import { useEscapeKey } from "../../hooks/useEscapeKey";

/** Themed replacement for a native confirm() when permanently deleting an item — shows the item
 * name/upgrade level so the player knows exactly what they're about to lose. Shared by the
 * right-click context menu and the keyboard-reachable item detail panel. */
export function DiscardConfirmModal({
  name,
  upgradeLevel,
  onConfirm,
  onCancel,
}: {
  name: string;
  upgradeLevel: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeKey(onCancel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-sm panel p-4">
        <h2 className="font-medium text-parchment">Usunąć na stałe?</h2>
        <p className="mt-2 text-sm text-parchment-dim">
          <span className="font-medium text-parchment">{name}</span>
          {upgradeLevel > 0 && <span className="text-gold-bright"> +{upgradeLevel}</span>}{" "}
          zostanie usunięty(a) bezpowrotnie — tej operacji nie można cofnąć.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
          >
            Anuluj
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-red-500 px-4 py-1.5 text-sm font-medium text-ink hover:bg-red-400"
          >
            Usuń na stałe
          </button>
        </div>
      </div>
    </div>
  );
}
