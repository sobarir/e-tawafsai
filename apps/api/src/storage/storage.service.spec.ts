import { describe, expect, it } from "vitest";
import { LocalStorageService } from "./local-storage.service";
import * as fs from "fs";
import * as path from "path";

describe("LocalStorageService", () => {
  it("uploads file to disk and returns static URL path", async () => {
    const service = new LocalStorageService();
    const fileContent = Buffer.from("fake-image-bytes");
    const filename = "logo-test.png";

    const url = await service.uploadFile(fileContent, filename, "image/png", "provider-logos");

    expect(url).toContain("/uploads/provider-logos/logo-test.png");

    // Clean up
    const filePath = path.join(process.cwd(), "public/uploads/provider-logos/logo-test.png");
    expect(fs.existsSync(filePath)).toBe(true);
    fs.unlinkSync(filePath);
  });
});
