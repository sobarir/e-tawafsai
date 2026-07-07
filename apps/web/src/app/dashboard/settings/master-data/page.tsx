"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMe } from "@/hooks/use-auth";
import {
  useAirlines,
  useCreateAirline,
  useUpdateAirline,
  useDeleteAirline,
} from "@/hooks/use-airlines";
import {
  useDepartureCities,
  useCreateDepartureCity,
  useUpdateDepartureCity,
  useDeleteDepartureCity,
} from "@/hooks/use-departure-cities";
import { readApiError } from "@/lib/api";
import { useConfirm } from "@/hooks/use-confirm";

interface Row {
  id: string;
  name: string;
  isActive: boolean;
}

interface MasterListProps {
  title: string;
  rows: Row[] | undefined;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onToggle: (id: string, isActive: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onError: (msg: string) => void;
}

function MasterList({ title, rows, onCreate, onRename, onToggle, onDelete, onError }: MasterListProps) {
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const confirm = useConfirm();

  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      onError(await readApiError(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Manage the {title.toLowerCase()} available in the package form.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`Add ${title.toLowerCase()}`}
          />
          <Button
            type="button"
            onClick={() =>
              guard(async () => {
                if (newName.trim()) {
                  await onCreate(newName.trim());
                  setNewName("");
                }
              })
            }
          >
            Add
          </Button>
        </div>
        <ul className="divide-y">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              {editId === r.id ? (
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" />
              ) : (
                <span className={`flex-1 text-sm ${r.isActive ? "" : "text-muted-foreground line-through"}`}>
                  {r.name}
                </span>
              )}
              {editId === r.id ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    guard(async () => {
                      await onRename(r.id, editName.trim());
                      setEditId(null);
                    })
                  }
                >
                  Save
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditId(r.id);
                    setEditName(r.name);
                  }}
                >
                  Edit
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => guard(() => onToggle(r.id, !r.isActive))}>
                {r.isActive ? "Deactivate" : "Activate"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() =>
                  guard(async () => {
                    const ok = await confirm({
                      title: "Delete this entry?",
                      description: `“${r.name}” will be removed from ${title.toLowerCase()}. This cannot be undone.`,
                      confirmLabel: "Delete",
                    });
                    if (ok) await onDelete(r.id);
                  })
                }
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function MasterDataPage() {
  const { data: me } = useMe();
  const [error, setError] = useState<string | null>(null);

  const airlines = useAirlines();
  const createAirline = useCreateAirline();
  const updateAirline = useUpdateAirline();
  const deleteAirline = useDeleteAirline();

  const cities = useDepartureCities();
  const createCity = useCreateDepartureCity();
  const updateCity = useUpdateDepartureCity();
  const deleteCity = useDeleteDepartureCity();

  if (me && me.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">admin required</span>
        <p className="text-sm text-muted-foreground">Master-data management requires an admin account.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
            admin · settings · master data
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Airlines & Departure Cities</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings">Settings</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </header>

      {error && (
        <div role="alert" className="mb-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium">
          {error}
        </div>
      )}

      <div className="space-y-8">
        <MasterList
          title="Airlines"
          rows={airlines.data}
          onCreate={(name) => createAirline.mutateAsync({ name }).then(() => setError(null))}
          onRename={(id, name) => updateAirline.mutateAsync({ id, name }).then(() => setError(null))}
          onToggle={(id, isActive) => updateAirline.mutateAsync({ id, isActive }).then(() => setError(null))}
          onDelete={(id) => deleteAirline.mutateAsync(id).then(() => setError(null))}
          onError={setError}
        />
        <MasterList
          title="Departure Cities"
          rows={cities.data}
          onCreate={(name) => createCity.mutateAsync({ name }).then(() => setError(null))}
          onRename={(id, name) => updateCity.mutateAsync({ id, name }).then(() => setError(null))}
          onToggle={(id, isActive) => updateCity.mutateAsync({ id, isActive }).then(() => setError(null))}
          onDelete={(id) => deleteCity.mutateAsync(id).then(() => setError(null))}
          onError={setError}
        />
      </div>
    </main>
  );
}
