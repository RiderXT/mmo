import { useEffect, useRef, useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { DiscardConfirmModal } from "./DiscardConfirmModal";

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
  // While confirming, DiscardConfirmModal owns the Escape key itself — don't also close the
  // (now hidden) menu behind it.
  useEscapeKey(confirmingDiscard ? () => {} : onClose);

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
      <DiscardConfirmModal
        name={target.name}
        upgradeLevel={target.upgradeLevel}
        onCancel={() => setConfirmingDiscard(false)}
        onConfirm={() => {
          onDiscard(target.inventoryItemId);
          onClose();
        }}
      />
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
