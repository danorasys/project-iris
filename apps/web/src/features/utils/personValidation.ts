// Same rules identity-service applies in app/api/schemas.py. The server is
// the real check, these only show the problem under the field right away.

import { isValidPhoneNumber } from "react-phone-number-input"
import { calculateAge } from "./calculateAge"

export const MIN_ADULT_AGE = 18
// Anything older is almost surely a typo in the year.
export const MAX_AGE = 120

const NAME_SIGNS = " '-."

/** Letters from any language (accents and ñ too), spaces and the few signs
 * real names use, like "María-José O'Neil". At least one letter. */
export function nameError(value: string, emptyMessage: string): string | null {
    const trimmed = value.trim()
    if (!trimmed) return emptyMessage
    if (trimmed.length > 120) return "Puede tener máximo 120 caracteres."
    const chars = [...trimmed]
    const hasLetter = chars.some((ch) => /\p{L}/u.test(ch))
    const onlyAllowed = chars.every((ch) => /\p{L}/u.test(ch) || NAME_SIGNS.includes(ch))
    if (!hasLetter || !onlyAllowed) return "Usa solo letras, espacios, guion, apóstrofo o punto."
    return null
}

/** Birth date of an adult. If the document issue date is known, the birth
 * date can't come after it. */
export function adultBirthDateError(
    birthDate: string,
    options: { documentIssuedAt?: string | null; today?: Date } = {},
): string | null {
    if (!birthDate) return "Ingresa tu fecha de nacimiento."
    const today = options.today ?? new Date()
    if (birthDate > toIsoDate(today)) return "La fecha de nacimiento no puede ser una fecha futura."
    const age = calculateAge(birthDate, today)
    if (age < MIN_ADULT_AGE) return `Debes ser mayor de edad (${MIN_ADULT_AGE} años o más).`
    if (age > MAX_AGE) return "Revisa el año de la fecha de nacimiento."
    if (options.documentIssuedAt && birthDate > options.documentIssuedAt) {
        return "La fecha de nacimiento no puede ser posterior a la fecha de expedición de tu documento."
    }
    return null
}

/** Birth date of a kid: it only has to exist and not be in the future. */
export function studentBirthDateError(birthDate: string, today: Date = new Date()): string | null {
    if (!birthDate) return "Ingresa la fecha de nacimiento."
    if (birthDate > toIsoDate(today)) return "La fecha de nacimiento no puede ser una fecha futura."
    return null
}

/** The number has to exist for the chosen country (same Google rules the
 * server uses), not only have the right amount of digits. */
export function phoneError(e164: string): string | null {
    if (!e164) return "Ingresa tu número de teléfono."
    if (!isValidPhoneNumber(e164)) return "El número de teléfono no es válido para el país elegido."
    return null
}

/** "YYYY-MM-DD" of a local date, for date inputs and comparisons. */
export function toIsoDate(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${date.getFullYear()}-${month}-${day}`
}

/** The latest birth date an adult can have today, for the max of a date input. */
export function latestAdultBirthDate(today: Date = new Date()): string {
    return toIsoDate(new Date(today.getFullYear() - MIN_ADULT_AGE, today.getMonth(), today.getDate()))
}
