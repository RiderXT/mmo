import { useEffect, useRef } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export interface ItemContextMenuTarget {
  inventoryItemId: string;
  name: string;
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
  useEscapeKey(onClose);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onClose]);

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
        onClick={() => {
          if (confirm(`Usunąć "${target.name}" na stałe?`)) onDiscard(target.inventoryItemId);
          onClose();
        }}
        className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-panel-raised"
      >
        Usuń
      </button>
    </div>
  );
}
