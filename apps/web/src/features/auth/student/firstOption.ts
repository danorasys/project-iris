// The id of a catalog's first option, the way the selects keep it ("" while
// the catalog is still loading). The wizards use it as the value of a field
// the person hasn't touched yet.
export function firstOptionId(items: { id: number }[] | undefined): string {
    return items && items.length > 0 ? String(items[0].id) : ""
}
