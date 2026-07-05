"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/components/health-badge";
import { useLogout, useMe } from "@/hooks/use-auth";
import { useDepartureWidgets } from "@/hooks/use-departures";
import { hasSession } from "@/lib/auth-storage";

export default function DashboardPage() {
  const router = useRouter();
  const { data: user, isError, isPending } = useMe();
  const { data: widgets } = useDepartureWidgets();
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

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          mission control
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
      <p className="mt-2 text-muted-foreground">
        You are signed in. This dashboard is reference code — replace it with
        your first Comet feature.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Urgensi Closing (Almost Full)
            </CardTitle>
            <CardDescription className="text-xs">Departures with high booking urgency (status: almost_full).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!widgets?.almostFull || widgets.almostFull.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No departures in almost_full status.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {widgets.almostFull.map((item) => (
                  <div key={item.departureId} className="text-xs border-b pb-1.5 flex justify-between">
                    <div>
                      <span className="font-semibold block">{item.packageName}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Date: {new Date(item.departureDate).toLocaleDateString("id-ID")}
                      </span>
                    </div>
                    <div className="text-right font-mono text-[10px] space-y-0.5">
                      <p className="text-amber-600 font-semibold">{item.seatsAvailable} seats left</p>
                      <p className="text-muted-foreground">in {item.daysToDeparture} days</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-indigo-500/20 bg-indigo-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-sm font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Perlu Didorong (H-45)
            </CardTitle>
            <CardDescription className="text-xs">Departures within 45 days that still have available seats.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!widgets?.pushNeeded || widgets.pushNeeded.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No departures requiring sales push.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {widgets.pushNeeded.map((item) => (
                  <div key={item.departureId} className="text-xs border-b pb-1.5 flex justify-between">
                    <div>
                      <span className="font-semibold block">{item.packageName}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Date: {new Date(item.departureDate).toLocaleDateString("id-ID")}
                      </span>
                    </div>
                    <div className="text-right font-mono text-[10px] space-y-0.5">
                      <p className="text-indigo-600 font-semibold">{item.seatsAvailable} seats left</p>
                      <p className="text-muted-foreground">in {item.daysToDeparture} days</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>From GET /auth/me</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                ulid
              </div>
              <div className="mt-1 font-mono text-sm">{user.id}</div>
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                email
              </div>
              <div className="mt-1 text-sm">{user.email}</div>
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                role
              </div>
              <div className="mt-1 font-mono text-sm">{user.role}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next step</CardTitle>
            <CardDescription>Build through the workflow</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Open your AI coding agent and run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                /comet &quot;your feature idea&quot;
              </code>{" "}
              — it will be grilled, specced, designed, built with TDD, and
              verified against{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                bun run verify
              </code>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
