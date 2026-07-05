"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SettingsDto, SettingsInput } from "@cometkit/shared";
import { api } from "@/lib/api";

export const settingsKeys = {
  all: ["settings"] as const,
};

export function useSettings() {
  return useQuery<SettingsDto>({
    queryKey: settingsKeys.all,
    queryFn: () => api.get("settings").json<SettingsDto>(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) =>
      api.patch("settings", { json: input }).json<SettingsDto>(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
}
