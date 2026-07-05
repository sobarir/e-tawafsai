---
change: web-search-filters-expansion
design-doc: docs/superpowers/specs/2026-07-05-web-search-filters-expansion-design.md
base-ref: 24ec16fa9e6ee319479d86d8cef6495dba6e47b2
---

# Web Search Filters Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all remaining package search filters (such as occupancy, month range, airline, category, product type, departure city, provider, and hotel criteria) in the Web UI, resolving the Phase 1 de-scope limitation.

**Architecture:** We will load active providers from the database in the search page context. Inside the FilterSheet component, we will maintain a local state buffer for form inputs and only update the parent search page state when the user clicks "Terapkan". The ActiveChips component will map filter keys and IDs to human-readable values.

**Tech Stack:** React, Next.js, TanStack Query, Tailwind CSS, Lucide Icons, CometKit API.

## Global Constraints
- Naming conventions: Filter inputs and chips must match the query parameters in `searchPackagesSchema`.
- UI copy: Indonesian language (e.g. "Terapkan", "Kategori", "Tipe Produk", "Kota Keberangkatan", "Kota Hotel").
- Mobile-first: Scrollable layout within the sheet container, fits nicely on viewport widths down to 380px.

---

### Task 1: Expose Filters in FilterSheet

**Files:**
- Modify: [search-filters.tsx](file:///c:/Sobari/Ai/tawaf-sai/e-tawafsai/apps/web/src/app/dashboard/search/search-filters.tsx)

**Interfaces:**
- Consumes: `useProviders` (to fetch list of provider options)
- Produces: Updated `FilterSheet` component interface accepting `providers` list and using local buffer state.

- [ ] **Step 1.1: Refactor FilterSheet to use local state buffer**
  Sync local filters copy when `open` changes:
  ```tsx
  const [local, setLocal] = useState<Filters>(filters);
  useEffect(() => {
    if (open) {
      setLocal(filters);
    }
  }, [open, filters]);

  const set = (patch: Filters) => setLocal({ ...local, ...patch });
  ```
  On Apply button click, invoke `onChange(local)`.

- [ ] **Step 1.2: Add General Section (Occupancy, Duration Max, and Date/Month range)**
  Add inputs for:
  - **Occupancy**: Selector (dropdown or chips) next to Price input:
    ```tsx
    <label className="block text-xs">
      Okupansi
      <select
        value={local.occupancy ?? "quad"}
        onChange={(e) => set({ occupancy: e.target.value as any })}
        className="w-full rounded-md border bg-background p-2 text-sm"
      >
        <option value="quad">Quad (4 Orang)</option>
        <option value="triple">Triple (3 Orang)</option>
        <option value="double">Double (2 Orang)</option>
      </select>
    </label>
    ```
  - **Duration Max**: Number input next to `durationMin`.
  - **Departure Month Range (`monthFrom` / `monthTo`)**:
    ```tsx
    <div className="grid grid-cols-2 gap-2">
      <label className="block text-xs">
        Bulan Mulai
        <Input
          type="month"
          value={local.monthFrom ?? ""}
          onChange={(e) => set({ monthFrom: e.target.value || undefined })}
        />
      </label>
      <label className="block text-xs">
        Bulan Selesai
        <Input
          type="month"
          value={local.monthTo ?? ""}
          onChange={(e) => set({ monthTo: e.target.value || undefined })}
        />
      </label>
    </div>
    ```

- [ ] **Step 1.3: Add Catalog Details Section (Product Type, Category, Airline, Departure City, and Provider)**
  Add inputs for:
  - **Product Type**: Dropdown (Umrah, Haji Khusus, Haji Furoda).
  - **Category**: Dropdown (Regular, Plus, Private VIP, Ramadan, Arbain, Other).
  - **Airline**: Text input.
  - **Departure City**: Text input.
  - **Provider**: Dropdown populated from `providers` prop:
    ```tsx
    <label className="block text-xs">
      Penyedia (Travel)
      <select
        value={local.providerId ?? ""}
        onChange={(e) => set({ providerId: e.target.value || undefined })}
        className="w-full rounded-md border bg-background p-2 text-sm"
      >
        <option value="">Semua Travel</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {"brandName" in p && p.brandName ? p.brandName : p.name}
          </option>
        ))}
      </select>
    </label>
    ```

- [ ] **Step 1.4: Add Hotel Criteria Section (Hotel City, Max Distance, Min Stars)**
  Add inputs for:
  - **Hotel City**: Dropdown/select (Semua, Makkah, Madinah).
  - **Max Distance (Meters)**: Number input.
  - **Min Stars**: Dropdown/select (Semua, 1 Star, 2 Stars, 3 Stars, 4 Stars, 5 Stars).

- [ ] **Step 1.5: Apply Scroll Styling**
  Ensure the container has `overflow-y-auto max-h-[80vh] px-1 py-2` styles applied to prevent layout overflow on mobile screens.

---

### Task 2: Implement Human-Readable Labels in ActiveChips

**Files:**
- Modify: [search-filters.tsx](file:///c:/Sobari/Ai/tawaf-sai/e-tawafsai/apps/web/src/app/dashboard/search/search-filters.tsx)

**Interfaces:**
- Consumes: `providers` list from props.
- Produces: Formatted Active Chips with human-readable descriptions.

- [ ] **Step 2.1: Update ActiveChips to receive `providers` list**
  Accept `providers?: (ProviderDto | StaffProviderDto)[]` parameter.

- [ ] **Step 2.2: Map filter keys to Indonesian human-readable labels**
  Format active chips dynamically:
  - `q`: "Cari: ..."
  - `maxPrice`: "Harga maks: Rp ..." (using local currency formatting or shorthand)
  - `occupancy`: "Okupansi: ..." (Quad / Triple / Double)
  - `durationMin`: "Durasi min: ... hari"
  - `durationMax`: "Durasi maks: ... hari"
  - `monthFrom` / `monthTo`: "Bulan: ... s/d ..."
  - `category` & `productType`: cap/map enums
  - `providerId`: Lookup provider name from the `providers` list.
  - `hotelCity`: "Kota hotel: ..."
  - `maxDistanceM`: "Jarak hotel maks: ... m"
  - `minStars`: "Bintang min: ... ★"
  - `directOnly`: "Direct flight"
  - `seatsAvailableOnly`: "Ada kursi"

---

### Task 3: Integrate and Verify Search Page

**Files:**
- Modify: [page.tsx](file:///c:/Sobari/Ai/tawaf-sai/e-tawafsai/apps/web/src/app/dashboard/search/page.tsx)

- [ ] **Step 3.1: Load Providers on Search Page**
  Fetch active providers:
  ```tsx
  import { useProviders } from "@/hooks/use-providers";
  // ...
  const { data: providersData } = useProviders(1, 100);
  const providers = providersData?.data ?? [];
  ```

- [ ] **Step 3.2: Pass Providers to Filter Components**
  Pass the `providers` list to both `<ActiveChips>` and `<FilterSheet>`.

- [ ] **Step 3.3: Verify and run build quality checks**
  Run `bun run verify` to confirm everything is safe and correctly compiled.
