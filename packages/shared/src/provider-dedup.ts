export function normalizeProviderName(name: string): string {
  return name.trim().toLowerCase();
}

export function normalizePpiu(ppiu: string | null | undefined): string | null {
  if (ppiu == null) return null;
  const trimmed = ppiu.trim();
  return trimmed === "" ? null : trimmed;
}
