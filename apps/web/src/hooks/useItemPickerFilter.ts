import { useMemo, useState } from "react";

export interface ItemFilterOption {
  id: string;
  name: string;
  type: string;
  classId: string | null;
}

/** Search/type/class filtering shared by every admin item picker (drop tables, starter items,
 * upgrade materials, chest loot, ...) — previously copy-pasted per page. */
export function useItemPickerFilter<T extends ItemFilterOption>(items: T[] | undefined) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        (typeFilter === "all" || i.type === typeFilter) &&
        (classFilter === "all" || i.classId === classFilter) &&
        (!q || i.name.toLowerCase().includes(q)),
    );
  }, [items, search, typeFilter, classFilter]);

  return {
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    classFilter,
    setClassFilter,
    filtered,
    total: items?.length ?? 0,
  };
}
