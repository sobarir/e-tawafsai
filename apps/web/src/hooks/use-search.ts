"use client";

import { useQuery } from "@tanstack/react-query";
import type { Paginated, SearchParams, SearchResultDto } from "@cometkit/shared";
import { api } from "@/lib/api";

export const searchKeys = {
  all: ["search"] as const,
  list: (params: Partial<SearchParams>) => ["search", params] as const,
};

export function useSearchPackages(params: Partial<SearchParams>) {
  return useQuery<Paginated<SearchResultDto>>({
    queryKey: searchKeys.list(params),
    queryFn: () => {
      // Drop undefined/null/empty values so the query string stays clean.
      const searchParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") searchParams[k] = String(v);
      }
      return api.get("search/packages", { searchParams }).json<Paginated<SearchResultDto>>();
    },
    placeholderData: (previous) => previous,
  });
}
