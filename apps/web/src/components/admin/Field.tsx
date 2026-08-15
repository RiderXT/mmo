import type { ReactNode } from "react";

const inputClass =
  "w-full  border border-line-soft bg-panel-raised px-3 py-1.5 text-sm text-parchment outline-none focus:border-gold";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-parchment-dim">{label}</span>
      {children}
    </label>
  );
}

/** Compact inline label for a single input inside a flex-wrap row of several fields (e.g. a
 * drop/stat editor line) — Field's block layout would break that row, this stays inline and the
 * label stays visible even once the input has a value (unlike a placeholder). */
export function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] leading-tight text-parchment-faint">{label}</span>
      {children}
    </label>
  );
}

export { inputClass };
