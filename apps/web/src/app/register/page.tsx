"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
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
            Bergabunglah dengan
            <br />
            <span className="gold-shimmer">e-tawafsai</span>
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Daftarkan agen perjalanan Anda dan mulai kelola paket umrah secara profesional.
          </p>
        </div>
      </div>

      {/* Right panel — register form */}
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
            Daftar Akses
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pendaftaran publik sedang ditutup. Kirimkan email Anda untuk mengajukan akses.
          </p>

          {submitted ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg bg-green-50 p-4 border border-green-100">
                <p className="text-sm text-green-700">
                  Terima kasih! Permintaan akses Anda telah tercatat.
                  Tim kami akan meninjau dan menghubungi melalui email.
                </p>
              </div>
              <Button asChild className="w-full h-11 bg-primary hover:bg-stone-800 text-primary-foreground">
                <Link href="/login">Kembali ke Masuk</Link>
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="email">Alamat Email</Label>
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
                <Button
                  type="submit"
                  className="w-full h-11 bg-primary hover:bg-stone-800 text-primary-foreground"
                >
                  Ajukan Akses
                </Button>
              </form>
              <p className="mt-6 text-sm text-muted-foreground">
                Sudah punya akun?{" "}
                <Link href="/login" className="font-medium text-accent hover:underline">
                  Masuk
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
