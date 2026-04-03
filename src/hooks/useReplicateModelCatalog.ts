import { useEffect, useMemo, useState } from 'react'
import { fetchReplicateHealth, listModelsCatalog, type ReplicateCatalogRow } from '@/lib/replicate-service'

export interface ReplicateSelectorOption {
  id: string
  label: string
  description: string
}

/**
 * Loads Replicate public models from the Jarvis bridge when `REPLICATE_API_TOKEN` is set server-side.
 * IDs are prefixed with `replicate:` for the chat model selector; {@link resolveLlmRoutingModel} maps them to GPT-4o mini for `/api/llm`.
 */
export function useReplicateModelCatalog(maxTotal = 2000) {
  const [rows, setRows] = useState<ReplicateCatalogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const h = await fetchReplicateHealth()
        if (cancelled) return
        if (!h || h.status !== 'ok' || !h.token_configured) {
          setEnabled(false)
          setRows([])
          return
        }
        setEnabled(true)
        const data = await listModelsCatalog(maxTotal)
        if (!cancelled) setRows(data.results ?? [])
      } catch {
        if (!cancelled) {
          setEnabled(false)
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [maxTotal])

  const selectorOptions: ReplicateSelectorOption[] = useMemo(
    () =>
      rows.map((r) => ({
        id: `replicate:${r.name}`,
        label: `Replicate · ${r.name}`,
        description: r.description,
      })),
    [rows],
  )

  return { loading, enabled, selectorOptions, count: rows.length }
}
