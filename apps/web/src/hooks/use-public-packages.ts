"use client";

import { useQuery } from "@tanstack/react-query";
import type { PublicPackageCardDto } from "@cometkit/shared";
import { api } from "@/lib/api";

export const publicPackageKeys = {
  featured: ["public-packages"] as const,
};

/**
 * Public, unauthenticated featured packages for the landing page. Hits the unguarded
 * `/public/packages` endpoint so anonymous visitors never trigger the 401→login redirect.
 */
export function usePublicFeaturedPackages() {
  return useQuery<PublicPackageCardDto[]>({
    queryKey: publicPackageKeys.featured,
    queryFn: () => api.get("public/packages").json<PublicPackageCardDto[]>(),
  });
}
