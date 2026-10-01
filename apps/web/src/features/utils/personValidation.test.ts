import { describe, expect, it } from "vitest"
import { calculateAge } from "./calculateAge"
import { adultBirthDateError, latestAdultBirthDate, nameError, phoneError } from "./personValidation"

const TODAY = new Date(2026, 8, 29) // 29 de septiembre de 2026, hora local

describe("nameError", () => {
    it.each(["Ana", "María-José O'Neil", "Ñoño", "Jr."])("accepts %s", (name) => {
        expect(nameError(name, "vacío")).toBeNull()
    })

    it.each(["Ana123", "@@", "---", "Ana_María"])("rejects %s", (name) => {
        expect(nameError(name, "vacío")).toBe("Usa solo letras, espacios, guion, apóstrofo o punto.")
    })

    it("uses the given message when it's empty or only spaces", () => {
        expect(nameError("   ", "Ingresa tus nombres.")).toBe("Ingresa tus nombres.")
    })
})

describe("adultBirthDateError", () => {
    it("accepts an adult", () => {
        expect(adultBirthDateError("1990-04-12", { today: TODAY })).toBeNull()
    })

    it("rejects a minor, a future date and an impossible age", () => {
        expect(adultBirthDateError("2010-01-01", { today: TODAY })).toMatch(/mayor de edad/)
        expect(adultBirthDateError("2030-01-01", { today: TODAY })).toMatch(/futura/)
        expect(adultBirthDateError("1850-01-01", { today: TODAY })).toMatch(/año/)
    })

    it("rejects a birth date after the document issue date", () => {
        expect(adultBirthDateError("2008-01-01", { documentIssuedAt: "2007-03-01", today: TODAY })).toMatch(
            /expedición/,
        )
    })

    it("turns 18 exactly on the birthday", () => {
        expect(adultBirthDateError("2008-09-29", { today: TODAY })).toBeNull()
        expect(adultBirthDateError("2008-09-30", { today: TODAY })).toMatch(/mayor de edad/)
        expect(latestAdultBirthDate(TODAY)).toBe("2008-09-29")
    })
})

describe("calculateAge", () => {
    it("counts the birthday itself, whatever the time zone", () => {
        expect(calculateAge("1990-09-29", TODAY)).toBe(36)
        expect(calculateAge("1990-09-30", TODAY)).toBe(35)
    })
})

describe("phoneError", () => {
    it("accepts a real Colombian mobile and rejects one that can't exist", () => {
        expect(phoneError("+573001234567")).toBeNull()
        expect(phoneError("+570001234567")).toMatch(/no es válido/)
        expect(phoneError("")).toMatch(/Ingresa/)
    })
})
