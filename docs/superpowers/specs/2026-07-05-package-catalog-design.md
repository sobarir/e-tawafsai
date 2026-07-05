---
comet_change: package-catalog
role: technical-design
canonical_spec: openspec
---

# Technical Design: Package Catalog (C3)

This design document outlines the implementation plan for the Package Catalog (C3) capability. It specifies the database schemas, API routes, data validation rules, and the Web UI.

---

## 1. Database Schema Design

We will introduce four tables: `packages`, `package_hotels`, `tags`, and `package_tags`.

### 1.1 `packages` Table
```ts
export const packages = pgTable("packages", {
  id: ulidPk(),
  ...tenantOwned(),
  providerId: ulidRef("provider_id")
    .notNull()
    .references(() => providers.id),
  productType: productTypeEnum("product_type").notNull().default("umrah"),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  category: categoryEnum("category").notNull().default("regular"),
  plusDestination: varchar("plus_destination", { length: 120 }),
  durationDays: integer("duration_days"),
  description: text("description"),
  airline: varchar("airline", { length: 120 }),
  flightRoute: varchar("flight_route", { length: 255 }),
  departureCity: varchar("departure_city", { length: 120 }),
  isFeatured: boolean("is_featured").notNull().default(false),
  status: statusEnum("status").notNull().default("draft"),
  ...timestamps,
}, (table) => [
  unique("packages_tenant_slug_idx").on(table.tenantId, table.slug),
]);
```

### 1.2 `package_hotels` Table
```ts
export const packageHotels = pgTable("package_hotels", {
  id: ulidPk(),
  packageId: ulidRef("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  cityName: varchar("city_name", { length: 120 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  stars: integer("stars").notNull().default(3),
  distanceM: integer("distance_m"),
  isPelataran: boolean("is_pelataran").notNull().default(false),
  ...timestamps,
});
```

### 1.3 `tags` & `package_tags` Tables
```ts
export const tags = pgTable("tags", {
  id: ulidPk(),
  ...tenantOwned(),
  name: varchar("name", { length: 63 }).notNull(),
  ...timestamps,
}, (table) => [
  unique("tags_tenant_name_idx").on(table.tenantId, table.name),
]);

export const packageTags = pgTable("package_tags", {
  packageId: ulidRef("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  tagId: ulidRef("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.packageId, table.tagId] }),
]);
```

### 1.4 `package_flyers` Table
```ts
export const packageFlyers = pgTable("package_flyers", {
  id: ulidPk(),
  packageId: ulidRef("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 2048 }).notNull(),
  ...timestamps,
});
```

---

## 2. API Design & Routing

### 2.1 Package Endpoints
- `POST /packages` (Admin only): Create a draft package (generates slug).
- `GET /packages` (Admin/Staff): Paginated package list.
- `GET /packages/:id` (Admin/Staff): Get detail.
- `PATCH /packages/:id` (Admin only): Update package fields.
- `POST /packages/:id/publish` (Admin only): Publish a package (validates criteria).
- `POST /packages/:id/unpublish` (Admin only): Revert to draft status.
- `POST /packages/upload-flyer` (Admin only): Upload flyer via the storage seam.

### 2.2 Tags Endpoints
- `GET /tags` (Admin/Staff): Fetch seeded and custom tags for the active tenant.
- `POST /tags` (Admin only): Add custom tag.

---

## 3. Core Logic & Validation Policies

### 3.1 Publish Validation (`packages.policy.ts`)
A package can only transition from `draft` to `published` if:
1. `durationDays`, `airline`, `departureCity`, and `category` are present.
2. At least one hotel with `cityName === 'Makkah'` exists in `package_hotels`.
3. The package's associated `Provider` is active and has a `ppiuLicenseNo` set (for `umrah`).
4. If `plusDestination` is set, transit hotels are optional. Flyer uploads are optional.

### 3.2 Slug Generator Service
- Derived from `title` via kebab-casing.
- Checked for uniqueness within the tenant. Collisions append a random 3-char suffix (e.g. `-abc`).
- Immutable once the package has been published at least once.

### 3.3 Cascade Unpublish (Provider Deactivation)
- Integrated into `ProvidersService` from `provider-management`.
- When a provider is deactivated, we locate all its packages where `status === 'published'` and change status to `'draft'` atomically.

---

## 4. Web UI Layout

- **Catalog Registry**: Clean table with filter select dropdowns (status, category, featured).
- **Edit/Create Flow**:
  - Optional flyer upload panel side-by-side with form.
  - Camera capture button on mobile via `<input type="file" accept="image/*" capture="environment">`.
  - Tags select renders seeded inclusions with inline "add new" input field.
