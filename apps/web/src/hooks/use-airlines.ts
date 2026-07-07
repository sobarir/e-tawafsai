"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AirlineDto, CreateAirlineInput, UpdateAirlineInput } from "@cometkit/shared";
import { api } from "@/lib/api";

/**
 * Query-key convention: [resource, params]. Mutations invalidate the
 * resource root so every list view refetches.
 */
export const airlinesKeys = { all: ["airlines"] as const };

export function useAirlines() {
  return useQuery<AirlineDto[]>({
    queryKey: airlinesKeys.all,
    queryFn: () => api.get("airlines").json<AirlineDto[]>(),
  });
}

export function useCreateAirline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAirlineInput) => api.post("airlines", { json: input }).json<AirlineDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: airlinesKeys.all }),
  });
}

export function useUpdateAirline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAirlineInput & { id: string }) =>
      api.patch(`airlines/${id}`, { json: input }).json<AirlineDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: airlinesKeys.all }),
  });
}

export function useDeleteAirline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`airlines/${id}`).json<{ ok: true }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: airlinesKeys.all }),
  });
}
