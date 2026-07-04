import { describe, expect, it } from "vitest";
import { slugFromHost } from "./tenant-resolution.middleware";

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
