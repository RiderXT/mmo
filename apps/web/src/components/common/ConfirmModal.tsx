import type { ReactNode } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

/** Themed replacement for a native confirm() — a centered modal with Cancel/Confirm buttons.
 * Generic sibling of inventory/DiscardConfirmModal (which stays as-is for its specific
 * name+upgradeLevel item-loss copy); this one takes freeform title/message for every other
 * "are you sure?" prompt in the app. */
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Potwierdź",
  cancelLabel = "Anuluj",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions (delete, discard) vs. gold for neutral ones. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeKey(onCancel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-sm panel p-4">
        <h2 className="font-medium text-parchment">{title}</h2>
        <p className="mt-2 text-sm text-parchment-dim">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={
              danger
                ? "rounded-md bg-red-500 px-4 py-1.5 text-sm font-medium text-ink hover:bg-red-400"
                : "rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
