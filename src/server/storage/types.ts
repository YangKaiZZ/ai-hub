/**
 * Object storage abstraction. Keys are opaque strings owned by the app
 * (`<userId>/<documentId>.<ext>`), so switching from local disk to S3/GCS is a
 * provider swap with no data-model change.
 */
export interface StoredObject {
  key: string;
  sizeBytes: number;
  mimeType: string;
}

export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer, mimeType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
