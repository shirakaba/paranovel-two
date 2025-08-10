export interface StorageBase<T extends { schemaVersion: number; value: any }> {
  key: string;
  get: () => Promise<T['value'] | null>;
  set: (value: T['value']) => Promise<void>;
  clear: () => Promise<void>;
}
