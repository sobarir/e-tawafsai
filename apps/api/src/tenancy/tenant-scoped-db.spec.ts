import { describe, expect, it, vi } from "vitest";
import { ClsService } from "nestjs-cls";
import { TenantScopedDb } from "./tenant-scoped-db";
import { TenantContextMissingError } from "./tenant-context";

function clsWith(tenantId: string | undefined): ClsService {
  return { get: vi.fn().mockReturnValue(tenantId) } as unknown as ClsService;
}
const fakeDb = {} as never;

describe("TenantScopedDb", () => {
  it("throws when no tenant context is established", () => {
    const scoped = new TenantScopedDb(fakeDb, clsWith(undefined));
    expect(() => scoped.tenantId).toThrow(TenantContextMissingError);
  });

  it("returns the active tenant id when present", () => {
    const scoped = new TenantScopedDb(fakeDb, clsWith("01H..."));
    expect(scoped.tenantId).toBe("01H...");
  });
});
