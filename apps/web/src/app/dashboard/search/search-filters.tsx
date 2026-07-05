"use client";

import type { SearchParams } from "@cometkit/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Filters = Partial<SearchParams>;

export function ActiveChips({
  filters,
  onRemove,
}: {
  filters: Filters;
  onRemove: (key: keyof Filters) => void;
}) {
  const entries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== "" && v !== false);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <button
          key={k}
          onClick={() => onRemove(k as keyof Filters)}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
        >
          {k}: {String(v)} <span aria-hidden>×</span>
          <span className="sr-only">Hapus filter {k}</span>
        </button>
      ))}
    </div>
  );
}

export function FilterSheet({
  open,
  filters,
  onChange,
  onClose,
}: {
  open: boolean;
  filters: Filters;
  onChange: (next: Filters) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const set = (patch: Filters) => onChange({ ...filters, ...patch });
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-sheet-title"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="w-full space-y-3 rounded-t-2xl bg-background p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="filter-sheet-title" className="text-sm font-semibold">
          Filter
        </h2>
        <label className="block text-xs">
          Harga maksimum
          <Input
            type="number"
            inputMode="numeric"
            value={filters.maxPrice ?? ""}
            onChange={(e) => set({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
        <label className="block text-xs">
          Durasi (hari) minimum
          <Input
            type="number"
            value={filters.durationMin ?? ""}
            onChange={(e) => set({ durationMin: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={filters.directOnly ?? false}
            onChange={(e) => set({ directOnly: e.target.checked })}
          />{" "}
          Direct only
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={filters.seatsAvailableOnly ?? false}
            onChange={(e) => set({ seatsAvailableOnly: e.target.checked })}
          />{" "}
          Hanya yang ada kursi
        </label>
        <Button size="sm" className="w-full" onClick={onClose}>
          Terapkan
        </Button>
      </div>
    </div>
  );
}
