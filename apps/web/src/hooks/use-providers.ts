"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ProviderDto,
  StaffProviderDto,
  CreateProviderInput,
  UpdateProviderInput,
  Paginated,
} from "@cometkit/shared";
import { api } from "@/lib/api";

export const providerKeys = {
  all: ["providers"] as const,
  list: (page: number, limit: number) => ["providers", { page, limit }] as const,
  detail: (id: string) => ["providers", id] as const,
};

export function useProviders(page: number, limit = 10) {
  return useQuery<Paginated<ProviderDto | StaffProviderDto>>({
    queryKey: providerKeys.list(page, limit),
    queryFn: () =>
      api
        .get("providers", { searchParams: { page, limit } })
        .json<Paginated<ProviderDto | StaffProviderDto>>(),
    placeholderData: (previous) => previous,
  });
}

export function useProvider(id: string) {
  return useQuery<ProviderDto | StaffProviderDto>({
    queryKey: providerKeys.detail(id),
    queryFn: () => api.get(`providers/${id}`).json<ProviderDto | StaffProviderDto>(),
    enabled: !!id && id !== "new",
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProviderInput) =>
      api.post("providers", { json: input }).json<ProviderDto>(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: providerKeys.all }),
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateProviderInput & { id: string }) =>
      api.patch(`providers/${id}`, { json: input }).json<ProviderDto>(),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: providerKeys.all });
      void queryClient.invalidateQueries({ queryKey: providerKeys.detail(variables.id) });
    },
  });
}

export function useActivateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ppiuLicenseNo,
      pihkLicenseNo,
      consentConfirmed,
    }: {
      id: string;
      ppiuLicenseNo?: string | null;
      pihkLicenseNo?: string | null;
      consentConfirmed: boolean;
    }) =>
      api
        .post(`providers/${id}/activate`, {
          json: { ppiuLicenseNo, pihkLicenseNo, consentConfirmed },
        })
        .json<ProviderDto>(),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: providerKeys.all });
      void queryClient.invalidateQueries({ queryKey: providerKeys.detail(variables.id) });
    },
  });
}

export function useDeactivateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .post(`providers/${id}/deactivate`)
        .json<{ provider: ProviderDto; affectedPackages: { id: string; name: string }[] }>(),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: providerKeys.all });
      void queryClient.invalidateQueries({ queryKey: providerKeys.detail(id) });
    },
  });
}

export function useUploadLogo() {
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post("providers/upload-logo", { body: fd }).json<{ url: string }>();
    },
  });
}
