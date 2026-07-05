"use client";

import Link from "next/link";
import { useState, useEffect, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-auth";
import { useTemplates, useUpdateTemplate } from "@/hooks/use-templates";
import { TEMPLATE_ALLOWED_VARIABLES } from "@cometkit/shared";
import { readApiError } from "@/lib/api";

export default function TemplatesPage() {
  const { data: me } = useMe();
  const { data: templates, isPending } = useTemplates();
  const updateTemplate = useUpdateTemplate();

  const [selectedKey, setSelectedKey] = useState<string>("");
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedTemplate = templates?.find((t) => t.key === selectedKey);

  useEffect(() => {
    if (templates && templates.length > 0 && !selectedKey) {
      setSelectedKey(templates[0]!.key);
    }
  }, [templates, selectedKey]);

  useEffect(() => {
    if (selectedTemplate) {
      setLabel(selectedTemplate.label);
      setBody(selectedTemplate.body);
      setError(null);
      setSuccess(null);
    }
  }, [selectedTemplate]);

  if (me && me.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          admin required
        </span>
        <p className="text-sm text-muted-foreground">
          Template management requires an admin account.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </main>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const allowedVars = TEMPLATE_ALLOWED_VARIABLES[selectedKey] || [];
    const usedPlaceholders = body.match(/\{[^}]+\}/g) || [];
    const invalidPlaceholders = usedPlaceholders.filter((ph) => !allowedVars.includes(ph));

    if (invalidPlaceholders.length > 0) {
      setError(`Unauthorized placeholders: ${invalidPlaceholders.join(", ")}. Allowed placeholders for this template are: ${allowedVars.join(", ")}`);
      return;
    }

    try {
      await updateTemplate.mutateAsync({
        key: selectedKey,
        label: label.trim(),
        body: body.trim(),
      });
      setSuccess("Template updated successfully.");
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  if (isPending) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="flex h-64 items-center justify-center">
          <span className="font-mono text-xs animate-pulse">Loading templates...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
            admin · settings · templates
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Message Templates</h1>
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

      {success && (
        <div className="mb-6 rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600 font-medium">
          {success}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-4">
        <div className="md:col-span-1 space-y-2">
          <Label className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Template List
          </Label>
          <div className="flex flex-col gap-1">
            {templates?.map((t) => (
              <button
                key={t.key}
                onClick={() => setSelectedKey(t.key)}
                className={`text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  selectedKey === t.key
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-3">
          {selectedTemplate ? (
            <form onSubmit={handleSubmit}>
              <Card>
                <CardHeader>
                  <CardTitle>Edit {selectedTemplate.label}</CardTitle>
                  <CardDescription>
                    Customise the wording and message formatting.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="label">Template Name</Label>
                    <Input
                      id="label"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="body">Message Body</Label>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        Key: {selectedKey}
                      </span>
                    </div>
                    <textarea
                      id="body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="min-h-[150px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    />
                  </div>

                  <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground block font-bold">
                      Allowed placeholders
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {(TEMPLATE_ALLOWED_VARIABLES[selectedKey] || []).map((v) => (
                        <code
                          key={v}
                          className="bg-background text-xs border rounded px-1.5 py-0.5 font-mono cursor-pointer hover:bg-muted"
                          onClick={() => setBody(body + v)}
                        >
                          {v}
                        </code>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Tip: click a variable to insert it at the end of the text.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end mt-4">
                <Button type="submit" disabled={updateTemplate.isPending}>
                  {updateTemplate.isPending ? "Saving..." : "Save Template"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="h-64 flex items-center justify-center border border-dashed rounded-lg bg-muted/20">
              <span className="text-muted-foreground text-sm">Select a template from the list</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
