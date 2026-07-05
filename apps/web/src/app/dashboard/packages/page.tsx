"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/hooks/use-auth";
import { usePackages } from "@/hooks/use-packages";

export default function PackagesPage() {
  const { data: me } = useMe();
  const { data: packages, isPending } = usePackages();

  const isAdmin = me?.role === "admin";

  if (isPending) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="flex h-64 items-center justify-center">
          <span className="font-mono text-xs animate-pulse">Loading packages...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
            registry · catalog
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Package Catalog</h1>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button asChild size="sm">
              <Link href="/dashboard/packages/new">Add Package</Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4">
        {packages?.map((pkg) => (
          <Card key={pkg.id} className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg">
                  <Link
                    href={`/dashboard/packages/${pkg.id}`}
                    className="hover:underline text-primary"
                  >
                    {pkg.title}
                  </Link>
                </CardTitle>
                <CardDescription>
                  Slug: <span className="font-mono text-xs text-foreground bg-muted px-1 py-0.5 rounded">{pkg.slug}</span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                    pkg.status === "published"
                      ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                      : pkg.status === "archived"
                      ? "bg-muted text-muted-foreground ring-muted"
                      : "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                  }`}
                >
                  {pkg.status.toUpperCase()}
                </span>
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-mono font-medium text-muted-foreground">
                  {pkg.productType.toUpperCase()}
                </span>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-4 text-sm">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Category
                </span>
                <span className="font-medium capitalize">{pkg.category}</span>
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Duration
                </span>
                <span>{pkg.durationDays ? `${pkg.durationDays} Days` : "Not specified"}</span>
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Airline & Route
                </span>
                <span>
                  {pkg.airline ? `${pkg.airline} (${pkg.departureCity ?? ""})` : "Not specified"}
                </span>
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Hotels
                </span>
                <span className="font-mono text-xs">
                  {pkg.hotels.length > 0
                    ? pkg.hotels.map((h) => `${h.cityName}: ${h.name}`).join(", ")
                    : "No hotels added"}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}

        {packages?.length === 0 && (
          <div className="h-64 flex items-center justify-center border border-dashed rounded-lg bg-muted/20">
            <span className="text-muted-foreground text-sm">No packages in the catalog yet</span>
          </div>
        )}
      </div>
    </main>
  );
}
