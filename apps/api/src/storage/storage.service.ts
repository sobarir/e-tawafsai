export abstract class StorageService {
  abstract uploadFile(
    file: Buffer,
    filename: string,
    mimeType: string,
    prefix?: string,
  ): Promise<string>;
}
