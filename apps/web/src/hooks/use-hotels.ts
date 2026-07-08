"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HotelDto, CreateHotelInput, UpdateHotelInput } from "@cometkit/shared";
import { api } from "@/lib/api";

/**
 * Query-key convention: [resource, params]. Mutations invalidate the
 * resource root so every list view refetches.
 */
export const hotelsKeys = { all: ["hotels"] as const };

export function useHotels() {
  return useQuery<HotelDto[]>({
    queryKey: hotelsKeys.all,
    queryFn: () => api.get("hotels").json<HotelDto[]>(),
  });
}

export function useCreateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHotelInput) => api.post("hotels", { json: input }).json<HotelDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: hotelsKeys.all }),
  });
}

export function useUpdateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateHotelInput & { id: string }) =>
      api.patch(`hotels/${id}`, { json: input }).json<HotelDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: hotelsKeys.all }),
  });
}

export function useDeleteHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`hotels/${id}`).json<{ ok: true }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: hotelsKeys.all }),
  });
}
