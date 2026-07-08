"use client";

import { useSearchPackages } from "@/hooks/use-search";
import { PackageCard } from "./package-card";

export function FeaturedPackages() {
  const { data, isPending } = useSearchPackages({ page: 1, pageSize: 6 });

  return (
    <section id="paket" className="section-spacing">
      <div className="mx-auto max-w-6xl px-6">
        {/* Section header */}
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-gold-50 px-4 py-1.5 text-xs font-semibold text-accent uppercase tracking-wider">
            Pilihan Terbaik
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold text-foreground sm:text-4xl">
            Paket Umrah Unggulan
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
            Paket umrah terpilih dengan hotel terbaik, maskapai terpercaya,
            dan bimbingan ibadah dari pembimbing berpengalaman.
          </p>
          <div className="gold-divider mx-auto mt-6 max-w-xs" />
        </div>

        {/* Package grid */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {isPending ? (
            // Skeleton loading cards
            Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="card-luxury animate-pulse overflow-hidden"
              >
                <div className="h-1 w-full bg-stone-200" />
                <div className="p-6 space-y-4">
                  <div className="flex justify-between">
                    <div className="h-5 w-24 rounded-full bg-stone-200" />
                    <div className="h-5 w-16 rounded bg-stone-200" />
                  </div>
                  <div className="h-6 w-3/4 rounded bg-stone-200" />
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-stone-100" />
                    <div className="h-4 w-5/6 rounded bg-stone-100" />
                  </div>
                  <div className="pt-4 border-t border-stone-100">
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <div className="h-3 w-16 rounded bg-stone-200" />
                        <div className="h-8 w-32 rounded bg-stone-200" />
                      </div>
                      <div className="h-10 w-28 rounded-lg bg-stone-200" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : data?.data && data.data.length > 0 ? (
            data.data.map((result) => (
              <PackageCard
                key={result.id}
                result={result}
                whatsappPhone="6281234567890"
              />
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-muted-foreground">
                Belum ada paket umrah tersedia saat ini.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
