"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DepartureCityDto,
  CreateDepartureCityInput,
  UpdateDepartureCityInput,
} from "@cometkit/shared";
import { api } from "@/lib/api";

/**
 * Query-key convention: [resource, params]. Mutations invalidate the
 * resource root so every list view refetches.
 */
export const departureCitiesKeys = { all: ["departure-cities"] as const };

export function useDepartureCities() {
  return useQuery<DepartureCityDto[]>({
    queryKey: departureCitiesKeys.all,
    queryFn: () => api.get("departure-cities").json<DepartureCityDto[]>(),
  });
}

export function useCreateDepartureCity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDepartureCityInput) =>
      api.post("departure-cities", { json: input }).json<DepartureCityDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: departureCitiesKeys.all }),
  });
}

export function useUpdateDepartureCity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateDepartureCityInput & { id: string }) =>
      api.patch(`departure-cities/${id}`, { json: input }).json<DepartureCityDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: departureCitiesKeys.all }),
  });
}

export function useDeleteDepartureCity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`departure-cities/${id}`).json<{ ok: true }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: departureCitiesKeys.all }),
  });
}
