import { useState } from "react";

/** Which notifications of the page are picked, like in Gmail. Only the ids
 * still on the page count, so a deleted one or another page's never stays
 * picked by mistake. */
export function useTraySelection(ids: readonly string[]) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const selected = ids.filter((id) => picked.has(id));
  const allSelected = ids.length > 0 && selected.length === ids.length;

  return {
    selected,
    allSelected,
    isSelected: (id: string) => picked.has(id),
    toggle: (id: string) =>
      setPicked((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: () => setPicked(allSelected ? new Set() : new Set(ids)),
    clear: () => setPicked(new Set()),
  };
}
