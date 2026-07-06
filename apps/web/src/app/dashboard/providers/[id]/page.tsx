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
  useProvider,
  useCreateProvider,
  useUpdateProvider,
  useActivateProvider,
  useDeactivateProvider,
  useUploadLogo,
} from "@/hooks/use-providers";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "@/hooks/use-categories";
import { readApiError } from "@/lib/api";
import type { CreateProviderInput, UpdateProviderInput } from "@cometkit/shared";

/** Phase 1 only supports categories for the Umrah product type. */
const CATEGORY_PRODUCT_TYPE = "umrah";

interface CategoryDraft {
  name: string;
  commissionType: string;
  commissionValue: number;
}

export default function ProviderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const isNew = id === "new";

  const { data: me } = useMe();
  const { data: provider, isPending } = useProvider(id);

  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider();
  const activateProvider = useActivateProvider();
  const deactivateProvider = useDeactivateProvider();
  const uploadLogo = useUploadLogo();

  const { data: categories = [] } = useCategories(
    isNew ? "" : id,
    CATEGORY_PRODUCT_TYPE,
  );
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [accreditation, setAccreditation] = useState("unknown");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [allowLogo, setAllowLogo] = useState(false);

  // Commission (Admin-only)
  const [commissionType, setCommissionType] = useState("flat_per_pax");
  const [commissionValue, setCommissionValue] = useState(0);
  const [commissionNotes, setCommissionNotes] = useState("");

  // Activation inputs
  const [ppiuLicense, setPpiuLicense] = useState("");
  const [pihkLicense, setPihkLicense] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);

  // Modal / Confirmations
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivateImpact, setDeactivateImpact] = useState<{ id: string; name: string }[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Categories (Admin-only)
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, CategoryDraft>>({});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (provider) {
      setName(provider.name);
      setBrandName(provider.brandName);
      setAccreditation(provider.accreditation);
      setContactPerson(provider.contactPerson);
      setContactPhone(provider.contactPhone);
      setLogoUrl(provider.logoUrl || "");
      setAllowLogo(provider.allowLogoOnPublicPages);
      setPpiuLicense(provider.ppiuLicenseNo || "");
      setPihkLicense(provider.pihkLicenseNo || "");

      const pAdmin = provider as unknown as Record<string, unknown>;
      if (pAdmin.defaultCommissionType) {
        setCommissionType(pAdmin.defaultCommissionType as string);
        setCommissionValue(pAdmin.defaultCommissionValue as number);
        setCommissionNotes((pAdmin.commissionNotes as string) || "");
      }
    }
  }, [provider]);

  useEffect(() => {
    setCategoryDrafts((prev) => {
      const next = { ...prev };
      for (const cat of categories) {
        if (!next[cat.id]) {
          next[cat.id] = {
            name: cat.name,
            commissionType: cat.commissionType,
            commissionValue: cat.commissionValue,
          };
        }
      }
      return next;
    });
  }, [categories]);

  if (!isAdmin && isNew) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          admin required
        </span>
        <p className="text-sm text-muted-foreground">
          Registering a new licensed provider requires an admin account.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/providers">Back to providers</Link>
        </Button>
      </main>
    );
  }

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const res = await uploadLogo.mutateAsync(file);
      setLogoUrl(res.url);
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload = {
      name: name.trim(),
      brandName: brandName.trim(),
      accreditation: accreditation as unknown as "A" | "B" | "C" | "unknown",
      contactPerson: contactPerson.trim(),
      contactPhone: contactPhone.trim(),
      logoUrl: logoUrl || null,
      allowLogoOnPublicPages: allowLogo,
      ...(isAdmin
        ? {
            defaultCommissionType: commissionType as unknown as "flat_per_pax" | "percent_of_price",
            defaultCommissionValue: Number(commissionValue),
            commissionNotes: commissionNotes.trim() || null,
          }
        : {}),
    };

    try {
      if (isNew) {
        const created = await createProvider.mutateAsync(payload as unknown as CreateProviderInput);
        router.push(`/dashboard/providers/${created.id}`);
      } else {
        await updateProvider.mutateAsync({ id, ...payload } as unknown as UpdateProviderInput & { id: string });
        setSuccess("Provider updated successfully.");
      }
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const handleActivate = async () => {
    setError(null);
    setSuccess(null);

    if (!ppiuLicense && !pihkLicense) {
      setError("At least one license (PPIU or PIHK) is required to activate.");
      return;
    }

    if (!consentChecked) {
      setError("You must confirm price publication consent to activate.");
      return;
    }

    try {
      await activateProvider.mutateAsync({
        id,
        ppiuLicenseNo: ppiuLicense.trim() || null,
        pihkLicenseNo: pihkLicense.trim() || null,
        consentConfirmed: true,
      });
      setSuccess("Provider activated successfully.");
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const handleDeactivateClick = async () => {
    setError(null);
    setSuccess(null);
    try {
      // Fetch affected packages or call deactivate mutation to get list
      const res = await deactivateProvider.mutateAsync(id);
      setDeactivateImpact(res.affectedPackages);
      setShowDeactivateDialog(true);
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  const updateCategoryDraft = (categoryId: string, patch: Partial<CategoryDraft>) => {
    setCategoryDrafts((prev) => ({
      ...prev,
      [categoryId]: {
        ...(prev[categoryId] ?? { name: "", commissionType: "flat_per_pax", commissionValue: 0 }),
        ...patch,
      },
    }));
  };

  const handleAddCategory = async () => {
    setCategoryError(null);
    if (!newCategoryName.trim()) {
      setCategoryError("Enter a category name.");
      return;
    }
    try {
      await createCategory.mutateAsync({
        providerId: id,
        productType: CATEGORY_PRODUCT_TYPE as "umrah",
        name: newCategoryName.trim(),
        commissionType: commissionType as "flat_per_pax" | "percent_of_price",
        commissionValue: Number(commissionValue),
      });
      setNewCategoryName("");
    } catch (err) {
      setCategoryError(await readApiError(err));
    }
  };

  const handleSaveCategory = async (categoryId: string) => {
    const draft = categoryDrafts[categoryId];
    if (!draft) return;
    setCategoryError(null);
    try {
      await updateCategory.mutateAsync({
        id: categoryId,
        name: draft.name.trim(),
        commissionType: draft.commissionType as "flat_per_pax" | "percent_of_price",
        commissionValue: Number(draft.commissionValue),
      });
    } catch (err) {
      setCategoryError(await readApiError(err));
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setCategoryError(null);
    try {
      await deleteCategory.mutateAsync(categoryId);
    } catch (err) {
      setCategoryError(await readApiError(err));
    }
  };

  if (isPending && !isNew) {
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
            {isNew ? "operator · register" : "operator · detail"}
          </span>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? "Register Provider" : name}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/providers">Back</Link>
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
                <CardTitle>Profile Details</CardTitle>
                <CardDescription>Attribution, contacts, and brand logo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Legal Entity Name (Nama Resmi)</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!isAdmin}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="brandName">Brand Name (Nama Merk)</Label>
                  <Input
                    id="brandName"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    disabled={!isAdmin}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="accreditation">Accreditation</Label>
                    <select
                      id="accreditation"
                      value={accreditation}
                      onChange={(e) => setAccreditation(e.target.value)}
                      disabled={!isAdmin}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="unknown">Unknown</option>
                      <option value="A">Accreditation A</option>
                      <option value="B">Accreditation B</option>
                      <option value="C">Accreditation C</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="contactPerson">Contact Person</Label>
                    <Input
                      id="contactPerson"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      disabled={!isAdmin}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="contactPhone">Contact Phone</Label>
                    <Input
                      id="contactPhone"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      disabled={!isAdmin}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-2 pt-2 border-t">
                  <Label htmlFor="logo">Logo Uploader</Label>
                  {logoUrl && (
                    <div className="mb-2 max-w-[150px] aspect-square relative border rounded-md overflow-hidden bg-muted">
                      <img src={logoUrl} alt="Logo" className="object-contain w-full h-full" />
                    </div>
                  )}
                  {isAdmin && (
                    <Input
                      id="logo"
                      type="file"
                      accept="image/*"
                      onChange={handleUploadLogo}
                      disabled={uploadLogo.isPending}
                    />
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="allowLogo"
                      checked={allowLogo}
                      onChange={(e) => setAllowLogo(e.target.checked)}
                      disabled={!isAdmin}
                      className="rounded border-input text-primary focus:ring-ring"
                    />
                    <Label htmlFor="allowLogo" className="text-xs text-muted-foreground">
                      Allow brand logo on public marketing pages
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>Commission Settings (Admin Only)</CardTitle>
                  <CardDescription>Establish partner default commissions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="commissionType">Commission Scheme Type</Label>
                      <select
                        id="commissionType"
                        value={commissionType}
                        onChange={(e) => setCommissionType(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="flat_per_pax">Flat Rupiah (per Pax)</option>
                        <option value="percent_of_price">Percentage Basis Points</option>
                      </select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="commissionValue">
                        {commissionType === "flat_per_pax" ? "Value (in IDR)" : "Basis Points (100 = 1%)"}
                      </Label>
                      <Input
                        id="commissionValue"
                        type="number"
                        min="0"
                        value={commissionValue}
                        onChange={(e) => setCommissionValue(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="commissionNotes">Notes / Terms</Label>
                    <textarea
                      id="commissionNotes"
                      value={commissionNotes}
                      onChange={(e) => setCommissionNotes(e.target.value)}
                      className="min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {isAdmin && (
              <div className="flex justify-end">
                <Button type="submit" disabled={createProvider.isPending || updateProvider.isPending}>
                  {isNew ? "Register Operator" : "Save Changes"}
                </Button>
              </div>
            )}
          </form>
        </div>

        {!isNew && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Operator Status</CardTitle>
                <CardDescription>Manage accreditation & licensing states.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b">
                  <span className="text-sm font-medium">Registry Status</span>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                      provider?.isActive
                        ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                        : "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                    }`}
                  >
                    {provider?.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {!provider?.isActive && isAdmin ? (
                  <div className="space-y-4 pt-2">
                    <div className="grid gap-2">
                      <Label htmlFor="ppiu">PPIU Umrah License</Label>
                      <Input
                        id="ppiu"
                        value={ppiuLicense}
                        onChange={(e) => setPpiuLicense(e.target.value)}
                        placeholder="e.g. PPIU-123-2026"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pihk">PIHK Hajj License</Label>
                      <Input
                        id="pihk"
                        value={pihkLicense}
                        onChange={(e) => setPihkLicense(e.target.value)}
                        placeholder="e.g. PIHK-456-2026"
                      />
                    </div>
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id="consent"
                        checked={consentChecked}
                        onChange={(e) => setConsentChecked(e.target.checked)}
                        className="rounded border-input text-primary mt-1"
                      />
                      <Label htmlFor="consent" className="text-xs text-muted-foreground leading-normal">
                        Partner mengizinkan publikasi harga untuk verifikasi keaktifan legalitas (D1).
                      </Label>
                    </div>

                    <Button onClick={handleActivate} className="w-full text-xs" size="sm">
                      Activate Operator
                    </Button>
                  </div>
                ) : provider?.isActive && isAdmin ? (
                  <div className="pt-2">
                    <Button
                      onClick={handleDeactivateClick}
                      variant="outline"
                      className="w-full text-destructive border-destructive/20 hover:bg-destructive/10 text-xs"
                      size="sm"
                    >
                      Deactivate Operator
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground pt-2">
                    Accredited operators require PPIU/PIHK licensing credentials to activate registry status.
                  </p>
                )}
              </CardContent>
            </Card>

            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>Categories</CardTitle>
                  <CardDescription>
                    Manage Umrah package categories and their commission overrides.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {categoryError && (
                    <div
                      role="alert"
                      className="rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium"
                    >
                      {categoryError}
                    </div>
                  )}

                  <div className="space-y-3">
                    {categories.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No categories yet for Umrah.
                      </p>
                    )}
                    {categories.map((cat) => {
                      const draft =
                        categoryDrafts[cat.id] ?? {
                          name: cat.name,
                          commissionType: cat.commissionType,
                          commissionValue: cat.commissionValue,
                        };
                      return (
                        <div key={cat.id} className="grid gap-2 rounded-md border p-3">
                          <div className="grid gap-2">
                            <Label htmlFor={`category-name-${cat.id}`}>Name</Label>
                            <Input
                              id={`category-name-${cat.id}`}
                              value={draft.name}
                              onChange={(e) =>
                                updateCategoryDraft(cat.id, { name: e.target.value })
                              }
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-2">
                              <Label htmlFor={`category-commission-type-${cat.id}`}>
                                Commission type
                              </Label>
                              <select
                                id={`category-commission-type-${cat.id}`}
                                value={draft.commissionType}
                                onChange={(e) =>
                                  updateCategoryDraft(cat.id, { commissionType: e.target.value })
                                }
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              >
                                <option value="flat_per_pax">Flat Rupiah (per Pax)</option>
                                <option value="percent_of_price">Percentage Basis Points</option>
                              </select>
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor={`category-commission-value-${cat.id}`}>
                                {draft.commissionType === "flat_per_pax"
                                  ? "Value (in IDR)"
                                  : "Basis points"}
                              </Label>
                              <Input
                                id={`category-commission-value-${cat.id}`}
                                type="number"
                                min="0"
                                value={draft.commissionValue}
                                onChange={(e) =>
                                  updateCategoryDraft(cat.id, {
                                    commissionValue: Number(e.target.value),
                                  })
                                }
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleSaveCategory(cat.id)}
                              disabled={updateCategory.isPending}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive/20 hover:bg-destructive/10"
                              onClick={() => handleDeleteCategory(cat.id)}
                              disabled={deleteCategory.isPending}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid gap-2 pt-3 border-t">
                    <Label htmlFor="newCategoryName">New category</Label>
                    <Input
                      id="newCategoryName"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Regular"
                    />
                    <p className="text-xs text-muted-foreground">
                      Commission prefilled from the provider default (
                      {commissionType === "flat_per_pax" ? "flat" : "percentage"},{" "}
                      {commissionValue}). Save the category, then edit its commission inline
                      if it should differ.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddCategory}
                      disabled={createCategory.isPending}
                    >
                      Add category
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {showDeactivateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="max-w-md w-full mx-4 shadow-lg border">
            <CardHeader>
              <CardTitle className="text-destructive text-lg">Confirm Deactivation</CardTitle>
              <CardDescription>
                Deactivating this operator has direct impacts on published package registries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                All published packages owned by this provider will be unpublished automatically in one atomic transaction.
              </p>
              {deactivateImpact.length > 0 ? (
                <div className="rounded-md border p-3 bg-muted/40 max-h-32 overflow-y-auto">
                  <span className="font-mono text-[10px] uppercase block tracking-wider text-muted-foreground mb-2">
                    Affected Packages ({deactivateImpact.length})
                  </span>
                  <ul className="text-xs list-disc pl-4 space-y-1 font-medium">
                    {deactivateImpact.map((pkg) => (
                      <li key={pkg.id}>{pkg.name}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-emerald-600 font-medium">
                  No packages currently affected by this deactivation.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowDeactivateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeactivateDialog(false)}
                >
                  Confirm Deactivate
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
