"use client";

import Link from "next/link";
import { useState, useEffect, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-auth";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { readApiError } from "@/lib/api";

interface AdditionalWa {
  waNumber: string;
  label: string;
}

export default function SettingsPage() {
  const { data: me } = useMe();
  const { data: settings, isPending } = useSettings();
  const updateSettings = useUpdateSettings();

  const [brandName, setBrandName] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [additionalWa, setAdditionalWa] = useState<AdditionalWa[]>([]);

  const [metaPixelId, setMetaPixelId] = useState("");
  const [googleTagId, setGoogleTagId] = useState("");

  const [almostFullThreshold, setAlmostFullThreshold] = useState(5);
  const [holdExpiryHours, setHoldExpiryHours] = useState(48);

  const [followUpLeadDays, setFollowUpLeadDays] = useState(2);
  const [followUpQuoteDays, setFollowUpQuoteDays] = useState(3);
  const [followUpDpReminderDays, setFollowUpDpReminderDays] = useState(7);
  const [followUpFullPaymentDays, setFollowUpFullPaymentDays] = useState(14);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setBrandName(settings.brandName || "");
      setBrandLogoUrl(settings.brandLogoUrl || "");
      setWaNumber(settings.waNumber || "");
      setAdditionalWa(settings.additionalWaNumbers || []);
      setMetaPixelId(settings.metaPixelId || "");
      setGoogleTagId(settings.googleTagId || "");
      setAlmostFullThreshold(settings.almostFullThreshold);
      setHoldExpiryHours(settings.holdExpiryHours);
      setFollowUpLeadDays(settings.followUpLeadDays);
      setFollowUpQuoteDays(settings.followUpQuoteDays);
      setFollowUpDpReminderDays(settings.followUpDpReminderDays);
      setFollowUpFullPaymentDays(settings.followUpFullPaymentDays);
    }
  }, [settings]);

  if (me && me.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          admin required
        </span>
        <p className="text-sm text-muted-foreground">
          Settings configuration requires an admin account.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </main>
    );
  }

  const handleAddWa = () => {
    setAdditionalWa([...additionalWa, { waNumber: "", label: "" }]);
  };

  const handleRemoveWa = (index: number) => {
    setAdditionalWa(additionalWa.filter((_, i) => i !== index));
  };

  const handleWaChange = (index: number, field: keyof AdditionalWa, value: string) => {
    const updated = [...additionalWa];
    updated[index] = { ...updated[index]!, [field]: value };
    setAdditionalWa(updated);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      await updateSettings.mutateAsync({
        metaPixelId: metaPixelId || null,
        googleTagId: googleTagId || null,
        almostFullThreshold: Number(almostFullThreshold),
        holdExpiryHours: Number(holdExpiryHours),
        followUpLeadDays: Number(followUpLeadDays),
        followUpQuoteDays: Number(followUpQuoteDays),
        followUpDpReminderDays: Number(followUpDpReminderDays),
        followUpFullPaymentDays: Number(followUpFullPaymentDays),
        brandName: brandName.trim(),
        brandLogoUrl: brandLogoUrl.trim() || null,
        waNumber: waNumber.trim() || null,
        additionalWaNumbers: additionalWa
          .map((wa) => ({ waNumber: wa.waNumber.trim(), label: wa.label.trim() }))
          .filter((wa) => wa.waNumber !== ""),
      });
      setSuccess("Settings updated successfully.");
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  if (isPending) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="flex h-64 items-center justify-center">
          <span className="font-mono text-xs animate-pulse">Loading settings...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
            admin · settings
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Tenant Settings</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/master-data">Master data</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/templates">Templates</Link>
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

      {success && (
        <div className="mb-6 rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600 font-medium">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Configure your agency brand and phone numbers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="brandName">Brand Name</Label>
              <Input
                id="brandName"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="brandLogoUrl">Logo URL</Label>
              <Input
                id="brandLogoUrl"
                value={brandLogoUrl}
                onChange={(e) => setBrandLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="waNumber">Primary WhatsApp Number</Label>
              <Input
                id="waNumber"
                value={waNumber}
                onChange={(e) => setWaNumber(e.target.value)}
                placeholder="e.g. 62812345678"
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label>Additional WhatsApp Numbers</Label>
                <Button type="button" onClick={handleAddWa} variant="outline" size="sm">
                  Add Number
                </Button>
              </div>

              {additionalWa.map((wa, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <Input
                    placeholder="Number (e.g. 62812345679)"
                    value={wa.waNumber}
                    onChange={(e) => handleWaChange(i, "waNumber", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Label (e.g. CS 2, Sales)"
                    value={wa.label}
                    onChange={(e) => handleWaChange(i, "label", e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => handleRemoveWa(i)}
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Setup Facebook Pixel and Google Analytics integrations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="metaPixelId">Facebook Pixel ID</Label>
              <Input
                id="metaPixelId"
                value={metaPixelId}
                onChange={(e) => setMetaPixelId(e.target.value)}
                placeholder="Pixel ID"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="googleTagId">Google Tag ID</Label>
              <Input
                id="googleTagId"
                value={googleTagId}
                onChange={(e) => setGoogleTagId(e.target.value)}
                placeholder="G-XXXXXX"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operations</CardTitle>
            <CardDescription>Manage inventory limits and follow-up intervals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="almostFullThreshold">Almost-Full Threshold</Label>
                <Input
                  id="almostFullThreshold"
                  type="number"
                  min="1"
                  value={almostFullThreshold}
                  onChange={(e) => setAlmostFullThreshold(Number(e.target.value))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="holdExpiryHours">Hold Expiry (Hours)</Label>
                <Input
                  id="holdExpiryHours"
                  type="number"
                  min="1"
                  value={holdExpiryHours}
                  onChange={(e) => setHoldExpiryHours(Number(e.target.value))}
                />
              </div>
            </div>

            <h3 className="text-sm font-semibold pt-4 border-t">Follow-up Days per Stage</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="followUpLeadDays">Lead</Label>
                <Input
                  id="followUpLeadDays"
                  type="number"
                  min="1"
                  value={followUpLeadDays}
                  onChange={(e) => setFollowUpLeadDays(Number(e.target.value))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="followUpQuoteDays">Quote</Label>
                <Input
                  id="followUpQuoteDays"
                  type="number"
                  min="1"
                  value={followUpQuoteDays}
                  onChange={(e) => setFollowUpQuoteDays(Number(e.target.value))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="followUpDpReminderDays">DP Reminder</Label>
                <Input
                  id="followUpDpReminderDays"
                  type="number"
                  min="1"
                  value={followUpDpReminderDays}
                  onChange={(e) => setFollowUpDpReminderDays(Number(e.target.value))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="followUpFullPaymentDays">Full Payment</Label>
                <Input
                  id="followUpFullPaymentDays"
                  type="number"
                  min="1"
                  value={followUpFullPaymentDays}
                  onChange={(e) => setFollowUpFullPaymentDays(Number(e.target.value))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={updateSettings.isPending}>
            {updateSettings.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </form>
    </main>
  );
}
