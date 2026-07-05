import { Injectable } from "@nestjs/common";
import { StorageService } from "./storage.service";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class LocalStorageService implements StorageService {
  async uploadFile(
    file: Buffer,
    filename: string,
    mimeType: string,
    prefix?: string,
  ): Promise<string> {
    const uploadDir = path.join(process.cwd(), "public/uploads", prefix || "");
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, file);

    const appUrl = process.env.APP_URL || "http://localhost:3001";
    const relativeUrl = prefix ? `/uploads/${prefix}/${filename}` : `/uploads/${filename}`;
    
    return `${appUrl}${relativeUrl}`;
  }
}
