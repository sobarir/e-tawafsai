"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DepartureDto,
  CreateDepartureInput,
  UpdateDepartureInput,
} from "@cometkit/shared";
import { api } from "@/lib/api";
import { packageKeys } from "./use-packages";

export const departureKeys = {
  all: ["departures"] as const,
  list: (packageId?: string) => ["departures", { packageId }] as const,
  detail: (id: string) => ["departures", id] as const,
  widgets: () => ["departures", "widgets"] as const,
};

export function useDepartures(packageId?: string) {
  return useQuery<DepartureDto[]>({
    queryKey: departureKeys.list(packageId),
    queryFn: () => {
      const searchParams = packageId ? { packageId } : undefined;
      return api.get("departures", { searchParams }).json<DepartureDto[]>();
    },
  });
}

export function useDeparture(id: string) {
  return useQuery<DepartureDto>({
    queryKey: departureKeys.detail(id),
    queryFn: () => api.get(`departures/${id}`).json<DepartureDto>(),
    enabled: !!id,
  });
}

export function useCreateDeparture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDepartureInput) =>
      api.post("departures", { json: input }).json<DepartureDto>(),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: departureKeys.all });
      void queryClient.invalidateQueries({ queryKey: packageKeys.detail(variables.packageId) });
    },
  });
}

export function useUpdateDeparture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateDepartureInput & { id: string }) =>
      api.patch(`departures/${id}`, { json: input }).json<DepartureDto>(),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: departureKeys.all });
      void queryClient.invalidateQueries({ queryKey: departureKeys.detail(res.id) });
      void queryClient.invalidateQueries({ queryKey: packageKeys.detail(res.packageId) });
    },
  });
}

export function useDeleteDeparture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`departures/${id}`).json<{ success: boolean }>(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: departureKeys.all });
      void queryClient.invalidateQueries({ queryKey: packageKeys.all });
    },
  });
}

export function useAdjustDepartureSeats() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, delta, reason }: { id: string; delta: number; reason: string }) =>
      api.post(`departures/${id}/adjust`, { json: { delta, reason } }).json<DepartureDto>(),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: departureKeys.all });
      void queryClient.invalidateQueries({ queryKey: departureKeys.detail(res.id) });
      void queryClient.invalidateQueries({ queryKey: packageKeys.detail(res.packageId) });
    },
  });
}

export function useHoldDepartureSeats() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, seats }: { id: string; seats: number }) =>
      api.post(`departures/${id}/hold`, { json: { seats } }).json<DepartureDto>(),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: departureKeys.all });
      void queryClient.invalidateQueries({ queryKey: departureKeys.detail(res.id) });
      void queryClient.invalidateQueries({ queryKey: packageKeys.detail(res.packageId) });
    },
  });
}

export function useReleaseDepartureSeats() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, seats }: { id: string; seats: number }) =>
      api.post(`departures/${id}/release`, { json: { seats } }).json<DepartureDto>(),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: departureKeys.all });
      void queryClient.invalidateQueries({ queryKey: departureKeys.detail(res.id) });
      void queryClient.invalidateQueries({ queryKey: packageKeys.detail(res.packageId) });
    },
  });
}

export function useDepartureWidgets() {
  return useQuery<{
    pushNeeded: {
      departureId: string;
      packageName: string;
      departureDate: string;
      seatsAvailable: number;
      daysToDeparture: number;
    }[];
    almostFull: {
      departureId: string;
      packageName: string;
      departureDate: string;
      seatsAvailable: number;
      daysToDeparture: number;
    }[];
  }>({
    queryKey: departureKeys.widgets(),
    queryFn: () => api.get("departures/widgets").json(),
  });
}
