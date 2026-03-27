/**
 * Browser-safe randomness using crypto.getRandomValues (avoids Math.random for static analysis).
 */

function readUint32(): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0] ?? 0
}

/** Uniform integer in [0, maxExclusive). */
export function randomIntBelow(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0
  return readUint32() % maxExclusive
}

/** Short base-36 segment for IDs (not cryptographically strong as a whole ID; use with timestamp prefix). */
export function randomIdSegment(): string {
  return readUint32().toString(36).slice(2, 9)
}

/** Integer in [minInclusive, maxInclusive]. */
export function randomIntInclusive(minInclusive: number, maxInclusive: number): number {
  if (maxInclusive <= minInclusive) return minInclusive
  const span = maxInclusive - minInclusive + 1
  return minInclusive + randomIntBelow(span)
}
