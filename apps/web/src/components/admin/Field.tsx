import type { ReactNode } from "react";

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-indigo-500";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export { inputClass };
