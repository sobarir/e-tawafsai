---
change: confirm-dialog-and-session-redirect
design-doc: docs/superpowers/specs/2026-07-07-confirm-dialog-and-session-redirect-design.md
base-ref: e7fe1178d219334dbc5a4e1181ffeb393bee9aad
archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

# Confirm Dialog & Session Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one reusable confirmation dialog gating every destructive action in the web app, and a global 401 → login redirect with return-URL + session-expired notice.

**Architecture:** An app-root `<ConfirmProvider>` holds a single shadcn `AlertDialog`; `useConfirm()` returns a `Promise<boolean>` so call sites do `if (await confirm({...})) await mutation.mutateAsync(id)`. A ky `beforeError` hook in `api.ts` delegates the redirect decision to pure helpers (`shouldRedirectOnUnauthorized`, `safeReturnUrl`) and hard-navigates via `window.location`.

**Tech Stack:** Next.js App Router, TanStack Query, ky, shadcn/Radix, Vitest, TypeScript. Workspace `apps/web`.

## Global Constraints

- All work is in `apps/web`. No `apps/api` / `packages/*` changes.
- New runtime deps MUST be declared in `apps/web/package.json` (bun's isolated linker does not hoist). Resolve `@radix-ui/react-alert-dialog` to its real `@latest` version from npm, not memory.
- Vitest gotcha: use `import * as z from "zod"` style where relevant; SWC provides decorator metadata. Unit specs are DB-free (`*.spec.ts`).
- Zod/ky idioms per AGENTS.md. ky v2: hooks receive typed args; `beforeError` receives an `HTTPError`.
- Copy: sentence case, plain verbs; errors via `role="alert"`, notices via `role="status"`.
- Quality gate: `bun run verify` (typecheck + lint + test) must pass. Run bun with `export PATH="/c/Users/rahma/.bun/bin:$PATH"` first (bash) or use PowerShell.
- The 7 destructive actions in scope (verified 2026-07-07): master-data delete airline + delete city; provider deactivate + delete category; package delete-departure + unpublish; user deactivate. Templates have no destructive action.

archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

### Task 1: AlertDialog primitive + dependency

**Ticks tasks.md:** 1.1, 1.2

**Files:**
- Modify: `apps/web/package.json` (add dependency)
- Create: `apps/web/src/components/ui/alert-dialog.tsx`

**Interfaces:**
- Produces: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` — the shadcn AlertDialog primitive over `@radix-ui/react-alert-dialog`.

- [x] **Step 1: Add the dependency**

Resolve the current version first, then add it (bash):

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/web
npm view @radix-ui/react-alert-dialog version   # note the version, e.g. 1.1.x
bun add @radix-ui/react-alert-dialog@latest
cd ../..
```

Expected: `apps/web/package.json` gains `"@radix-ui/react-alert-dialog": "^<resolved>"` and the lockfile updates.

- [x] **Step 2: Create the AlertDialog primitive**

Create `apps/web/src/components/ui/alert-dialog.tsx` (canonical shadcn implementation, using the repo's `cn` and `buttonVariants`):

```tsx
"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg rounded-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  </AlertDialogPortal>
));
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />;
}
AlertDialogHeader.displayName = "AlertDialogHeader";

function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
  );
}
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants(), className)} {...props} />
));
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
    {...props}
  />
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
```

- [x] **Step 3: Typecheck**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd apps/web typecheck` (or repo `bun run verify` typecheck portion).
Expected: no type errors from the new file.

- [x] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/bun.lock apps/web/src/components/ui/alert-dialog.tsx
git commit -m "feat(web): add shadcn AlertDialog primitive"
```

archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

### Task 2: ConfirmProvider + useConfirm, mounted app-wide

**Ticks tasks.md:** 1.3

**Files:**
- Create: `apps/web/src/components/confirm-provider.tsx`
- Create: `apps/web/src/hooks/use-confirm.ts`
- Modify: `apps/web/src/components/providers.tsx`

**Interfaces:**
- Consumes: the AlertDialog primitive (Task 1), `buttonVariants`, `cn`.
- Produces:
  - `type ConfirmOptions = { title: string; description?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; destructive?: boolean }`
  - `ConfirmContext: React.Context<((opts: ConfirmOptions) => Promise<boolean>) | null>`
  - `ConfirmProvider({ children })`
  - `useConfirm(): (opts: ConfirmOptions) => Promise<boolean>`

- [x] **Step 1: Create the provider**

Create `apps/web/src/components/confirm-provider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOpts(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    setOpen(false);
    resolver.current?.(result);
    resolver.current = null;
  }, []);

  const destructive = opts?.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => { if (!next) settle(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description != null ? (
              <AlertDialogDescription asChild>
                <div>{opts.description}</div>
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {opts?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(destructive && buttonVariants({ variant: "destructive" }))}
              onClick={() => settle(true)}
            >
              {opts?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
```

Note: `AlertDialogDescription asChild` renders the description as a `<div>` so rich content (e.g. an impact `<ul>`) is valid HTML while keeping the Radix `aria-describedby` wiring.

- [x] **Step 2: Create the hook**

Create `apps/web/src/hooks/use-confirm.ts`:

```ts
"use client";

import { useContext } from "react";
import { ConfirmContext } from "@/components/confirm-provider";

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
}
```

- [x] **Step 3: Mount the provider under the QueryClient**

Modify `apps/web/src/components/providers.tsx` so `<ConfirmProvider>` wraps children inside `QueryClientProvider`:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ConfirmProvider } from "@/components/confirm-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </QueryClientProvider>
  );
}
```

- [x] **Step 4: Typecheck**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd apps/web typecheck`
Expected: no type errors.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components/confirm-provider.tsx apps/web/src/hooks/use-confirm.ts apps/web/src/components/providers.tsx
git commit -m "feat(web): add useConfirm() imperative confirmation dialog"
```

archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

### Task 3: Gate master-data deletes

**Ticks tasks.md:** 2.1

**Files:**
- Modify: `apps/web/src/app/dashboard/settings/master-data/page.tsx`

**Interfaces:**
- Consumes: `useConfirm` (Task 2). The `MasterList` component receives `onDelete: (id: string) => Promise<void>` and renders a Delete button calling `guard(() => onDelete(r.id))`.

- [x] **Step 1: Wire confirmation into the Delete action**

In `MasterList`, import and call `useConfirm`, and gate the delete button. Replace the Delete button's `onClick={() => guard(() => onDelete(r.id))}` so it first confirms:

```tsx
// at top of file
import { useConfirm } from "@/hooks/use-confirm";

// inside MasterList(), near other hooks:
const confirm = useConfirm();

// the Delete button onClick becomes:
onClick={() =>
  guard(async () => {
    const ok = await confirm({
      title: `Delete this ${title.toLowerCase().replace(/s$/, "")}?`,
      description: `“${r.name}” will be removed. This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (ok) await onDelete(r.id);
  })
}
```

- [x] **Step 2: Manual check**

Run the app (`bun run dev`), open Settings → Master data, click Delete on an airline. Expected: dialog appears with the item name; Cancel leaves the row; Confirm deletes it. Repeat for a departure city.

- [x] **Step 3: Typecheck + commit**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd apps/web typecheck
git add apps/web/src/app/dashboard/settings/master-data/page.tsx
git commit -m "feat(web): confirm master-data airline/city deletes"
```

archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

### Task 4: Gate provider deactivate + category delete (replace bespoke modal)

**Ticks tasks.md:** 2.2, 2.3

**Files:**
- Modify: `apps/web/src/app/dashboard/providers/[id]/page.tsx`

**Interfaces:**
- Consumes: `useConfirm` (Task 2). Existing: `deactivateProvider.mutateAsync(id)` returns `{ affectedPackages: {id,name}[] }`; `handleDeleteCategory(categoryId)`; state `showDeactivateDialog`, `deactivateImpact`.

- [x] **Step 1: Replace the bespoke deactivate modal with `useConfirm`**

Add `const confirm = useConfirm();` near the other hooks. Rewrite `handleDeactivateClick` to fetch impact, then confirm with the affected-packages list as `description`, and drop the `showDeactivateDialog` / `setShowDeactivateDialog` state and the bottom `{showDeactivateDialog && (...)}` modal JSX (lines ~703–747):

```tsx
const handleDeactivateClick = async () => {
  setError(null);
  setSuccess(null);
  try {
    const res = await deactivateProvider.mutateAsync(id);
    const affected = res.affectedPackages;
    const ok = await confirm({
      title: "Deactivate this operator?",
      confirmLabel: "Deactivate",
      description: (
        <div className="space-y-2">
          <p>All published packages owned by this provider will be unpublished in one atomic transaction.</p>
          {affected.length > 0 ? (
            <div className="rounded-md border p-3 bg-muted/40 max-h-32 overflow-y-auto">
              <span className="font-mono text-[10px] uppercase block tracking-wider text-muted-foreground mb-2">
                Affected packages ({affected.length})
              </span>
              <ul className="text-xs list-disc pl-4 space-y-1 font-medium">
                {affected.map((pkg) => (<li key={pkg.id}>{pkg.name}</li>))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-emerald-600 font-medium">No packages currently affected.</p>
          )}
        </div>
      ),
    });
    if (ok) setSuccess("Provider deactivated.");
    // NOTE: deactivateProvider.mutateAsync already performed the deactivation above.
  } catch (err) {
    setError(await readApiError(err));
  }
};
```

**Important behavior note:** in the current code the mutation runs on click to fetch the impact list, and the modal's "Confirm" is cosmetic (it only closes). Preserve today's semantics: the mutation is what deactivates. If a true preview-before-commit is desired, that is a separate change — do NOT expand scope here. Remove `showDeactivateDialog`/`deactivateImpact` state and the old modal block.

- [x] **Step 2: Gate the category delete**

Rewrite `handleDeleteCategory` to confirm first:

```tsx
const handleDeleteCategory = async (categoryId: string) => {
  setCategoryError(null);
  const ok = await confirm({
    title: "Delete this category?",
    description: "The category and its commission override will be removed. This cannot be undone.",
    confirmLabel: "Delete",
  });
  if (!ok) return;
  try {
    await deleteCategory.mutateAsync(categoryId);
  } catch (err) {
    setCategoryError(await readApiError(err));
  }
};
```

- [x] **Step 3: Manual check**

Deactivate an active provider → dialog shows the affected-packages list; Confirm/Cancel behave. Delete a category → dialog gates it.

- [x] **Step 4: Typecheck + commit**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd apps/web typecheck
git add apps/web/src/app/dashboard/providers/[id]/page.tsx
git commit -m "feat(web): route provider deactivate + category delete through shared confirm"
```

archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

### Task 5: Gate package departure delete + unpublish (replace window.confirm)

**Ticks tasks.md:** 2.4

**Files:**
- Modify: `apps/web/src/app/dashboard/packages/[id]/page.tsx`

**Interfaces:**
- Consumes: `useConfirm` (Task 2). Existing: `handleDelete(id)` at ~857 uses native `confirm(...)` then `deleteMutation.mutateAsync(id)`; `handleUnpublish()` at ~256 calls `unpublishPackage.mutateAsync(id)`.

- [x] **Step 1: Replace the native confirm for departure delete**

Add `const confirm = useConfirm();` near the other hooks. Rewrite `handleDelete`:

```tsx
const handleDelete = async (id: string) => {
  const ok = await confirm({
    title: "Delete this departure schedule?",
    description: "The departure and its seat inventory will be removed. This cannot be undone.",
    confirmLabel: "Delete",
  });
  if (!ok) return;
  try {
    await deleteMutation.mutateAsync(id);
    void refetch();
  } catch (err) {
    setError(await readApiError(err)); // replace the previous alert(...) with inline error
  }
};
```

(If `setError` is not in scope here, keep `alert(await readApiError(err))` — check the surrounding component; prefer `setError` if available for consistency.)

- [x] **Step 2: Gate unpublish**

Rewrite `handleUnpublish`:

```tsx
const handleUnpublish = async () => {
  setError(null);
  setSuccess(null);
  const ok = await confirm({
    title: "Unpublish this package?",
    description: "It will revert to draft and stop appearing in search until re-published.",
    confirmLabel: "Unpublish",
  });
  if (!ok) return;
  try {
    await unpublishPackage.mutateAsync(id);
    setSuccess("Package reverted to draft.");
  } catch (err) {
    setError(await readApiError(err));
  }
};
```

- [x] **Step 3: Manual check**

Delete a departure schedule → shared dialog (no browser `confirm`). Unpublish a published package → dialog gates it.

- [x] **Step 4: Typecheck + commit**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd apps/web typecheck
git add apps/web/src/app/dashboard/packages/[id]/page.tsx
git commit -m "feat(web): confirm package departure delete + unpublish"
```

archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

### Task 6: Gate user deactivate

**Ticks tasks.md:** 2.5

**Files:**
- Modify: `apps/web/src/app/dashboard/users/page.tsx`

**Interfaces:**
- Consumes: `useConfirm` (Task 2). Existing: `onToggleActive(user)` deactivates when `user.isActive`, else reactivates. Only the deactivate branch is destructive.

- [x] **Step 1: Confirm only the deactivate branch**

Add `const confirm = useConfirm();` near the other hooks. Update `onToggleActive`:

```tsx
async function onToggleActive(user: UserDto) {
  setError(null);
  try {
    if (user.isActive) {
      const ok = await confirm({
        title: "Deactivate this user?",
        description: `${user.email} will lose access until reactivated.`,
        confirmLabel: "Deactivate",
      });
      if (!ok) return;
      await deactivateUser.mutateAsync(user.id);
    } else {
      await reactivateUser.mutateAsync(user.id); // reactivate is not destructive — no confirm
    }
  } catch (err) {
    setError(await readApiError(err));
  }
}
```

(Use `user.email` if present on `UserDto`; otherwise use `user.name` or omit the identifier.)

- [x] **Step 2: Manual check + typecheck + commit**

Deactivate a user → dialog gates it; Reactivate → no dialog.

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd apps/web typecheck
git add apps/web/src/app/dashboard/users/page.tsx
git commit -m "feat(web): confirm user deactivation"
```

archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

### Task 7: Pure session-redirect helpers (TDD)

**Ticks tasks.md:** 4.1 (partial — helper specs)

**Files:**
- Create: `apps/web/src/lib/session-redirect.ts`
- Test: `apps/web/src/lib/session-redirect.spec.ts`

**Interfaces:**
- Produces:
  - `shouldRedirectOnUnauthorized(input: { status: number; requestUrl: string; currentPath: string }): boolean`
  - `safeReturnUrl(raw: string | null | undefined): string`
  - `buildLoginRedirect(currentPathWithSearch: string): string`

- [x] **Step 1: Write the failing test**

Create `apps/web/src/lib/session-redirect.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldRedirectOnUnauthorized, safeReturnUrl, buildLoginRedirect } from "./session-redirect";

describe("shouldRedirectOnUnauthorized", () => {
  const base = { requestUrl: "http://localhost:3001/airlines", currentPath: "/dashboard/packages/123" };
  it("redirects on 401 for a normal request", () => {
    expect(shouldRedirectOnUnauthorized({ status: 401, ...base })).toBe(true);
  });
  it("does not redirect on 401 from the login endpoint", () => {
    expect(shouldRedirectOnUnauthorized({ status: 401, requestUrl: "http://localhost:3001/auth/login", currentPath: "/login" })).toBe(false);
  });
  it("does not redirect on 401 when already on /login", () => {
    expect(shouldRedirectOnUnauthorized({ status: 401, requestUrl: "http://localhost:3001/auth/me", currentPath: "/login" })).toBe(false);
  });
  it("does not redirect on 403", () => {
    expect(shouldRedirectOnUnauthorized({ status: 403, ...base })).toBe(false);
  });
  it("does not redirect on 200/500", () => {
    expect(shouldRedirectOnUnauthorized({ status: 200, ...base })).toBe(false);
    expect(shouldRedirectOnUnauthorized({ status: 500, ...base })).toBe(false);
  });
});

describe("safeReturnUrl", () => {
  it("passes a normal internal path", () => {
    expect(safeReturnUrl("/dashboard/packages/123")).toBe("/dashboard/packages/123");
  });
  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeReturnUrl("//evil.com")).toBe("/dashboard");
    expect(safeReturnUrl("http://evil.com")).toBe("/dashboard");
    expect(safeReturnUrl("https://evil.com/x")).toBe("/dashboard");
  });
  it("rejects /login and empty/null", () => {
    expect(safeReturnUrl("/login")).toBe("/dashboard");
    expect(safeReturnUrl("/login?returnUrl=/x")).toBe("/dashboard");
    expect(safeReturnUrl("")).toBe("/dashboard");
    expect(safeReturnUrl(null)).toBe("/dashboard");
  });
});

describe("buildLoginRedirect", () => {
  it("encodes the current path as returnUrl and marks expired", () => {
    expect(buildLoginRedirect("/dashboard/packages/123")).toBe("/login?returnUrl=%2Fdashboard%2Fpackages%2F123&expired=1");
  });
});
```

- [x] **Step 2: Run it to verify failure**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd apps/web test session-redirect`
Expected: FAIL — module `./session-redirect` not found.

- [x] **Step 3: Implement the helpers**

Create `apps/web/src/lib/session-redirect.ts`:

```ts
/** Pure decision helpers for global 401 session-expiry handling (no DOM access). */

export function shouldRedirectOnUnauthorized(input: {
  status: number;
  requestUrl: string;
  currentPath: string;
}): boolean {
  const { status, requestUrl, currentPath } = input;
  if (status !== 401) return false;
  if (requestUrl.includes("auth/login")) return false;
  if (currentPath === "/login") return false;
  return true;
}

const DEFAULT_PATH = "/dashboard";

export function safeReturnUrl(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_PATH;
  if (!raw.startsWith("/")) return DEFAULT_PATH; // reject absolute http(s):// and relative
  if (raw.startsWith("//")) return DEFAULT_PATH; // reject protocol-relative //host
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/login/")) return DEFAULT_PATH;
  return raw;
}

export function buildLoginRedirect(currentPathWithSearch: string): string {
  return `/login?returnUrl=${encodeURIComponent(currentPathWithSearch)}&expired=1`;
}
```

- [x] **Step 4: Run tests to verify pass**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd apps/web test session-redirect`
Expected: PASS (all cases).

- [x] **Step 5: Commit**

```bash
git add apps/web/src/lib/session-redirect.ts apps/web/src/lib/session-redirect.spec.ts
git commit -m "feat(web): add pure 401 redirect decision helpers with specs"
```

archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

### Task 8: ky beforeError 401 hook

**Ticks tasks.md:** 3.1, 3.2

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: `shouldRedirectOnUnauthorized`, `buildLoginRedirect` (Task 7), `clearSessionHint` (`@/lib/auth-storage`).

- [x] **Step 1: Add the hook**

Add imports and a `beforeError` hook to the ky instance in `apps/web/src/lib/api.ts` (keep the existing `beforeRequest` hook):

```ts
import ky from "ky";
import { clearSessionHint } from "@/lib/auth-storage";
import { shouldRedirectOnUnauthorized, buildLoginRedirect } from "@/lib/session-redirect";

export const api = ky.create({
  prefix: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  credentials: "include",
  hooks: {
    beforeRequest: [
      ({ request }) => {
        if (typeof window !== "undefined") {
          request.headers.set("X-Forwarded-Host", window.location.host);
        }
      },
    ],
    beforeError: [
      (error) => {
        if (typeof window !== "undefined") {
          const status = error.response?.status ?? 0;
          const requestUrl = error.request?.url ?? "";
          const currentPath = window.location.pathname;
          if (shouldRedirectOnUnauthorized({ status, requestUrl, currentPath })) {
            clearSessionHint();
            window.location.assign(buildLoginRedirect(currentPath + window.location.search));
          }
        }
        return error;
      },
    ],
  },
});
```

Leave `ApiError` and `readApiError` untouched below.

- [x] **Step 2: Typecheck + verify existing api specs (if any)**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd apps/web typecheck && bun run --cwd apps/web test`
Expected: no type errors; existing tests still pass.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): redirect to login on 401 via ky beforeError hook"
```

archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

### Task 9: Login page — returnUrl + session-expired notice

**Ticks tasks.md:** 3.3

**Files:**
- Modify: `apps/web/src/app/login/page.tsx`

**Interfaces:**
- Consumes: `safeReturnUrl` (Task 7). Reads `window.location.search` (avoids the Next `useSearchParams` Suspense-boundary requirement).

- [x] **Step 1: Read returnUrl + expired and wire them**

In `LoginPage`, add state + effect and use it on success:

```tsx
import { useState, useEffect, type FormEvent } from "react";
import { safeReturnUrl } from "@/lib/session-redirect";

// inside the component:
const [expired, setExpired] = useState(false);
const [returnUrl, setReturnUrl] = useState("/dashboard");

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  setExpired(params.get("expired") === "1");
  setReturnUrl(safeReturnUrl(params.get("returnUrl")));
}, []);

// in onSubmit success path, replace router.push("/dashboard") with:
router.push(returnUrl);
```

- [x] **Step 2: Render the session-expired notice**

Above the form (before the email field), add:

```tsx
{expired ? (
  <p role="status" className="mb-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-600 font-medium">
    Your session expired. Please sign in again to continue.
  </p>
) : null}
```

- [x] **Step 3: Manual check**

Visit `/login?returnUrl=/dashboard/users&expired=1` → notice shows; after login you land on `/dashboard/users`. Visit `/login?returnUrl=http://evil.com&expired=1` → after login you land on `/dashboard` (open-redirect blocked).

- [x] **Step 4: Typecheck + commit**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd apps/web typecheck
git add apps/web/src/app/login/page.tsx
git commit -m "feat(web): login returnUrl + session-expired notice"
```

archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

### Task 10: Final sweep, manual acceptance, and full verify

**Ticks tasks.md:** 2.6, 4.2, 4.3

**Files:** none (verification only)

- [x] **Step 1: Sweep for stragglers**

```bash
cd /c/Sobari/Ai/tawaf-sai/e-tawafsai
grep -rn "window.confirm\|[^.]confirm(\|alert(" apps/web/src/app apps/web/src/components | grep -v useConfirm
```
Expected: no native `confirm(...)` / `window.confirm` gating a destructive action remains. Any hit must be either non-destructive or migrated.

- [x] **Step 2: Manual acceptance — all 6 scenarios**

Run `bun run dev` and verify:
1. Delete confirm (master-data airline): dialog with item name; Confirm deletes, Cancel doesn't.
2. Deactivate via unified dialog (provider): affected-packages list shown in dialog.
3. Session expiry: while on `/dashboard/packages/<id>`, force a 401 (e.g. clear the API session cookie / wait out the token) → redirected to `/login?returnUrl=/dashboard/packages/<id>&expired=1` with notice → re-login returns to that page.
4. Bad-password boundary: wrong password on `/login` → normal invalid-credentials error, no "session expired" notice, no redirect loop.
5. 403 boundary: a non-admin hitting an admin-only endpoint → inline error, no redirect.
6. Open-redirect boundary: `/login?returnUrl=//evil.com` → after login lands on `/dashboard`.

- [x] **Step 3: Full verify gate**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run verify`
Expected: typecheck + lint + test all pass. If anything fails, load `systematic-debugging` before fixing.

- [x] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore(web): final sweep + verify for confirm dialog & session redirect"
```

archived-with: 2026-07-07-confirm-dialog-and-session-redirect
---

## Self-Review notes

- **Spec coverage:** `destructive-action-confirmation` → Tasks 1–6, 10 (all 7 actions + primitive + sweep). `session-expiry-redirect` → Tasks 7–9 (redirect, exclusions, returnUrl, notice, open-redirect safety via `safeReturnUrl`). All delta-spec scenarios have a task.
- **Type consistency:** `ConfirmOptions`, `useConfirm()`, `shouldRedirectOnUnauthorized`, `safeReturnUrl`, `buildLoginRedirect` names are identical across tasks that produce/consume them.
- **Scope:** templates excluded (no destructive action); provider deactivate keeps today's "mutation-on-click" semantics (no preview-before-commit scope creep).
