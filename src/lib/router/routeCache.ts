/**
 * LRU-style cache for semantic router outcomes, keyed by a normalised message prefix.
 * Reduces repeated embedding work for identical or near-identical inputs within a TTL window.
 */

/** Stored classification snapshot (without full {@link RouteResult} debug fields). */
export interface CachedRoute {
  route: string
  confidence: number
  method: string
  /** Epoch ms when the entry was written (used with {@link CACHE_TTL_MS}). */
  cachedAt: number
}

/** Time-to-live for a cache entry (5 minutes). */
export const CACHE_TTL_MS = 5 * 60 * 1000

/** Default upper bound on distinct keys. */
export const MAX_CACHE_SIZE = 200

const KEY_MAX_LEN = 200

function normaliseKey(message: string): string {
  return message.trim().toLowerCase().slice(0, KEY_MAX_LEN)
}

function firstMapKey<K, V>(map: Map<K, V>): K | undefined {
  const it = map.keys().next()
  return it.done ? undefined : it.value
}

/**
 * Map-backed LRU: insertion order is the eviction order; {@link get} / {@link set} refresh
 * an entry by re-inserting it at the end.
 */
export class RouteCache {
  private readonly store: Map<string, CachedRoute> = new Map()
  private readonly maxSize: number
  private hits = 0
  private misses = 0

  /**
   * @param maxSize - Maximum distinct keys (defaults to {@link MAX_CACHE_SIZE})
   */
  constructor(maxSize: number = MAX_CACHE_SIZE) {
    this.maxSize = maxSize
  }

  /**
   * @param message - Raw user text (normalised for lookup)
   * @returns A fresh entry after an LRU hit, or `null` on miss / expiry
   */
  get(message: string): CachedRoute | null {
    const key = normaliseKey(message)
    const entry = this.store.get(key)
    if (entry === undefined) {
      this.misses += 1
      return null
    }
    if (entry.cachedAt + CACHE_TTL_MS <= Date.now()) {
      this.store.delete(key)
      this.misses += 1
      return null
    }
    this.store.delete(key)
    this.store.set(key, entry)
    this.hits += 1
    return entry
  }

  /**
   * Inserts or replaces an entry. Evicts the oldest key when at capacity and the key is new.
   * Always stamps {@link CachedRoute.cachedAt} to `Date.now()` at insert time.
   *
   * @param message - Raw user text
   * @param result - Route payload (timestamp owned by the cache)
   */
  set(message: string, result: CachedRoute): void {
    const key = normaliseKey(message)
    const hadKey = this.store.has(key)
    if (!hadKey && this.store.size >= this.maxSize) {
      const oldest = firstMapKey(this.store)
      if (oldest !== undefined) {
        this.store.delete(oldest)
      }
    }
    if (hadKey) {
      this.store.delete(key)
    }
    this.store.set(key, {
      ...result,
      cachedAt: Date.now(),
    })
  }

  /** Remove every entry and leave hit/miss counters unchanged. */
  clear(): void {
    this.store.clear()
  }

  /**
   * @returns Current footprint, configured cap, and hit rate as a percentage string
   */
  getStats(): { size: number; maxSize: number; hitRate: string } {
    const total = this.hits + this.misses
    const hitRate =
      total === 0 ? 'n/a' : `${((100 * this.hits) / total).toFixed(1)}%`
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      hitRate,
    }
  }
}

/** Shared cache for the semantic router pipeline. */
export const routeCache = new RouteCache()
