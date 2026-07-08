"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InclusionDto, CreateInclusionInput, UpdateInclusionInput } from "@cometkit/shared";
import { api } from "@/lib/api";

export const inclusionsKeys = { all: ["inclusions"] as const };

export function useInclusions() {
  return useQuery<InclusionDto[]>({
    queryKey: inclusionsKeys.all,
    queryFn: () => api.get("inclusions").json<InclusionDto[]>(),
  });
}

export function useCreateInclusion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInclusionInput) => api.post("inclusions", { json: input }).json<InclusionDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: inclusionsKeys.all }),
  });
}

export function useUpdateInclusion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateInclusionInput & { id: string }) =>
      api.patch(`inclusions/${id}`, { json: input }).json<InclusionDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: inclusionsKeys.all }),
  });
}

export function useDeleteInclusion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`inclusions/${id}`).json<{ ok: true }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: inclusionsKeys.all }),
  });
}
