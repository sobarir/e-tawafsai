"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  useHotels,
  useCreateHotel,
  useUpdateHotel,
  useDeleteHotel,
} from "@/hooks/use-hotels";
import type { CreateHotelInput, HotelDto } from "@cometkit/shared";
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

interface HotelListProps {
  rows: HotelDto[] | undefined;
  onCreate: (input: CreateHotelInput) => Promise<void>;
  onUpdate: (id: string, input: CreateHotelInput) => Promise<void>;
  onToggle: (id: string, isActive: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onError: (msg: string) => void;
}

const CANONICAL_CITIES = ["Makkah", "Madinah"] as const;

// Richer than MasterList because a hotel carries city/stars/distance/pelataran.
// City entry is a canonical select (Makkah/Madinah) plus a transit escape so
// canonical names stay consistent for the publish rule and the form picker.
function HotelList({ rows, onCreate, onUpdate, onToggle, onDelete, onError }: HotelListProps) {
  const confirm = useConfirm();
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cityMode, setCityMode] = useState<"Makkah" | "Madinah" | "transit">("Makkah");
  const [transitCity, setTransitCity] = useState("");
  const [stars, setStars] = useState(3);
  const [distanceM, setDistanceM] = useState<number | "">("");
  const [isPelataran, setIsPelataran] = useState(false);

  const resolvedCity = cityMode === "transit" ? transitCity.trim() : cityMode;

  const resetForm = () => {
    setEditId(null);
    setName("");
    setCityMode("Makkah");
    setTransitCity("");
    setStars(3);
    setDistanceM("");
    setIsPelataran(false);
  };

  const startEdit = (r: HotelDto) => {
    setEditId(r.id);
    setName(r.name);
    if ((CANONICAL_CITIES as readonly string[]).includes(r.city)) {
      setCityMode(r.city as "Makkah" | "Madinah");
      setTransitCity("");
    } else {
      setCityMode("transit");
      setTransitCity(r.city);
    }
    setStars(r.stars);
    setDistanceM(r.distanceM ?? "");
    setIsPelataran(r.isPelataran);
  };

  const submit = async () => {
    if (!name.trim() || !resolvedCity) {
      onError("Hotel name and city are required.");
      return;
    }
    const payload: CreateHotelInput = {
      name: name.trim(),
      city: resolvedCity,
      stars,
      distanceM: distanceM === "" ? null : Number(distanceM),
      isPelataran,
    };
    try {
      if (editId) await onUpdate(editId, payload);
      else await onCreate(payload);
      resetForm();
    } catch (err) {
      onError(await readApiError(err));
    }
  };

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
        <CardTitle>Hotels</CardTitle>
        <CardDescription>Manage the hotel catalog available in the package form.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-md border p-3">
          <div className="grid gap-2">
            <Label htmlFor="hotel-name">Hotel name</Label>
            <Input id="hotel-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Swissotel Al Maqam" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="hotel-city">City</Label>
            <select
              id="hotel-city"
              value={cityMode}
              onChange={(e) => setCityMode(e.target.value as "Makkah" | "Madinah" | "transit")}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="Makkah">Makkah</option>
              <option value="Madinah">Madinah</option>
              <option value="transit">Transit / other…</option>
            </select>
            {cityMode === "transit" && (
              <Input
                value={transitCity}
                onChange={(e) => setTransitCity(e.target.value)}
                placeholder="Enter city (e.g. Jeddah)"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="hotel-stars">Stars (1–5)</Label>
              <Input
                id="hotel-stars"
                type="number"
                min="1"
                max="5"
                value={stars}
                onChange={(e) => setStars(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hotel-distance">Distance (m)</Label>
              <Input
                id="hotel-distance"
                type="number"
                value={distanceM}
                onChange={(e) => setDistanceM(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hotel-pelataran"
              checked={isPelataran}
              onChange={(e) => setIsPelataran(e.target.checked)}
              className="rounded border-input text-primary"
            />
            <Label htmlFor="hotel-pelataran">Haram courtyard (pelataran)</Label>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={submit}>
              {editId ? "Save" : "Add hotel"}
            </Button>
            {editId && (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        <ul className="divide-y">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <span className={`flex-1 text-sm ${r.isActive ? "" : "text-muted-foreground line-through"}`}>
                {r.name}
                <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {r.city} · {r.stars}★{r.isPelataran ? " · pelataran" : r.distanceM ? ` · ${r.distanceM}m` : ""}
                </span>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(r)}>
                Edit
              </Button>
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
                      title: "Delete this hotel?",
                      description: `“${r.name}” (${r.city}) will be removed from the catalog. This cannot be undone.`,
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

  const hotels = useHotels();
  const createHotel = useCreateHotel();
  const updateHotel = useUpdateHotel();
  const deleteHotel = useDeleteHotel();

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
          <h1 className="text-2xl font-bold tracking-tight">Airlines, Departure Cities & Hotels</h1>
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
        <HotelList
          rows={hotels.data}
          onCreate={(input) => createHotel.mutateAsync(input).then(() => setError(null))}
          onUpdate={(id, input) => updateHotel.mutateAsync({ id, ...input }).then(() => setError(null))}
          onToggle={(id, isActive) => updateHotel.mutateAsync({ id, isActive }).then(() => setError(null))}
          onDelete={(id) => deleteHotel.mutateAsync(id).then(() => setError(null))}
          onError={setError}
        />
      </div>
    </main>
  );
}
