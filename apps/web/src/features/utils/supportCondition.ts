// Two entries of the support conditions catalog have their own rule. They
// are found by name and not by id: the catalog lives in the database of
// identity-service, where ids aren't guaranteed. Same names as in its
// app/domain/entities.py.

/** The one that asks for a free text. */
export const SUPPORT_CONDITION_NAME_OTHER = "Otra condición (especificar)";

/** The one for families that don't want to say. It always goes alone. */
export const SUPPORT_CONDITION_NAME_PREFER_NOT_TO_SPECIFY = "Prefiero no especificar";

/** What is needed of each catalog entry here. */
export interface SupportConditionOption {
  id: number;
  name: string;
}

/** A kid can have several conditions. This marks or unmarks one and keeps
 * the only rule between them: "Prefiero no especificar" can't go together
 * with any other, so marking it clears the rest, and marking any other
 * unmarks it. The result is sorted, so the same choice always looks the same. */
export function toggleSupportCondition(
  selectedIds: readonly number[],
  id: number,
  catalog: readonly SupportConditionOption[],
): number[] {
  if (selectedIds.includes(id)) return selectedIds.filter((selected) => selected !== id);

  const preferNotId = catalog.find((c) => c.name === SUPPORT_CONDITION_NAME_PREFER_NOT_TO_SPECIFY)?.id;
  if (id === preferNotId) return [id];
  return [...selectedIds.filter((selected) => selected !== preferNotId), id].sort((a, b) => a - b);
}

/** True when "Otra condición (especificar)" is one of the chosen ones. */
export function includesOtherCondition(
  selectedIds: readonly number[],
  catalog: readonly SupportConditionOption[],
): boolean {
  const otherId = catalog.find((c) => c.name === SUPPORT_CONDITION_NAME_OTHER)?.id;
  return otherId !== undefined && selectedIds.includes(otherId);
}

/** The names of the chosen conditions, in the order of the catalog. */
export function supportConditionNames(
  selectedIds: readonly number[],
  catalog: readonly SupportConditionOption[],
): string[] {
  return catalog.filter((c) => selectedIds.includes(c.id)).map((c) => c.name);
}
