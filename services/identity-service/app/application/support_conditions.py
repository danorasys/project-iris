# The rules about the support conditions of a kid, in one place for the
# registration, the extra kids and the edit from the parents' portal.

from __future__ import annotations

from app.domain.entities import SUPPORT_CONDITION_NAME_OTHER, SUPPORT_CONDITION_NAME_PREFER_NOT_TO_SPECIFY
from app.domain.exceptions import InvalidSupportCondition
from app.domain.ports import UnitOfWork


# A kid can have several conditions. Every one has to be in the catalog,
# "Prefiero no especificar" goes alone, and the free text goes only with
# "Otra condición (especificar)". The API already checked there is at least
# one and none is repeated.
async def check_support_conditions(uow: UnitOfWork, support_condition_ids: list[int], other: str | None) -> None:
    if not support_condition_ids or len(set(support_condition_ids)) != len(support_condition_ids):
        raise InvalidSupportCondition()

    # The catalog is small (15 rows), so one read is cheaper than one per id.
    catalog = {condition.id: condition.name for condition in await uow.support_conditions.list_all()}
    if any(condition_id not in catalog for condition_id in support_condition_ids):
        raise InvalidSupportCondition()
    chosen = {catalog[condition_id] for condition_id in support_condition_ids}

    if SUPPORT_CONDITION_NAME_PREFER_NOT_TO_SPECIFY in chosen and len(chosen) > 1:
        raise InvalidSupportCondition("'Prefiero no especificar' no se puede combinar con otra condición.")

    has_other = SUPPORT_CONDITION_NAME_OTHER in chosen
    if has_other and not (other or "").strip():
        raise InvalidSupportCondition("Debes especificar la condición.")
    if not has_other and other:
        raise InvalidSupportCondition(
            "Solo puedes especificar una condición cuando eliges 'Otra condición (especificar)'."
        )
