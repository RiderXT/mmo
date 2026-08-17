import { useEffect, useRef, useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export interface ItemContextMenuTarget {
  inventoryItemId: string;
  name: string;
  upgradeLevel: number;
  canOpen: boolean;
  canSell: boolean;
  x: number;
  y: number;
}

export function ItemContextMenu({
  target,
  onClose,
  onOpen,
  onSell,
  onDiscard,
}: {
  target: ItemContextMenuTarget;
  onClose: () => void;
  onOpen: (inventoryItemId: string) => void;
  onSell: (inventoryItemId: string) => void;
  onDiscard: (inventoryItemId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  useEscapeKey(confirmingDiscard ? () => setConfirmingDiscard(false) : onClose);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      // The confirm step has its own backdrop click-to-cancel; don't also treat that click as an
      // outside-click on the (now hidden) menu itself.
      if (confirmingDiscard) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onClose, confirmingDiscard]);

  if (confirmingDiscard) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmingDiscard(false)} />
        <div className="relative w-full max-w-sm panel p-4">
          <h2 className="font-medium text-parchment">Usunąć na stałe?</h2>
          <p className="mt-2 text-sm text-parchment-dim">
            <span className="font-medium text-parchment">{target.name}</span>
            {target.upgradeLevel > 0 && <span className="text-gold-bright"> +{target.upgradeLevel}</span>}{" "}
            zostanie usunięty(a) bezpowrotnie — tej operacji nie można cofnąć.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setConfirmingDiscard(false)}
              className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
            >
              Anuluj
            </button>
            <button
              onClick={() => {
                onDiscard(target.inventoryItemId);
                onClose();
              }}
              className="rounded-md bg-red-500 px-4 py-1.5 text-sm font-medium text-ink hover:bg-red-400"
            >
              Usuń na stałe
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Keep the menu on-screen near the click point rather than off the right/bottom edge.
  const left = Math.min(target.x, window.innerWidth - 180);
  const top = Math.min(target.y, window.innerHeight - 160);

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-50 w-44 border border-line bg-panel shadow-lg"
    >
      <p className="truncate border-b border-line px-3 py-1.5 text-xs font-medium text-parchment-dim">
        {target.name}
      </p>
      {target.canOpen && (
        <button
          onClick={() => {
            onOpen(target.inventoryItemId);
            onClose();
          }}
          className="block w-full px-3 py-2 text-left text-sm text-parchment hover:bg-panel-raised"
        >
          Otwórz
        </button>
      )}
      <button
        onClick={() => {
          if (target.canSell) onSell(target.inventoryItemId);
          onClose();
        }}
        disabled={!target.canSell}
        title={target.canSell ? undefined : "Ten przedmiot nie ma ustalonej wartości sprzedaży"}
        className="block w-full px-3 py-2 text-left text-sm text-parchment hover:bg-panel-raised disabled:cursor-not-allowed disabled:text-parchment-faint disabled:hover:bg-transparent"
      >
        Sprzedaj
      </button>
      <button
        onClick={() => setConfirmingDiscard(true)}
        className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-panel-raised"
      >
        Usuń
      </button>
    </div>
  );
}
