import { env } from "@/lib/env";
import { LocalStorageProvider } from "@/server/storage/local";
import type { StorageProvider } from "@/server/storage/types";

let provider: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (provider) return provider;
  switch (env.STORAGE_PROVIDER) {
    case "local":
    default:
      provider = new LocalStorageProvider(env.STORAGE_LOCAL_DIR);
  }
  return provider;
}

export function setStorage(next: StorageProvider | undefined) {
  provider = next;
}

export type { StorageProvider, StoredObject } from "@/server/storage/types";
