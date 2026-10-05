const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

/** "3 oct 2026, 10:42 a. m.", when a notification arrived. */
export function formatArrival(isoDate: string): string {
  return dateTime.format(new Date(isoDate));
}
