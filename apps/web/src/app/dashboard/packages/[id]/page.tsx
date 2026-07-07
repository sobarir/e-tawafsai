"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-auth";
import {
  usePackage,
  useCreatePackage,
  useUpdatePackage,
  useAddHotel,
  usePublishPackage,
  useUnpublishPackage,
  useUploadFlyer,
  useTags,
  useCreateTag,
} from "@/hooks/use-packages";
import {
  useDepartures,
  useCreateDeparture,
  useDeleteDeparture,
  useAdjustDepartureSeats,
} from "@/hooks/use-departures";
import { useProviders } from "@/hooks/use-providers";
import { useCategories } from "@/hooks/use-categories";
import { useAirlines } from "@/hooks/use-airlines";
import { useDepartureCities } from "@/hooks/use-departure-cities";
import { api, readApiError } from "@/lib/api";
import { DepartureFormFields, type DepartureFormFieldsHandle } from "./departure-form-fields";

export default function PackageDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const isNew = id === "new";

  const { data: me } = useMe();
  const { data: pkg, isPending: isPackagePending } = usePackage(id);
  const { data: providersList } = useProviders(1, 100);
  const { data: tagsList } = useTags();

  const createPackage = useCreatePackage();
  const updatePackage = useUpdatePackage();
  const addHotel = useAddHotel();
  const publishPackage = usePublishPackage();
  const unpublishPackage = useUnpublishPackage();
  const uploadFlyer = useUploadFlyer();
  const createTag = useCreateTag();

  const [title, setTitle] = useState("");
  const [providerId, setProviderId] = useState("");
  const [productType, setProductType] = useState("umrah");
  const [categoryId, setCategoryId] = useState<string>("");
  const [plusDestination, setPlusDestination] = useState("");
  const [durationDays, setDurationDays] = useState(9);
  const [description, setDescription] = useState("");
  const [airlineId, setAirlineId] = useState("");
  const [flightRoute, setFlightRoute] = useState("");
  const [departureCityId, setDepartureCityId] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [slug, setSlug] = useState("");

  // Flyer images state
  const [flyers, setFlyers] = useState<string[]>([]);

  // Hotels state
  const [cityName, setCityName] = useState("Makkah");
  const [hotelName, setHotelName] = useState("");
  const [stars, setStars] = useState(3);
  const [distanceM, setDistanceM] = useState<number | "">("");
  const [isPelataran, setIsPelataran] = useState(false);

  // Custom Tag input state
  const [newTagName, setNewTagName] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Optional inline first departure (create-time only)
  const inlineDepartureRef = useRef<DepartureFormFieldsHandle>(null);

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (pkg) {
      setTitle(pkg.title);
      setProviderId(pkg.providerId);
      setProductType(pkg.productType);
      setCategoryId(pkg.categoryId ?? "");
      setPlusDestination(pkg.plusDestination || "");
      setDurationDays(pkg.durationDays || 9);
      setDescription(pkg.description || "");
      setAirlineId(pkg.airlineId ?? "");
      setFlightRoute(pkg.flightRoute || "");
      setDepartureCityId(pkg.departureCityId ?? "");
      setIsFeatured(pkg.isFeatured);
      setSlug(pkg.slug);
      setFlyers(pkg.flyers);
      setSelectedTags(pkg.tags);
    }
  }, [pkg]);

  useEffect(() => {
    if (isNew && providersList?.data) {
      const firstActive = providersList.data.find((prov) => prov.isActive);
      setProviderId(firstActive?.id || "");
    }
  }, [isNew, providersList]);

  const { data: categoriesList } = useCategories(providerId, productType);
  const { data: airlinesList } = useAirlines();
  const { data: departureCitiesList } = useDepartureCities();

  // The category options depend on the selected provider + product type. When
  // either changes and the currently-selected category no longer belongs to
  // the newly loaded list, clear the selection rather than keep a stale id.
  useEffect(() => {
    if (categoryId && categoriesList && !categoriesList.some((c) => c.id === categoryId)) {
      setCategoryId("");
    }
  }, [categoriesList, categoryId]);

  // Only active providers are selectable, plus the package's currently-assigned
  // provider (even if it has since been deactivated) so the selection is not lost.
  const selectableProviders =
    providersList?.data.filter((prov) => prov.isActive || prov.id === providerId) ?? [];

  // Only active master rows are selectable, plus the currently-assigned row
  // (even if since deactivated) so an existing package's value is not lost.
  const airlineOptions = (airlinesList ?? []).filter((a) => a.isActive || a.id === airlineId);
  const departureCityOptions = (departureCitiesList ?? []).filter((c) => c.isActive || c.id === departureCityId);

  if (!isAdmin && isNew) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          admin required
        </span>
        <p className="text-sm text-muted-foreground">
          Creating packages requires an admin account.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/packages">Back to packages</Link>
        </Button>
      </main>
    );
  }

  const handleUploadFlyer = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const res = await uploadFlyer.mutateAsync(file);
      setFlyers((prev) => [...prev, res.url]);
      if (!isNew) {
        await api.post(`packages/${id}/flyer`, { json: { url: res.url } });
      }
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload = {
      title: title.trim(),
      providerId,
      productType: productType as "umrah" | "haji_khusus" | "haji_furoda",
      categoryId: categoryId || null,
      plusDestination: plusDestination.trim() || null,
      durationDays: Number(durationDays),
      description: description.trim() || null,
      airlineId: airlineId || null,
      flightRoute: flightRoute.trim() || null,
      departureCityId: departureCityId || null,
      isFeatured,
    };

    try {
      if (isNew) {
        const created = await createPackage.mutateAsync(payload);
        // Save uploaded flyers
        for (const fUrl of flyers) {
          await api.post(`packages/${created.id}/flyer`, { json: { url: fUrl } });
        }
        // Save selected tags
        for (const tName of selectedTags) {
          await api.post("packages/tags", { json: { name: tName } });
        }
        // Optional inline first departure: skip cleanly when no date was entered.
        const departurePayload = inlineDepartureRef.current?.buildPayload();
        if (departurePayload) {
          await api.post("departures", { json: { packageId: created.id, ...departurePayload } });
        }
        router.push(`/dashboard/packages/${created.id}`);
      } else {
        await updatePackage.mutateAsync({ id, ...payload });
        setSuccess("Package details saved successfully.");
      }
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const handleAddHotel = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!hotelName.trim()) {
      setError("Hotel name is required");
      return;
    }

    try {
      await addHotel.mutateAsync({
        packageId: id,
        hotel: {
          cityName: cityName.trim(),
          name: hotelName.trim(),
          stars: Number(stars),
          distanceM: distanceM === "" ? null : Number(distanceM),
          isPelataran,
        },
      });
      setHotelName("");
      setDistanceM("");
      setIsPelataran(false);
      setSuccess("Hotel added successfully.");
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const handlePublish = async () => {
    setError(null);
    setSuccess(null);
    try {
      await publishPackage.mutateAsync(id);
      setSuccess("Package published successfully.");
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const handleUnpublish = async () => {
    setError(null);
    setSuccess(null);
    try {
      await unpublishPackage.mutateAsync(id);
      setSuccess("Package reverted to draft.");
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const handleAddCustomTag = async () => {
    setError(null);
    if (!newTagName.trim()) return;

    try {
      const created = await createTag.mutateAsync(newTagName.trim());
      if (!selectedTags.includes(created.name)) {
        const nextTags = [...selectedTags, created.name];
        setSelectedTags(nextTags);
        if (!isNew) {
          await api.patch(`packages/${id}`, { json: { tags: nextTags } });
        }
      }
      setNewTagName("");
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const toggleTag = async (tagName: string) => {
    setError(null);
    const nextTags = selectedTags.includes(tagName)
      ? selectedTags.filter((t) => t !== tagName)
      : [...selectedTags, tagName];

    setSelectedTags(nextTags);
    if (!isNew) {
      try {
        await api.patch(`packages/${id}`, { json: { tags: nextTags } });
      } catch (err) {
        setError(await readApiError(err));
      }
    }
  };

  if (isPackagePending && !isNew) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="flex h-64 items-center justify-center">
          <span className="font-mono text-xs animate-pulse">Loading details...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
            {isNew ? "package · create" : "package · detail"}
          </span>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? "Create Package" : title}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/packages">Back</Link>
          </Button>
        </div>
      </header>

      {pkg?.needsReview && (
        <div role="alert" className="mb-6 rounded-md bg-amber-500/10 border border-amber-500/20 p-4 text-sm text-amber-600 dark:text-amber-400 font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase bg-amber-500/20 px-1.5 py-0.5 rounded text-[10px] tracking-wider">needs review</span>
            <span>All departure slots for this package are closed (full, departed, or cancelled). Please review and add new schedules.</span>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600 font-medium">
          {success}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <form onSubmit={handleFormSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Flyer Upload (Optional)</CardTitle>
                <CardDescription>Upload flyer images from camera or gallery.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="flyer">Flyer Image</Label>
                  <div className="flex flex-wrap gap-2">
                    {flyers.map((fUrl, idx) => (
                      <div key={idx} className="relative w-24 h-24 border rounded overflow-hidden">
                        <img src={fUrl} alt={`Flyer ${idx}`} className="object-contain w-full h-full" />
                      </div>
                    ))}
                  </div>
                  {isAdmin && (
                    <Input
                      id="flyer"
                      type="file"
                      accept="image/*"
                      onChange={handleUploadFlyer}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Package Profile</CardTitle>
                <CardDescription>Core details, provider, and type settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Package Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={!isAdmin}
                    required
                  />
                </div>

                {!isNew && (
                  <div className="grid gap-2">
                    <Label htmlFor="slug">Slug</Label>
                    <Input
                      id="slug"
                      value={slug}
                      disabled
                      className="font-mono text-xs"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="provider">Licensed Provider</Label>
                    <select
                      id="provider"
                      value={providerId}
                      onChange={(e) => setProviderId(e.target.value)}
                      disabled={!isAdmin}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectableProviders.map((prov) => (
                        <option key={prov.id} value={prov.id}>
                          {prov.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="productType">Product Type</Label>
                    <select
                      id="productType"
                      value={productType}
                      onChange={(e) => setProductType(e.target.value)}
                      disabled={!isAdmin}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="umrah">Umrah</option>
                      <option value="haji_khusus">Haji Khusus (Locked)</option>
                      <option value="haji_furoda">Haji Furoda (Locked)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="category">Category</Label>
                    <select
                      id="category"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      disabled={!isAdmin}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">— Select category —</option>
                      {(categoriesList ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="plusDestination">Plus Destination</Label>
                    <Input
                      id="plusDestination"
                      value={plusDestination}
                      onChange={(e) => setPlusDestination(e.target.value)}
                      placeholder="e.g. Dubai, Mesir"
                      disabled={!isAdmin}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="duration">Duration (Days)</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={durationDays}
                      onChange={(e) => setDurationDays(Number(e.target.value))}
                      disabled={!isAdmin}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={!isAdmin}
                    className="min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Flight details</CardTitle>
                <CardDescription>Specify airline, route and departure logistics.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="airline">Airline</Label>
                    <select
                      id="airline"
                      value={airlineId}
                      onChange={(e) => setAirlineId(e.target.value)}
                      disabled={!isAdmin}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">— Select airline —</option>
                      {airlineOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.isActive ? "" : " (inactive)"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="flightRoute">Flight Route</Label>
                    <Input
                      id="flightRoute"
                      value={flightRoute}
                      onChange={(e) => setFlightRoute(e.target.value)}
                      placeholder="e.g. CGK-MED-CGK"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="departureCity">Departure City</Label>
                    <select
                      id="departureCity"
                      value={departureCityId}
                      onChange={(e) => setDepartureCityId(e.target.value)}
                      disabled={!isAdmin}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">— Select departure city —</option>
                      {departureCityOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.isActive ? "" : " (inactive)"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isFeatured"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    disabled={!isAdmin}
                    className="rounded border-input text-primary"
                  />
                  <Label htmlFor="isFeatured">Featured Package</Label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inclusions & Exclusions</CardTitle>
                <CardDescription>Select seeded package tags or add custom tags.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {tagsList?.map((tag) => {
                    const isSelected = selectedTags.includes(tag.name);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.name)}
                        className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                          isSelected
                            ? "bg-primary text-primary-foreground ring-primary"
                            : "bg-muted text-muted-foreground ring-muted-foreground/20 hover:bg-muted/80"
                        }`}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>

                {isAdmin && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Add custom tag (e.g. VIP Lounge)"
                      className="max-w-xs"
                    />
                    <Button type="button" size="sm" onClick={handleAddCustomTag}>
                      Add Tag
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {isAdmin && isNew && (
              <Card>
                <CardHeader>
                  <CardTitle>First departure (optional)</CardTitle>
                  <CardDescription>
                    Add the first departure schedule now, or leave empty and add departures later. Enter a departure date to include it.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DepartureFormFields ref={inlineDepartureRef} />
                </CardContent>
              </Card>
            )}

            {isAdmin && (
              <div className="flex justify-end">
                <Button type="submit" disabled={createPackage.isPending || updatePackage.isPending}>
                  {isNew ? "Create Package" : "Save Changes"}
                </Button>
              </div>
            )}
          </form>

          {!isNew && (
            <div className="mt-8">
              <DeparturesSection packageId={id} isAdmin={isAdmin} />
            </div>
          )}
        </div>

        {!isNew && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Publish Invariants</CardTitle>
                <CardDescription>Evaluate listing completeness.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b">
                  <span className="text-sm font-medium">Publish State</span>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                      pkg?.status === "published"
                        ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                        : "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                    }`}
                  >
                    {pkg?.status.toUpperCase()}
                  </span>
                </div>

                {isAdmin && (
                  <div className="pt-2">
                    {pkg?.status === "published" ? (
                      <Button
                        onClick={handleUnpublish}
                        variant="outline"
                        className="w-full text-destructive border-destructive/20 hover:bg-destructive/10 text-xs"
                        size="sm"
                      >
                        Unpublish Package
                      </Button>
                    ) : (
                      <Button onClick={handlePublish} className="w-full text-xs" size="sm">
                        Publish Package
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add Hotel (One-to-Many)</CardTitle>
                <CardDescription>Attach hotels for Makkah, Madinah or transit cities.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddHotel} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="city">City Name</Label>
                    <select
                      id="city"
                      value={cityName}
                      onChange={(e) => setCityName(e.target.value)}
                      disabled={!isAdmin}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="Makkah">Makkah</option>
                      <option value="Madinah">Madinah</option>
                      {plusDestination && <option value={plusDestination}>{plusDestination}</option>}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="hotelName">Hotel Name</Label>
                    <Input
                      id="hotelName"
                      value={hotelName}
                      onChange={(e) => setHotelName(e.target.value)}
                      disabled={!isAdmin}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="stars">Stars (1-5)</Label>
                      <Input
                        id="stars"
                        type="number"
                        min="1"
                        max="5"
                        value={stars}
                        onChange={(e) => setStars(Number(e.target.value))}
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="distance">Distance (Meters)</Label>
                      <Input
                        id="distance"
                        type="number"
                        value={distanceM}
                        onChange={(e) => setDistanceM(e.target.value === "" ? "" : Number(e.target.value))}
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>

                  {cityName === "Makkah" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="pelataran"
                        checked={isPelataran}
                        onChange={(e) => setIsPelataran(e.target.checked)}
                        disabled={!isAdmin}
                        className="rounded border-input text-primary"
                      />
                      <Label htmlFor="pelataran">Haram Courtyard (Pelataran)</Label>
                    </div>
                  )}

                  {isAdmin && (
                    <Button type="submit" size="sm" className="w-full">
                      Add Hotel
                    </Button>
                  )}
                </form>

                {pkg?.hotels && pkg.hotels.length > 0 && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <span className="font-mono text-[10px] uppercase block tracking-wider text-muted-foreground">
                      Attached Hotels
                    </span>
                    <ul className="text-xs space-y-1.5 font-medium">
                      {pkg.hotels.map((h, idx) => (
                        <li key={idx} className="flex justify-between border-b pb-1">
                          <span>
                            {h.cityName}: {h.name} ({h.stars}★)
                          </span>
                          <span className="text-muted-foreground font-mono text-[10px]">
                            {h.isPelataran ? "Pelataran" : h.distanceM ? `${h.distanceM}m` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

function DeparturesSection({ packageId, isAdmin }: { packageId: string; isAdmin: boolean }) {
  const { data: departures = [], refetch } = useDepartures(packageId);
  const createMutation = useCreateDeparture();
  const deleteMutation = useDeleteDeparture();
  const adjustMutation = useAdjustDepartureSeats();

  // Create state
  const [showAddForm, setShowAddForm] = useState(false);
  const formRef = useRef<DepartureFormFieldsHandle>(null);
  const [error, setError] = useState<string | null>(null);

  // Adjust state
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustDelta, setAdjustDelta] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  // Audit Logs state
  const [logsId, setLogsId] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: string; delta: number; reason: string; actorId: string; createdAt: string }[]>([]);

  useEffect(() => {
    if (logsId) {
      api.get(`departures/${logsId}/adjustments`).json<unknown[]>()
        .then((data) => setLogs(data as typeof logs))
        .catch(() => {});
    }
  }, [logsId]);

  const handleAddDeparture = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = formRef.current?.buildPayload();
    if (!payload) {
      setError("Departure date is required.");
      return;
    }
    try {
      await createMutation.mutateAsync({ packageId, ...payload });
      formRef.current?.reset();
      setShowAddForm(false);
      void refetch();
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const handleAdjustSeats = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!adjustingId) return;
    if (!adjustReason.trim()) {
      setError("Reason is required for manual inventory adjustment.");
      return;
    }

    try {
      await adjustMutation.mutateAsync({
        id: adjustingId,
        delta: adjustDelta,
        reason: adjustReason.trim(),
      });
      setAdjustingId(null);
      setAdjustDelta(0);
      setAdjustReason("");
      void refetch();
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this departure schedule?")) return;
    try {
      await deleteMutation.mutateAsync(id);
      void refetch();
    } catch (err) {
      alert(await readApiError(err));
    }
  };

  const formatDate = (dStr: string) => {
    return new Date(dStr).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Card className="border-border/60 shadow-lg bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b pb-4">
        <div>
          <CardTitle className="font-mono text-lg font-bold tracking-tight">Departure Schedules</CardTitle>
          <CardDescription className="text-xs">Manage travel dates, pricing milestones, and real-time seat allotments.</CardDescription>
        </div>
        {isAdmin && !showAddForm && (
          <Button type="button" size="sm" onClick={() => setShowAddForm(true)}>
            Add Departure Slot
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-6">
        {error && (
          <div role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-xs text-destructive font-medium">
            {error}
          </div>
        )}

        {showAddForm && (
          <form onSubmit={handleAddDeparture} className="mb-6 border p-4 rounded-lg bg-muted/40 space-y-4">
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider">New departure slot</h3>
            <DepartureFormFields ref={formRef} />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => { formRef.current?.reset(); setShowAddForm(false); }}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Create schedule
              </Button>
            </div>
          </form>
        )}

        {adjustingId && (
          <form onSubmit={handleAdjustSeats} className="mb-6 border border-amber-500/30 p-4 rounded-lg bg-amber-500/5 space-y-4">
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Adjust Seat Allotment
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-1.5 col-span-1">
                <Label htmlFor="adjustDelta" className="text-xs">Delta (e.g. +5 or -3)</Label>
                <Input
                  id="adjustDelta"
                  type="number"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(Number(e.target.value))}
                  className="h-8 text-xs"
                  required
                />
              </div>
              <div className="grid gap-1.5 col-span-2">
                <Label htmlFor="adjustReason" className="text-xs">Adjustment Reason Note</Label>
                <Input
                  id="adjustReason"
                  placeholder="Reason for change..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="h-8 text-xs"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => setAdjustingId(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                Apply Allotment
              </Button>
            </div>
          </form>
        )}

        {logsId && (
          <div className="mb-6 border p-4 rounded-lg bg-muted/30 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider">Inventory Audit Logs</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => setLogsId(null)} className="h-7 text-xs">
                Close Logs
              </Button>
            </div>
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No manual adjustments recorded for this slot.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="text-xs border-b pb-1.5 flex justify-between">
                    <div>
                      <span className={`font-semibold font-mono ${log.delta > 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {log.delta > 0 ? `+${log.delta}` : log.delta} seats
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{log.reason}</p>
                    </div>
                    <div className="text-right text-[10px] text-muted-foreground font-mono">
                      <p>Actor: {log.actorId.slice(0, 8)}</p>
                      <p className="mt-0.5">{new Date(log.createdAt).toLocaleString("id-ID")}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {departures.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground italic">No departure schedules created yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {departures.map((dep) => {
              const statusColors: Record<string, string> = {
                open: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
                almost_full: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
                full: "bg-rose-500/10 text-rose-500 ring-rose-500/20",
                departed: "bg-slate-500/10 text-slate-500 ring-slate-500/20",
                cancelled: "bg-neutral-500/10 text-neutral-500 ring-neutral-500/20 border-dashed border",
              };

              return (
                <div key={dep.id} className="border p-4 rounded-lg bg-card hover:shadow-md transition-shadow flex flex-col md:flex-row justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-bold tracking-tight">
                        {formatDate(dep.departureDate)} — {formatDate(dep.returnDate)}
                      </span>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusColors[dep.status] || ""}`}>
                        {dep.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex gap-4 text-xs font-mono text-muted-foreground">
                      <span>Available: <strong className="text-foreground">{dep.seatAvailable}</strong></span>
                      <span>Total: <strong className="text-foreground">{dep.seatTotal}</strong></span>
                      <span>Booked: <strong className="text-foreground">{dep.seatBooked}</strong></span>
                      <span>Held: <strong className="text-foreground">{dep.seatHeld}</strong></span>
                    </div>

                    <div className="text-xs pt-1 border-t border-dashed mt-2">
                      <span className="text-[10px] text-muted-foreground uppercase font-mono block">Pricing & Schedule</span>
                      <div className="flex flex-wrap gap-x-4 mt-0.5 text-muted-foreground font-mono">
                        <span>Base: <strong className="text-foreground">Rp {dep.priceQuad.toLocaleString("id-ID")}</strong></span>
                        {dep.priceQuadDiscount != null && (
                          <span>Quad disc: <strong className="text-foreground">Rp {dep.priceQuadDiscount.toLocaleString("id-ID")}</strong></span>
                        )}
                        {dep.priceTriple != null && (
                          <span>Triple: <strong className="text-foreground">Rp {dep.priceTriple.toLocaleString("id-ID")}</strong></span>
                        )}
                        {dep.priceTripleDiscount != null && (
                          <span>Triple disc: <strong className="text-foreground">Rp {dep.priceTripleDiscount.toLocaleString("id-ID")}</strong></span>
                        )}
                        {dep.priceDouble != null && (
                          <span>Double: <strong className="text-foreground">Rp {dep.priceDouble.toLocaleString("id-ID")}</strong></span>
                        )}
                        {dep.priceDoubleDiscount != null && (
                          <span>Double disc: <strong className="text-foreground">Rp {dep.priceDoubleDiscount.toLocaleString("id-ID")}</strong></span>
                        )}
                        <span>DP: <strong className="text-foreground">Rp {dep.dpAmount.toLocaleString("id-ID")}</strong></span>
                        {dep.paymentSchedule.map((milestone, mIdx) => (
                          <span key={mIdx}>
                            {milestone.name}: <strong className="text-foreground">Rp {milestone.amount.toLocaleString("id-ID")}</strong> ({milestone.daysBeforeDeparture} days before departure)
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex md:flex-col justify-end gap-2 items-end">
                    {isAdmin && (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAdjustingId(dep.id);
                            setAdjustDelta(0);
                            setAdjustReason("");
                          }}
                          className="h-8 text-xs"
                        >
                          Adjust Seats
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setLogsId(dep.id)}
                          className="h-8 text-xs font-mono"
                        >
                          Logs
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(dep.id)}
                          className="h-8 text-xs text-destructive hover:bg-destructive/10"
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
