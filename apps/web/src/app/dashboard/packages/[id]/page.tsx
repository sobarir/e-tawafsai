"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";
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
import { useProviders } from "@/hooks/use-providers";
import { api, readApiError } from "@/lib/api";

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
  const [category, setCategory] = useState("regular");
  const [plusDestination, setPlusDestination] = useState("");
  const [durationDays, setDurationDays] = useState(9);
  const [description, setDescription] = useState("");
  const [airline, setAirline] = useState("");
  const [flightRoute, setFlightRoute] = useState("");
  const [departureCity, setDepartureCity] = useState("");
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

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (pkg) {
      setTitle(pkg.title);
      setProviderId(pkg.providerId);
      setProductType(pkg.productType);
      setCategory(pkg.category);
      setPlusDestination(pkg.plusDestination || "");
      setDurationDays(pkg.durationDays || 9);
      setDescription(pkg.description || "");
      setAirline(pkg.airline || "");
      setFlightRoute(pkg.flightRoute || "");
      setDepartureCity(pkg.departureCity || "");
      setIsFeatured(pkg.isFeatured);
      setSlug(pkg.slug);
      setFlyers(pkg.flyers);
      setSelectedTags(pkg.tags);
    }
  }, [pkg]);

  useEffect(() => {
    if (isNew && providersList?.data && providersList.data.length > 0) {
      setProviderId(providersList.data[0]?.id || "");
    }
  }, [isNew, providersList]);

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
      category: category as "regular" | "plus" | "private_vip" | "ramadan" | "arbain" | "other",
      plusDestination: plusDestination.trim() || null,
      durationDays: Number(durationDays),
      description: description.trim() || null,
      airline: airline.trim() || null,
      flightRoute: flightRoute.trim() || null,
      departureCity: departureCity.trim() || null,
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
                      {providersList?.data.map((prov) => (
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
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      disabled={!isAdmin}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="regular">Regular</option>
                      <option value="plus">Plus</option>
                      <option value="private_vip">Private VIP</option>
                      <option value="ramadan">Ramadan</option>
                      <option value="arbain">Arbain</option>
                      <option value="other">Other</option>
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
                    <Input
                      id="airline"
                      value={airline}
                      onChange={(e) => setAirline(e.target.value)}
                      disabled={!isAdmin}
                    />
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
                    <Input
                      id="departureCity"
                      value={departureCity}
                      onChange={(e) => setDepartureCity(e.target.value)}
                      disabled={!isAdmin}
                    />
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

            {isAdmin && (
              <div className="flex justify-end">
                <Button type="submit" disabled={createPackage.isPending || updatePackage.isPending}>
                  {isNew ? "Create Package" : "Save Changes"}
                </Button>
              </div>
            )}
          </form>
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
