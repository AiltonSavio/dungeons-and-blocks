export function formatHeroTimestamp(seconds: number) {
  if (!seconds) return "—";
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
