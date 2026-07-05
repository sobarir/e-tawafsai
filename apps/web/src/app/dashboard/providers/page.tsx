"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/hooks/use-auth";
import { useProviders } from "@/hooks/use-providers";

export default function ProvidersPage() {
  const { data: me } = useMe();
  const [page, setPage] = useState(1);
  const { data, isPending } = useProviders(page);

  const isAdmin = me?.role === "admin";

  if (isPending) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="flex h-64 items-center justify-center">
          <span className="font-mono text-xs animate-pulse">Loading providers...</span>
        </div>
      </main>
    );
  }

  const meta = data?.meta;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
            registry · operators
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Licensed Providers</h1>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button asChild size="sm">
              <Link href="/dashboard/providers/new">Add Provider</Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4">
        {data?.data.map((provider) => (
          <Card key={provider.id} className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg">
                  <Link
                    href={`/dashboard/providers/${provider.id}`}
                    className="hover:underline text-primary"
                  >
                    {provider.name}
                  </Link>
                </CardTitle>
                <CardDescription>{provider.brandName}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                    provider.isActive
                      ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                      : "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                  }`}
                >
                  {provider.isActive ? "Active" : "Draft / Inactive"}
                </span>
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-mono font-medium text-muted-foreground">
                  Accreditation: {provider.accreditation.toUpperCase()}
                </span>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Contact Person
                </span>
                <span className="font-medium">{provider.contactPerson}</span>
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Contact Phone
                </span>
                <span>{provider.contactPhone}</span>
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Licensing
                </span>
                <span className="font-mono text-xs">
                  {provider.ppiuLicenseNo ? `PPIU: ${provider.ppiuLicenseNo}` : ""}
                  {provider.ppiuLicenseNo && provider.pihkLicenseNo ? " | " : ""}
                  {provider.pihkLicenseNo ? `PIHK: ${provider.pihkLicenseNo}` : ""}
                  {!provider.ppiuLicenseNo && !provider.pihkLicenseNo ? "No licenses recorded" : ""}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}

        {data?.data.length === 0 && (
          <div className="h-64 flex items-center justify-center border border-dashed rounded-lg bg-muted/20">
            <span className="text-muted-foreground text-sm">No providers registered yet</span>
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-8 pt-4 border-t">
          <span className="font-mono text-xs text-muted-foreground">
            Page {page} of {meta.totalPages} ({meta.total} total)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
