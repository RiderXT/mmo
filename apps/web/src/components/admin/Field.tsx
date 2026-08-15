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

export { inputClass };
