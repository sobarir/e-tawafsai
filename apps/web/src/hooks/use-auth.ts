"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type {
  AuthResponse,
  AuthUser,
  LoginInput,
} from "@cometkit/shared";
import { api } from "@/lib/api";
import { clearSessionHint, hasSession, setSessionHint } from "@/lib/auth-storage";

export function useMe() {
  return useQuery<AuthUser>({
    queryKey: ["me"],
    queryFn: () => api.get("auth/me").json<AuthUser>(),
    enabled: typeof window !== "undefined" && hasSession(),
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api.post("auth/login", { json: input }).json<AuthResponse>(),
    onSuccess: (data) => {
      setSessionHint();
      queryClient.setQueryData(["me"], data.user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    try {
      await api.post("auth/logout");
    } catch {
      // ignore — clear client state regardless
    }
    clearSessionHint();
    queryClient.removeQueries({ queryKey: ["me"] });
    router.push("/login");
  };
}
