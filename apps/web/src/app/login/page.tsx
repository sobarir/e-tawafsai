"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/use-auth";
import { readApiError } from "@/lib/api";
import { safeReturnUrl } from "@/lib/session-redirect";

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [returnUrl, setReturnUrl] = useState("/dashboard");

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
    <main className="flex min-h-screen">
      {/* Left panel — decorative image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <Image
          src="/images/hero-kaaba.png"
          alt="Masjid al-Haram"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-black/30" />
        <div className="relative z-10 flex flex-col justify-end p-12">
          <div className="flex items-center gap-2 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground font-display font-bold text-sm">
              e
            </div>
            <span className="font-display text-lg font-semibold text-white">
              e-tawafsai
            </span>
          </div>
          <h2 className="font-display text-3xl font-bold text-white leading-tight">
            Platform Umrah
            <br />
            <span className="gold-shimmer">Terpercaya</span>
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Kelola paket umrah, keberangkatan, dan jamaah dalam satu platform terintegrasi.
          </p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm">
              e
            </div>
            <span className="font-display text-lg font-semibold text-foreground">
              e-tawafsai
            </span>
          </div>

          <h1 className="font-display text-2xl font-bold text-foreground">
            Masuk
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Masuk ke dashboard untuk mengelola paket umrah Anda.
          </p>

          {expired && (
            <p
              role="status"
              className="mt-4 rounded-lg bg-gold-50 p-3 text-sm font-medium text-accent border border-gold-200"
            >
              Sesi Anda telah berakhir. Silakan masuk kembali.
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="anda@contoh.com"
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
                className="h-11"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full h-11 bg-primary hover:bg-stone-800 text-primary-foreground"
              disabled={login.isPending}
            >
              {login.isPending ? "Memproses…" : "Masuk"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground">
            Belum punya akun?{" "}
            <Link href="/register" className="font-medium text-accent hover:underline">
              Daftar akses
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
