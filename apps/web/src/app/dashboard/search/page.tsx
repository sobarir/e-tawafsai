"use client";

import { useState } from "react";
import type { SearchParams, SearchResultDto } from "@cometkit/shared";
import { formatWhatsappSummary } from "@cometkit/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSearchPackages } from "@/hooks/use-search";
import { copyText } from "@/lib/clipboard";
import { ResultCard } from "./result-card";
import { ActiveChips, FilterSheet } from "./search-filters";

export default function SearchPage() {
  const [filters, setFilters] = useState<Partial<SearchParams>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { data, isPending, error } = useSearchPackages(filters);

  const removeFilter = (key: keyof Partial<SearchParams>) => {
    setFilters((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });
  };

  const flash = (msg: string) => {
    setCopied(msg);
    setTimeout(() => setCopied(null), 2500);
  };

  const onCopySummary = async (dto: SearchResultDto) => {
    const ok = await copyText(formatWhatsappSummary(dto));
    flash(ok ? "Ringkasan disalin ke clipboard." : "Gagal menyalin. Salin manual dari kartu.");
  };
  const onCopyLink = async (dto: SearchResultDto) => {
    const ok = await copyText(dto.publicUrl);
    flash(ok ? "Tautan disalin ke clipboard." : "Gagal menyalin tautan. Coba lagi.");
  };

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
      <header className="space-y-1">
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          catalog · search
        </span>
        <h1 className="text-xl font-bold tracking-tight">Cari paket</h1>
      </header>

      <div className="flex gap-2">
        <Input
          placeholder="Cari judul, hotel, maskapai…"
          value={filters.q ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined }))}
        />
        <Button variant="outline" onClick={() => setSheetOpen(true)}>
          Filter
        </Button>
      </div>

      <ActiveChips filters={filters} onRemove={removeFilter} />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          Gagal memuat hasil. Coba lagi.
        </p>
      )}
      {isPending && <p className="font-mono text-xs text-muted-foreground">Memuat…</p>}
      {copied && (
        <p role="alert" className="font-mono text-xs text-muted-foreground">
          {copied}
        </p>
      )}

      <div className="space-y-3">
        {data?.data.map((dto) => (
          <ResultCard key={dto.id} dto={dto} onCopySummary={onCopySummary} onCopyLink={onCopyLink} />
        ))}
        {data && data.data.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Tidak ada paket yang cocok. Longgarkan filter dan coba lagi.
          </div>
        )}
      </div>

      <FilterSheet open={sheetOpen} filters={filters} onChange={setFilters} onClose={() => setSheetOpen(false)} />
    </main>
  );
}
