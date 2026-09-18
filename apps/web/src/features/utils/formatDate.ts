/** Formats an ISO date as readable Spanish text. Builds it from local
 * year/month/day instead of `new Date(iso)`, which parses as UTC midnight
 * and would show a day earlier in Colombia (UTC-5). */

export function formatDate(dateISO: string): string {
    if (!dateISO) return ""
    const [year, month, day] = dateISO.split("-").map(Number)
    return new Date(year, month - 1, day).toLocaleDateString("es-CO", {
        day: "numeric",
        month: "long",
        year: "numeric",
    })
}
