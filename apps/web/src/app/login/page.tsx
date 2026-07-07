"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trajectory } from "@/components/trajectory";
import { useLogin } from "@/hooks/use-auth";
import { readApiError } from "@/lib/api";
import { safeReturnUrl } from "@/lib/session-redirect";

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [returnUrl, setReturnUrl] = useState("/dashboard");

  // Read redirect context from the URL. We read window.location directly (rather
  // than useSearchParams) to avoid requiring a Suspense boundary in this client page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setExpired(params.get("expired") === "1");
    setReturnUrl(safeReturnUrl(params.get("returnUrl")));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await login.mutateAsync({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      router.push(returnUrl);
    } catch (err) {
      setError(await readApiError(err));
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              access
            </span>
            <Trajectory compact />
          </div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Seeded: admin@e-tawafsai.dev (admin) or staff@e-tawafsai.dev / password123
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expired ? (
            <p
              role="status"
              className="mb-4 rounded-md bg-amber-500/10 p-3 text-sm font-medium text-amber-600"
            >
              Your session expired. Please sign in again to continue.
            </p>
          ) : null}
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Need access?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Request access
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
