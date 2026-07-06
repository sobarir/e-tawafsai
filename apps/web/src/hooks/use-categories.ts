"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CategoryDto,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@cometkit/shared";
import { api } from "@/lib/api";

/**
 * Query-key convention: [resource, params]. Mutations invalidate the
 * resource root so every page of the list refetches.
 */
export const categoriesKeys = {
  all: ["categories"] as const,
  list: (providerId: string, productType: string) =>
    ["categories", { providerId, productType }] as const,
};

export function useCategories(providerId: string, productType: string) {
  return useQuery<CategoryDto[]>({
    queryKey: categoriesKeys.list(providerId, productType),
    queryFn: () =>
      api
        .get("categories", { searchParams: { providerId, productType } })
        .json<CategoryDto[]>(),
    enabled: !!providerId,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      api.post("categories", { json: input }).json<CategoryDto>(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: categoriesKeys.all }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCategoryInput & { id: string }) =>
      api.patch(`categories/${id}`, { json: input }).json<CategoryDto>(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: categoriesKeys.all }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`categories/${id}`).json<{ ok: true }>(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: categoriesKeys.all }),
  });
}
