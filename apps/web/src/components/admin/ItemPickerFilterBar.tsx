import { inputClass } from "./Field";
import { TYPE_LABELS } from "../../lib/statFormat";

export interface ItemPickerFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  classFilter: string;
  onClassFilterChange: (value: string) => void;
  classes: { id: string; name: string }[] | undefined;
  filteredCount: number;
  total: number;
}

/** Presentational search+type+class filter row for narrowing a long item `<select>` list —
 * pair with `useItemPickerFilter`. */
export function ItemPickerFilterBar({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  classFilter,
  onClassFilterChange,
  classes,
  filteredCount,
  total,
}: ItemPickerFilterBarProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <input
        className={`${inputClass} w-40`}
        placeholder="Szukaj itemu..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        className={`${inputClass} w-36`}
        value={typeFilter}
        onChange={(e) => onTypeFilterChange(e.target.value)}
      >
        <option value="all">Wszystkie typy</option>
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <option key={type} value={type}>
            {label}
          </option>
        ))}
      </select>
      <select
        className={`${inputClass} w-36`}
        value={classFilter}
        onChange={(e) => onClassFilterChange(e.target.value)}
      >
        <option value="all">Wszystkie klasy</option>
        <option value="">Uniwersalne</option>
        {classes?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <span className="self-center text-xs text-parchment-faint">
        {filteredCount} / {total}
      </span>
    </div>
  );
}
