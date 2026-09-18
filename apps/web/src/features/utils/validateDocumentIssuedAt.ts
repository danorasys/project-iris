/** Single source of truth for the issued-date/birth-date relationship, used
 * both on every keystroke (so typing a date directly, which bypasses the
 * date picker's own min/max UI, still gets checked) and again on submit as
 * the last gate. Re-run this whenever EITHER date changes: birth date is
 * this field's own lower bound, so an issued date that was valid a moment
 * ago can become invalid the instant birth date changes, even though
 * nothing was typed into this field itself. */

export function validateDocumentIssuedAt(
    issuedAt: string,
    birthDate: string,
    TODAY_ISO: string,
): string | null {
    if (!issuedAt) return null
    if (issuedAt > TODAY_ISO) {
        return "La fecha de expedición del documento no puede ser una fecha futura."
    }
    if (birthDate && issuedAt < birthDate) {
        return "La fecha de expedición no puede ser anterior a tu fecha de nacimiento. Ingresa una fecha válida."
    }
    return null
}
