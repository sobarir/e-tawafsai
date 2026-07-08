"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExclusionDto, CreateExclusionInput, UpdateExclusionInput } from "@cometkit/shared";
import { api } from "@/lib/api";

export const exclusionsKeys = { all: ["exclusions"] as const };

export function useExclusions() {
  return useQuery<ExclusionDto[]>({
    queryKey: exclusionsKeys.all,
    queryFn: () => api.get("exclusions").json<ExclusionDto[]>(),
  });
}

export function useCreateExclusion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExclusionInput) => api.post("exclusions", { json: input }).json<ExclusionDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: exclusionsKeys.all }),
  });
}

export function useUpdateExclusion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateExclusionInput & { id: string }) =>
      api.patch(`exclusions/${id}`, { json: input }).json<ExclusionDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: exclusionsKeys.all }),
  });
}

export function useDeleteExclusion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`exclusions/${id}`).json<{ ok: true }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: exclusionsKeys.all }),
  });
}
