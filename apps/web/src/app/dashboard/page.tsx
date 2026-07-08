"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/components/health-badge";
import { useLogout, useMe } from "@/hooks/use-auth";
import { useDashboardSummary } from "@/hooks/use-dashboard";
import { hasSession } from "@/lib/auth-storage";

function formatInt(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 font-display text-3xl font-semibold tracking-tight">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: user, isError, isPending } = useMe();
  const summary = useDashboardSummary();
  const logout = useLogout();

  useEffect(() => {
    if (!hasSession() || isError) {
      router.replace("/login");
    }
  }, [isError, router]);

  if (isPending || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          loading session…
        </span>
      </main>
    );
  }

  const s = summary.data;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          dashboard
        </span>
        <div className="flex items-center gap-3">
          <HealthBadge />
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/providers">Providers</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/packages">Packages</Link>
          </Button>
          {user.role === "admin" ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/settings">Settings</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/users">Users</Link>
              </Button>
            </>
          ) : null}
          <Button variant="outline" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <h1 className="font-display mt-10 text-3xl font-semibold tracking-tight">
        {user.name ? `Hello, ${user.name}.` : "Hello."}
      </h1>
      <p className="mt-2 text-muted-foreground">Overview of your Umrah operations.</p>

      {/* Quick actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild size="sm">
          <Link href="/dashboard/packages/new">New package</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/search">Search packages</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/providers">Manage providers</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/settings/master-data">Master data</Link>
        </Button>
      </div>

      {summary.isError ? (
        <p role="alert" className="mt-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load the dashboard summary. Check your connection and try refreshing.
        </p>
      ) : summary.isPending || !s ? (
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          loading summary…
        </p>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Packages"
              value={formatInt(s.packages.published)}
              hint={`${formatInt(s.packages.published)} published · ${formatInt(s.packages.draft)} draft`}
            />
            <Kpi
              label="Upcoming departures"
              value={formatInt(s.departures.upcoming)}
              hint={`${formatInt(s.departures.almostFull)} almost full`}
            />
            <Kpi
              label="Open seats"
              value={formatInt(s.departures.openSeats)}
              hint="across upcoming departures"
            />
            <Kpi
              label="Providers"
              value={formatInt(s.providers.active)}
              hint={`${formatInt(s.providers.active)} active · ${formatInt(s.providers.total)} total`}
            />
          </div>

          {/* Operational signal lists */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Urgent closing
                </CardTitle>
                <CardDescription className="text-xs">
                  Departures flagged almost full.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {s.urgentClosing.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No almost-full departures.</p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {s.urgentClosing.map((item) => (
                      <Link
                        key={item.departureId}
                        href={`/dashboard/packages/${item.packageId}`}
                        className="flex justify-between border-b pb-1.5 text-xs hover:text-accent"
                      >
                        <div>
                          <span className="block font-semibold">{item.packageTitle}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {new Date(item.departureDate).toLocaleDateString("id-ID")}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] font-semibold text-amber-600">
                          {item.seatsLeft} seats left
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-indigo-500/20 bg-indigo-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-sm font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Needs push (H-45)
                </CardTitle>
                <CardDescription className="text-xs">
                  Departures within 45 days that still have seats.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {s.needsPush.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nothing needs a sales push.</p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {s.needsPush.map((item) => (
                      <Link
                        key={item.departureId}
                        href={`/dashboard/packages/${item.packageId}`}
                        className="flex justify-between border-b pb-1.5 text-xs hover:text-accent"
                      >
                        <div>
                          <span className="block font-semibold">{item.packageTitle}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {new Date(item.departureDate).toLocaleDateString("id-ID")}
                          </span>
                        </div>
                        <div className="text-right font-mono text-[10px]">
                          <p className="font-semibold text-indigo-600">{item.seatsLeft} seats left</p>
                          <p className="text-muted-foreground">in {item.daysUntil} days</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent packages */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Recent packages</CardTitle>
              <CardDescription>Most recently updated.</CardDescription>
            </CardHeader>
            <CardContent>
              {s.recentPackages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No packages yet.{" "}
                  <Link href="/dashboard/packages/new" className="text-accent hover:underline">
                    Create your first package.
                  </Link>
                </p>
              ) : (
                <ul className="divide-y">
                  {s.recentPackages.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/dashboard/packages/${p.id}`}
                        className="flex items-center justify-between py-2 text-sm hover:text-accent"
                      >
                        <span className="font-medium">{p.title}</span>
                        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                          {p.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
