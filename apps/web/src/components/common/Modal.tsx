import type { ReactNode } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

/** Generic overlay for content too large for ConfirmModal's fixed-size prompt (long forms, etc.)
 * — same backdrop/Escape-to-close convention, but a wide, height-capped, internally-scrolling
 * box instead of a small fixed message box. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscapeKey(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col panel">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-medium text-parchment">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Zamknij"
            className="text-xl leading-none text-parchment-dim hover:text-parchment"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
