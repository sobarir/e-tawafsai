"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MessageTemplateDto, TemplateInput } from "@cometkit/shared";
import { api } from "@/lib/api";

export const templateKeys = {
  all: ["templates"] as const,
};

export function useTemplates() {
  return useQuery<MessageTemplateDto[]>({
    queryKey: templateKeys.all,
    queryFn: () => api.get("settings/templates").json<MessageTemplateDto[]>(),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, ...input }: TemplateInput & { key: string }) =>
      api.patch(`settings/templates/${key}`, { json: input }).json<MessageTemplateDto>(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: templateKeys.all }),
  });
}
