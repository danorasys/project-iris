// "Emma Lucía Herrera Salazar": first names and last names together, so two
// kids called the same can be told apart. A last name that didn't come (an
// older answer of the server) is left out, never written as "undefined".
export function fullName(first: string, last?: string | null): string {
  return [first, last].filter(Boolean).join(" ");
}
