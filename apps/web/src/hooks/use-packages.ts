"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PackageDto,
  CreatePackageInput,
  UpdatePackageInput,
  HotelInput,
} from "@cometkit/shared";
import { api } from "@/lib/api";

export const packageKeys = {
  all: ["packages"] as const,
  list: () => ["packages"] as const,
  detail: (id: string) => ["packages", id] as const,
  tags: () => ["packages", "tags"] as const,
};

export function usePackages() {
  return useQuery<PackageDto[]>({
    queryKey: packageKeys.list(),
    queryFn: () => api.get("packages").json<PackageDto[]>(),
  });
}

export function usePackage(id: string) {
  return useQuery<PackageDto>({
    queryKey: packageKeys.detail(id),
    queryFn: () => api.get(`packages/${id}`).json<PackageDto>(),
    enabled: !!id && id !== "new",
  });
}

export function useCreatePackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePackageInput) =>
      api.post("packages", { json: input }).json<PackageDto>(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: packageKeys.all });
    },
  });
}

export function useUpdatePackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePackageInput & { id: string }) =>
      api.patch(`packages/${id}`, { json: input }).json<PackageDto>(),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: packageKeys.all });
      void queryClient.invalidateQueries({ queryKey: packageKeys.detail(variables.id) });
    },
  });
}

export function useAddHotel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ packageId, hotel }: { packageId: string; hotel: HotelInput }) =>
      api.post(`packages/${packageId}/hotels`, { json: hotel }).json<unknown>(),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: packageKeys.detail(variables.packageId) });
    },
  });
}

export function usePublishPackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`packages/${id}/publish`).json<PackageDto>(),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: packageKeys.all });
      void queryClient.invalidateQueries({ queryKey: packageKeys.detail(id) });
    },
  });
}

export function useUnpublishPackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`packages/${id}/unpublish`).json<PackageDto>(),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: packageKeys.all });
      void queryClient.invalidateQueries({ queryKey: packageKeys.detail(id) });
    },
  });
}

export function useUploadFlyer() {
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post("packages/upload-flyer", { body: fd }).json<{ url: string }>();
    },
  });
}

export function useTags() {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: packageKeys.tags(),
    queryFn: () => api.get("packages/tags").json<{ id: string; name: string }[]>(),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post("packages/tags", { json: { name } }).json<{ id: string; name: string }>(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: packageKeys.tags() });
    },
  });
}
