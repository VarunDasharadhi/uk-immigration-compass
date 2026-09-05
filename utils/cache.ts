/**
 * Session-scoped in-memory cache. Tab components remount on every switch,
 * which would otherwise refetch the same data and flash loading skeletons.
 * Seeding component state from here makes repeat visits render instantly;
 * live feeds still refresh in the background on mount.
 */
const store = new Map<string, unknown>();

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, value);
}

export function cacheHas(key: string): boolean {
  return store.has(key);
}

export function cacheKeys(): string[] {
  return [...store.keys()];
}

export function cacheDelete(key: string): void {
  store.delete(key);
}
