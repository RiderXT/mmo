import { useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export function BuyItemModal({
  itemName,
  goldPrice,
  stock,
  stackable,
  gold,
  onConfirm,
  onCancel,
}: {
  itemName: string;
  goldPrice: number;
  stock: number | null;
  stackable: boolean;
  gold: number;
  onConfirm: (quantity: number) => void;
  onCancel: () => void;
}) {
  const maxQty = Math.max(1, Math.min(stock ?? 999, 999));
  const [quantity, setQuantity] = useState(1);
  useEscapeKey(onCancel);

  const total = quantity * goldPrice;
  const overBudget = total > gold;

  function clamp(n: number) {
    return Math.min(maxQty, Math.max(1, Math.floor(n) || 1));
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-sm panel p-4">
        <h2 className="font-medium text-parchment">Kup przedmiot</h2>

        {stackable ? (
          <>
            <p className="mt-2 text-sm text-parchment-dim">
              <span className="font-medium text-parchment">{itemName}</span> — {goldPrice} złota / szt.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setQuantity((q) => clamp(q - 1))}
                className="h-8 w-8 rounded-md border border-line-soft text-parchment-dim hover:bg-panel-raised"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={maxQty}
                value={quantity}
                onChange={(e) => setQuantity(clamp(Number(e.target.value)))}
                className="h-8 w-20 rounded-md border border-line-soft bg-ink px-2 text-center text-parchment outline-none focus:border-gold"
              />
              <button
                onClick={() => setQuantity((q) => clamp(q + 1))}
                className="h-8 w-8 rounded-md border border-line-soft text-parchment-dim hover:bg-panel-raised"
              >
                +
              </button>
              {stock !== null && <span className="ml-2 text-xs text-parchment-faint">zapas: {stock}</span>}
            </div>
            <p className={`mt-3 text-sm ${overBudget ? "text-red-400" : "text-parchment-dim"}`}>
              Razem: <span className="font-medium">{total}</span> złota
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-parchment-dim">
            Kupić <span className="font-medium text-parchment">{itemName}</span> za{" "}
            <span className={`font-medium ${overBudget ? "text-red-400" : "text-gold-bright"}`}>{goldPrice}</span>{" "}
            złota?
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
          >
            Anuluj
          </button>
          <button
            onClick={() => onConfirm(stackable ? quantity : 1)}
            disabled={overBudget}
            className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            Kup
          </button>
        </div>
      </div>
    </div>
  );
}
