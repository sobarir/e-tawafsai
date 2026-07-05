"use client";

import { useState, useEffect } from "react";
import type { SearchParams, ProviderDto, StaffProviderDto } from "@cometkit/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Filters = Partial<SearchParams>;

const CATEGORY_LABELS: Record<string, string> = {
  regular: "Regular",
  plus: "Plus",
  private_vip: "Private VIP",
  ramadan: "Ramadan",
  arbain: "Arbain",
  other: "Lainnya",
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  umrah: "Umroh",
  haji_khusus: "Haji Khusus",
  haji_furoda: "Haji Furoda",
};

const OCCUPANCY_LABELS: Record<string, string> = {
  quad: "Quad",
  triple: "Triple",
  double: "Double",
};

export function ActiveChips({
  filters,
  onRemove,
  providers = [],
}: {
  filters: Filters;
  onRemove: (key: keyof Filters) => void;
  providers?: (ProviderDto | StaffProviderDto)[];
}) {
  const entries = Object.entries(filters).filter(
    ([k, v]) => v !== undefined && v !== "" && v !== false && k !== "page" && k !== "pageSize"
  );
  if (entries.length === 0) return null;

  const getLabel = (key: string, val: unknown): string => {
    const sVal = String(val);
    switch (key) {
      case "q":
        return `Cari: "${sVal}"`;
      case "maxPrice":
        return `Harga maks: Rp ${Number(val).toLocaleString("id-ID")}`;
      case "occupancy":
        return `Okupansi: ${OCCUPANCY_LABELS[sVal] ?? sVal}`;
      case "durationMin":
        return `Durasi min: ${sVal} hari`;
      case "durationMax":
        return `Durasi maks: ${sVal} hari`;
      case "monthFrom":
        return `Mulai: ${sVal}`;
      case "monthTo":
        return `Selesai: ${sVal}`;
      case "category":
        return `Kategori: ${CATEGORY_LABELS[sVal] ?? sVal}`;
      case "productType":
        return `Tipe: ${PRODUCT_TYPE_LABELS[sVal] ?? sVal}`;
      case "airline":
        return `Maskapai: ${sVal}`;
      case "departureCity":
        return `Kota Berangkat: ${sVal}`;
      case "providerId": {
        const found = providers.find((p) => p.id === sVal);
        const name = found ? ("brandName" in found && found.brandName ? found.brandName : found.name) : sVal;
        return `Travel: ${name}`;
      }
      case "hotelCity":
        return `Kota Hotel: ${sVal}`;
      case "maxDistanceM":
        return `Jarak Hotel maks: ${sVal}m`;
      case "minStars":
        return `Bintang min: ${sVal}★`;
      case "directOnly":
        return "Penerbangan langsung";
      case "seatsAvailableOnly":
        return "Sisa kursi tersedia";
      default:
        return `${key}: ${sVal}`;
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <button
          key={k}
          onClick={() => onRemove(k as keyof Filters)}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-muted/80 transition-colors"
        >
          {getLabel(k, v)} <span className="ml-0.5 text-muted-foreground hover:text-foreground" aria-hidden>×</span>
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
  providers = [],
}: {
  open: boolean;
  filters: Filters;
  onChange: (next: Filters) => void;
  onClose: () => void;
  providers?: (ProviderDto | StaffProviderDto)[];
}) {
  const [local, setLocal] = useState<Filters>(filters);

  useEffect(() => {
    if (open) {
      setLocal(filters);
    }
  }, [open, filters]);

  if (!open) return null;

  const set = (patch: Filters) => setLocal({ ...local, ...patch });

  const handleApply = () => {
    onChange(local);
    onClose();
  };

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
        className="w-full max-h-[85vh] overflow-y-auto space-y-4 rounded-t-2xl bg-background p-4 shadow-xl border-t pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b pb-2">
          <h2 id="filter-sheet-title" className="text-base font-bold text-foreground">
            Filter Pencarian
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setLocal({})}>
            Reset Semua
          </Button>
        </div>

        {/* SECTION 1: Dasar & Kriteria Harga */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Umum & Harga</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Harga Maksimum (Rp)</span>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Misal: 35000000"
                value={local.maxPrice ?? ""}
                onChange={(e) => set({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Okupansi Kamar</span>
              <select
                value={local.occupancy ?? "quad"}
                onChange={(e) => set({ occupancy: e.target.value as SearchParams["occupancy"] })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="quad">Quad (4 Orang)</option>
                <option value="triple">Triple (3 Orang)</option>
                <option value="double">Double (2 Orang)</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Durasi Min (Hari)</span>
              <Input
                type="number"
                placeholder="Min hari"
                value={local.durationMin ?? ""}
                onChange={(e) => set({ durationMin: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Durasi Maks (Hari)</span>
              <Input
                type="number"
                placeholder="Maks hari"
                value={local.durationMax ?? ""}
                onChange={(e) => set({ durationMax: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Bulan Mulai</span>
              <Input
                type="month"
                value={local.monthFrom ?? ""}
                onChange={(e) => set({ monthFrom: e.target.value || undefined })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Bulan Selesai</span>
              <Input
                type="month"
                value={local.monthTo ?? ""}
                onChange={(e) => set({ monthTo: e.target.value || undefined })}
              />
            </label>
          </div>
        </div>

        <hr />

        {/* SECTION 2: Katalog & Penerbangan */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Katalog & Penerbangan</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Tipe Produk</span>
              <select
                value={local.productType ?? ""}
                onChange={(e) => set({ productType: (e.target.value || undefined) as SearchParams["productType"] })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Semua Tipe</option>
                <option value="umrah">Umroh</option>
                <option value="haji_khusus">Haji Khusus</option>
                <option value="haji_furoda">Haji Furoda</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Kategori Paket</span>
              <select
                value={local.category ?? ""}
                onChange={(e) => set({ category: (e.target.value || undefined) as SearchParams["category"] })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Semua Kategori</option>
                <option value="regular">Regular</option>
                <option value="plus">Plus</option>
                <option value="private_vip">Private VIP</option>
                <option value="ramadan">Ramadan</option>
                <option value="arbain">Arbain</option>
                <option value="other">Lainnya</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Maskapai</span>
              <Input
                type="text"
                placeholder="Misal: Saudi, Garuda"
                value={local.airline ?? ""}
                onChange={(e) => set({ airline: e.target.value || undefined })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Kota Keberangkatan</span>
              <Input
                type="text"
                placeholder="Misal: Jakarta, Surabaya"
                value={local.departureCity ?? ""}
                onChange={(e) => set({ departureCity: e.target.value || undefined })}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Penyedia Layanan (Travel)</span>
            <select
              value={local.providerId ?? ""}
              onChange={(e) => set({ providerId: e.target.value || undefined })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Semua Travel</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {"brandName" in p && p.brandName ? p.brandName : p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <hr />

        {/* SECTION 3: Kriteria Hotel */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Kriteria Hotel</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Kota Hotel</span>
              <select
                value={local.hotelCity ?? ""}
                onChange={(e) => set({ hotelCity: (e.target.value || undefined) as SearchParams["hotelCity"] })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Semua Kota</option>
                <option value="Makkah">Makkah</option>
                <option value="Madinah">Madinah</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Bintang Minimum</span>
              <select
                value={local.minStars ?? ""}
                onChange={(e) => set({ minStars: e.target.value ? Number(e.target.value) : undefined })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Semua Bintang</option>
                <option value="1">1 Bintang ★</option>
                <option value="2">2 Bintang ★★</option>
                <option value="3">3 Bintang ★★★</option>
                <option value="4">4 Bintang ★★★★</option>
                <option value="5">5 Bintang ★★★★★</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Jarak Hotel Maksimum (Meter)</span>
            <Input
              type="number"
              placeholder="Misal: 500"
              value={local.maxDistanceM ?? ""}
              onChange={(e) => set({ maxDistanceM: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
        </div>

        <hr />

        {/* SECTION 4: Toggles */}
        <div className="flex gap-4 py-1">
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              checked={local.directOnly ?? false}
              onChange={(e) => set({ directOnly: e.target.checked })}
            />
            Penerbangan Langsung
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              checked={local.seatsAvailableOnly ?? false}
              onChange={(e) => set({ seatsAvailableOnly: e.target.checked })}
            />
            Hanya Sisa Kursi Tersedia
          </label>
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" className="w-1/3" onClick={onClose}>
            Batal
          </Button>
          <Button className="w-2/3" onClick={handleApply}>
            Terapkan Filter
          </Button>
        </div>
      </div>
    </div>
  );
}
