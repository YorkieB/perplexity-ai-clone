/** Trim and strip accidental `Bearer ` prefix if the user pasted a full header. */
export function sanitizeDoToken(raw: string): string {
  let t = raw.trim()
  if (t.toLowerCase().startsWith('bearer ')) {
    t = t.slice(7).trim()
  }
  return t
}
