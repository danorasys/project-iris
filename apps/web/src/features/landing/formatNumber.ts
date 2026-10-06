// Colombian style: dots between thousands and a comma for decimals, also for
// 4-digit numbers (Intl leaves "2500" without the dot in Spanish).
export function formatNumber(value: number, decimals: number) {
  const [whole, fraction] = value.toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction ? `${grouped},${fraction}` : grouped;
}
