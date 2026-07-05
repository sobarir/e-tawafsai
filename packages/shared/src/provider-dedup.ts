export function normalizeProviderName(name: string): string {
  return name.trim().toLowerCase();
}

export function normalizePpiu(ppiu: string | null | undefined): string | null {
  if (ppiu == null) return null;
  const trimmed = ppiu.trim();
  return trimmed === "" ? null : trimmed;
}

export interface ProviderMergeInput {
  id: string;
  name: string;
  ppiuLicenseNo: string | null;
  isActive: boolean;
}

export interface ProviderMergePlan {
  survivorId: string;
  loserIds: string[];
}

/**
 * Groups ONE tenant's providers into duplicate clusters by the transitive
 * closure of shared normalized name OR shared non-empty normalized PPIU, and
 * returns one merge plan per cluster that has at least one loser. Survivor is
 * the active provider (if any), else the lowest ULID.
 */
export function planProviderMerges(rows: ProviderMergeInput[]): ProviderMergePlan[] {
  // Union-find over row indices.
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while ((parent[root] ?? root) !== root) {
      root = parent[root] ?? root;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Build edges: same normalized name, OR same non-empty normalized PPIU.
  const byName = new Map<string, number>();
  const byPpiu = new Map<string, number>();
  rows.forEach((r, i) => {
    const nameKey = normalizeProviderName(r.name);
    const seenName = byName.get(nameKey);
    if (seenName !== undefined) union(seenName, i);
    else byName.set(nameKey, i);

    const ppiuKey = normalizePpiu(r.ppiuLicenseNo);
    if (ppiuKey !== null) {
      const seenPpiu = byPpiu.get(ppiuKey);
      if (seenPpiu !== undefined) union(seenPpiu, i);
      else byPpiu.set(ppiuKey, i);
    }
  });

  // Group rows by cluster root.
  const clusters = new Map<number, ProviderMergeInput[]>();
  rows.forEach((r, i) => {
    const root = find(i);
    const list = clusters.get(root) ?? [];
    list.push(r);
    clusters.set(root, list);
  });

  const plans: ProviderMergePlan[] = [];
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => {
      // Active first, then lowest ULID.
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
    const survivor = sorted[0];
    if (!survivor) continue; // unreachable (length >= 2); satisfies strict indexing
    const loserIds = sorted
      .slice(1)
      .map((r) => r.id)
      .sort();
    plans.push({ survivorId: survivor.id, loserIds });
  }
  return plans.sort((a, b) => (a.survivorId < b.survivorId ? -1 : 1));
}
