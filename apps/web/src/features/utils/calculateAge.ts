// Reads "YYYY-MM-DD" as a local date. new Date("1990-04-12") would read it
// as UTC midnight, which in Colombia (UTC-5) is still the day before, so the
// age came out one year short on the birthday itself.
export function calculateAge(birthDateISO: string, today: Date = new Date()): number {
    const [year, month, day] = birthDateISO.split("-").map(Number)
    let age = today.getFullYear() - year
    const hasNotHadBirthdayYet =
        today.getMonth() + 1 < month ||
        (today.getMonth() + 1 === month && today.getDate() < day)
    if (hasNotHadBirthdayYet) age--
    return age
}

// "1 año" or "7 años", for the kids' rows of the parents' portal.
export function ageLabel(birthDateISO: string): string {
    const age = calculateAge(birthDateISO)
    return age === 1 ? "1 año" : `${age} años`
}
