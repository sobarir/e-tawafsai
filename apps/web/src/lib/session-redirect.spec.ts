import { describe, it, expect } from "vitest";
import {
  shouldRedirectOnUnauthorized,
  safeReturnUrl,
  buildLoginRedirect,
} from "./session-redirect";

describe("shouldRedirectOnUnauthorized", () => {
  const base = {
    requestUrl: "http://localhost:3001/airlines",
    currentPath: "/dashboard/packages/123",
  };

  it("redirects on 401 for a normal request", () => {
    expect(shouldRedirectOnUnauthorized({ status: 401, ...base })).toBe(true);
  });

  it("does not redirect on 401 from the login endpoint", () => {
    expect(
      shouldRedirectOnUnauthorized({
        status: 401,
        requestUrl: "http://localhost:3001/auth/login",
        currentPath: "/login",
      }),
    ).toBe(false);
  });

  it("does not redirect on 401 when already on /login", () => {
    expect(
      shouldRedirectOnUnauthorized({
        status: 401,
        requestUrl: "http://localhost:3001/auth/me",
        currentPath: "/login",
      }),
    ).toBe(false);
  });

  it("does not redirect on 403", () => {
    expect(shouldRedirectOnUnauthorized({ status: 403, ...base })).toBe(false);
  });

  it("does not redirect on 200 or 500", () => {
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

  it("rejects backslash and control-char open-redirect tricks", () => {
    expect(safeReturnUrl("/\\evil.com")).toBe("/dashboard");
    expect(safeReturnUrl("/\\\\evil.com")).toBe("/dashboard");
    expect(safeReturnUrl("/dashboard\\..\\x")).toBe("/dashboard");
    expect(safeReturnUrl("/\tevil")).toBe("/dashboard");
    expect(safeReturnUrl("/\nevil")).toBe("/dashboard");
  });

  it("rejects /login and empty/null", () => {
    expect(safeReturnUrl("/login")).toBe("/dashboard");
    expect(safeReturnUrl("/login?returnUrl=/x")).toBe("/dashboard");
    expect(safeReturnUrl("")).toBe("/dashboard");
    expect(safeReturnUrl(null)).toBe("/dashboard");
    expect(safeReturnUrl(undefined)).toBe("/dashboard");
  });
});

describe("buildLoginRedirect", () => {
  it("encodes the current path as returnUrl and marks expired", () => {
    expect(buildLoginRedirect("/dashboard/packages/123")).toBe(
      "/login?returnUrl=%2Fdashboard%2Fpackages%2F123&expired=1",
    );
  });
});
