import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import type { ClsService } from "nestjs-cls";
import type { TenantRegistryService } from "./tenant-registry.service";
import { TENANT_ID_KEY } from "./tenant-context";
import { slugFromHost, TenantResolutionMiddleware } from "./tenant-resolution.middleware";

describe("slugFromHost", () => {
  it("maps apex domain to the default tenant", () => {
    expect(slugFromHost("tawafsai.com")).toBe("default");
  });
  it("maps localhost (and port) to the default tenant", () => {
    expect(slugFromHost("localhost:3001")).toBe("default");
  });
  it("extracts the subdomain slug", () => {
    expect(slugFromHost("hemat.tawafsai.com")).toBe("hemat");
  });
  it("extracts the slug from {slug}.localhost", () => {
    expect(slugFromHost("hemat.localhost:3001")).toBe("hemat");
  });
  it("treats www as the apex/default tenant", () => {
    expect(slugFromHost("www.tawafsai.com")).toBe("default");
  });
  it("falls back to default when host is undefined", () => {
    expect(slugFromHost(undefined)).toBe("default");
  });
});

describe("TenantResolutionMiddleware.use", () => {
  function registryStub(tenant: { id: string } | null): TenantRegistryService {
    return { findBySlug: vi.fn().mockResolvedValue(tenant) } as unknown as TenantRegistryService;
  }
  function clsStub(): ClsService {
    return { set: vi.fn() } as unknown as ClsService;
  }
  function reqWith(headers: Record<string, string | undefined>) {
    return { headers } as never;
  }

  it("rejects an unknown subdomain with a 404", async () => {
    const registry = registryStub(null);
    const cls = clsStub();
    const middleware = new TenantResolutionMiddleware(registry, cls);
    const next = vi.fn();

    await middleware.use(reqWith({ host: "ghost.tawafsai.com" }), {} as never, next);

    expect(registry.findBySlug).toHaveBeenCalledWith("ghost");
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0];
    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as NotFoundException).getStatus()).toBe(404);
  });

  it("never lets the host override an authenticated request's tenant", async () => {
    const registry = registryStub({ id: "should-not-be-used" });
    const cls = clsStub();
    const middleware = new TenantResolutionMiddleware(registry, cls);
    const next = vi.fn();

    await middleware.use(
      reqWith({ authorization: "Bearer x", host: "attacker.tawafsai.com" }),
      {} as never,
      next,
    );

    expect(registry.findBySlug).not.toHaveBeenCalled();
    expect(cls.set).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("resolves a known subdomain and sets the tenant on CLS", async () => {
    const registry = registryStub({ id: "tenant-123" });
    const cls = clsStub();
    const middleware = new TenantResolutionMiddleware(registry, cls);
    const next = vi.fn();

    await middleware.use(reqWith({ host: "hemat.tawafsai.com" }), {} as never, next);

    expect(registry.findBySlug).toHaveBeenCalledWith("hemat");
    expect(cls.set).toHaveBeenCalledWith(TENANT_ID_KEY, "tenant-123");
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
