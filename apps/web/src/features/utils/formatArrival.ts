const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

/** "3 oct 2026, 10:42 a. m.", when a notification arrived. */
export function formatArrival(isoDate: string): string {
  return dateTime.format(new Date(isoDate));
}

const timeOnly = new Intl.DateTimeFormat("es-CO", { timeStyle: "short" });
const dayAndMonth = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
const withYear = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });

/** The short date of a mail inbox: only the time if it's from today, the
 * day and month this year ("3 oct"), and the year too if it's older. */
export function formatShortArrival(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate);
  if (date.toDateString() === now.toDateString()) return timeOnly.format(date);
  if (date.getFullYear() === now.getFullYear()) return dayAndMonth.format(date);
  return withYear.format(date);
}
